/// SoA f32 Emotion Tick Engine
///
/// Architecture:
///   1. f32 precision — half memory, 2x SIMD throughput vs f64
///   2. Per-agent struct with [f32; 30] arrays — idiomatic Rust, rayon-friendly
///   3. Inner loops process 30 dims contiguously (cache-friendly, SIMD-vectorizable)
///   4. Outer loop parallelizes across agents (embarrassingly parallel)
///   5. GPU-ready: per-agent struct maps 1:1 to a workgroup/thread
///
/// Memory per agent: 30×4 (current) + 30×4 (mood) + 30×4 (baseline) + 16×4 (pink)
///                   + 4×4 (scalars) + 16 (flags) = 480 bytes
/// 1B agents = 480 GB (fits in 8× H100 80GB with graph partitioning)

use super::constants::*;
use super::config::EmotionConfig;
use rand::rngs::SmallRng;
use rand::Rng;

/// Single agent's emotion state in f32 SoA layout.
/// 600 bytes per agent (vs 920 bytes for f64 AoS).
pub struct F32Agent {
    pub current: [f32; NUM_DIMS],
    pub mood: [f32; NUM_DIMS],
    pub baseline: [f32; NUM_DIMS],
    pub pre_tick: [f32; NUM_DIMS], // snapshot before contagion for velocity_limit
    pub stress: f32,
    pub decay_rate: f32,
    pub inertia: f32,
    pub susceptibility: f32,
    pub expressiveness: f32,
    pub pink_state: [f32; 16],
    pub active: bool,
    pub rng: SmallRng,
}

impl F32Agent {
    pub fn new(baseline: [f32; NUM_DIMS], rng: SmallRng) -> Self {
        Self {
            current: baseline,
            mood: baseline,
            baseline,
            pre_tick: baseline,
            stress: 2.0,
            decay_rate: 0.5,
            inertia: 0.3,
            susceptibility: 0.4,
            expressiveness: 0.5,
            pink_state: [0.0; 16],
            active: true,
            rng,
        }
    }
}

// ═══════════════════════════════════════════
// SoA Tick Pipeline — All steps in f32, parallelized across agents
// ═══════════════════════════════════════════

/// Full f32 tick for all agents. No contagion.
/// Parallelizes across agents using rayon — each agent is independent.
/// Pipeline matches f64 EmotionVector::tick (steps 1-6, 8-10, no contagion).
pub fn f32_tick_no_contagion(agents: &mut [F32Agent], config: &EmotionConfig, dt: f32, hour: f32) {
    use rayon::prelude::*;

    agents.par_iter_mut().for_each(|agent| {
        if !agent.active { return; }

        let lambda = agent.decay_rate.max(0.1);

        // Step 1: Time Decay (current→mood, mood→baseline)
        f32_time_decay(&mut agent.current, &agent.mood, &agent.baseline, lambda, dt);
        f32_mood_decay(&agent.current, &mut agent.mood, &agent.baseline, lambda, dt);

        // Step 2: Circadian Modulation
        f32_circadian(&mut agent.current, &agent.baseline, hour, config);

        // Step 3: Pink Noise Drift
        f32_pink_noise(&mut agent.current, &agent.baseline, &mut agent.pink_state, config, &mut agent.rng);

        // Step 4: Co-activation Spread
        f32_coactivation(&mut agent.current, config);

        // Step 5: Opposition Damping
        f32_opposition(&mut agent.current);

        // Step 6: Inertia Filter
        f32_inertia(&mut agent.current, &agent.baseline, config);

        // Snapshot for velocity_limit (after inertia, before contagion)
        agent.pre_tick.copy_from_slice(&agent.current);

        // Step 7: No contagion (skip)

        // Step 8: Baseline Drift
        f32_baseline_drift(&mut agent.current, &mut agent.baseline, config);

        // Step 9: Velocity Limit
        f32_velocity_limit(&mut agent.current, &agent.pre_tick, &agent.baseline, config);

        // Step 10: Clamp
        f32_clamp(&mut agent.current);
    });
}

/// Full f32 tick WITH graph-based social contagion.
/// Steps 1-6 are individual (parallel), step 7 is graph-dependent,
/// steps 8-10 are individual again (parallel).
pub fn f32_tick_with_contagion(
    agents: &mut [F32Agent],
    config: &EmotionConfig,
    dt: f32,
    hour: f32,
    graph_offsets: &[u32],
    graph_neighbors: &[u32],
    graph_levels: &[u8],
    graph_strengths: &[f32],
    tick_count: u32,
) {
    use rayon::prelude::*;

    // Step 1-6: Individual updates (parallel, no graph dependency)
    agents.par_iter_mut().for_each(|agent| {
        if !agent.active { return; }

        let lambda = agent.decay_rate.max(0.1);

        f32_time_decay(&mut agent.current, &agent.mood, &agent.baseline, lambda, dt);
        f32_mood_decay(&agent.current, &mut agent.mood, &agent.baseline, lambda, dt);
        f32_circadian(&mut agent.current, &agent.baseline, hour, config);
        f32_pink_noise(&mut agent.current, &agent.baseline, &mut agent.pink_state, config, &mut agent.rng);
        f32_coactivation(&mut agent.current, config);
        f32_opposition(&mut agent.current);
        f32_inertia(&mut agent.current, &agent.baseline, config);

        // Snapshot after inertia, before contagion
        agent.pre_tick.copy_from_slice(&agent.current);
    });

    // Step 7: Social contagion (graph-dependent, separate pass)
    f32_social_contagion(agents, graph_offsets, graph_neighbors, graph_levels, graph_strengths, tick_count);

    // Step 8-10: Post-contagion steps (parallel)
    agents.par_iter_mut().for_each(|agent| {
        if !agent.active { return; }

        f32_baseline_drift(&mut agent.current, &mut agent.baseline, config);
        f32_velocity_limit(&mut agent.current, &agent.pre_tick, &agent.baseline, config);
        f32_clamp(&mut agent.current);
    });
}

// ═══════════════════════════════════════════
// Per-Agent Step Functions (operating on [f32; 30] slices)
// ═══════════════════════════════════════════

/// Step 1: Time Decay — exponential decay of current toward mood, mood toward baseline.
/// GPU kernel candidate: 30 exp() + 30 multiply per agent.
#[inline]
fn f32_time_decay(current: &mut [f32], mood: &[f32], baseline: &[f32], lambda: f32, dt: f32) {
    let hedonic_adapt: f32 = 1.2;
    let negativity_bias: f32 = 0.7;

    // current → mood (fast decay)
    for i in 0..NUM_DIMS {
        let excess = current[i] - mood[i];
        let mut eff_lambda = lambda;
        if excess > 0.0 && IS_POSITIVE[i] {
            eff_lambda = lambda * hedonic_adapt;
        } else if excess < 0.0 && IS_NEGATIVE_DECAY[i] {
            eff_lambda = lambda * negativity_bias;
        }
        let factor = (-eff_lambda * dt).exp();
        current[i] = mood[i] + excess * factor;
    }

    // mood → baseline (slow decay, 6x slower)
    let mood_lambda = lambda / 6.0;
    for i in 0..NUM_DIMS {
        let excess = mood[i] - baseline[i];
        let mut ml = mood_lambda;
        if excess < 0.0 && IS_NEGATIVE_DECAY[i] {
            ml *= negativity_bias;
        }
        let factor = (-ml * dt).exp();
        // NOTE: we can't mutate mood in-place here since current reads mood above.
        // In SoA, mood is a separate array so this is fine — we write to a temp.
        // But since we already read all mood values above, we need to be careful.
        // Solution: compute new_mood values first, then write.
        // For simplicity, we use the already-read values (mood hasn't changed yet in this function).
        let new_mood = baseline[i] + excess * factor;
        // We can't write to mood slice since it's borrowed immutably.
        // This is handled by the caller — mood decay is done separately.
        let _ = new_mood;
    }

    // Mood clamping
    // Same issue — mood is immutable borrow. Caller handles this.
}

/// Separate mood decay function (called after current decay)
#[inline]
fn f32_mood_decay(
    _current: &[f32],
    mood: &mut [f32],
    baseline: &[f32],
    lambda: f32,
    dt: f32,
) {
    let negativity_bias: f32 = 0.7;
    let mood_lambda = lambda / 6.0;

    for i in 0..NUM_DIMS {
        let excess = mood[i] - baseline[i];
        let mut ml = mood_lambda;
        if excess < 0.0 && IS_NEGATIVE_DECAY[i] {
            ml *= negativity_bias;
        }
        let factor = (-ml * dt).exp();
        mood[i] = baseline[i] + excess * factor;
    }

    // Mood clamping
    for i in 0..NUM_DIMS {
        let lower = if NON_NEGATIVE[i] { 0.0 } else { -1.0 };
        mood[i] = mood[i].clamp(lower, 1.0);
    }
}

/// Step 2: Circadian Modulation — sinusoidal modulation based on time of day.
/// GPU kernel candidate: 2 cos() for global, 12 multiply-add for positive, 6 for negative.
#[inline]
fn f32_circadian(current: &mut [f32], baseline: &[f32], hour: f32, config: &EmotionConfig) {
    let two_pi_over_24: f32 = 2.0 * core::f32::consts::PI / 24.0;
    let alpha: f32 = 0.05;

    let pa_offset = config.circadian.positive_affect_amp as f32
        * (two_pi_over_24 * (hour - config.circadian.positive_affect_peak as f32)).cos();
    let na_offset = config.circadian.negative_affect_amp as f32
        * (two_pi_over_24 * (hour - config.circadian.negative_affect_peak as f32)).cos();

    for &i in &CIRCADIAN_POSITIVE_INDICES {
        let target = baseline[i] + pa_offset;
        current[i] = (1.0 - alpha) * current[i] + alpha * target;
    }

    for &i in &CIRCADIAN_NEGATIVE_INDICES {
        let target = baseline[i] + na_offset;
        current[i] = (1.0 - alpha) * current[i] + alpha * target;
    }

    // Late-night special modulation
    if hour >= 23.0 || hour < 5.0 {
        let calm_idx = 23usize; // Calm
        let lonely_idx = 29usize; // Loneliness
        current[calm_idx] = (1.0 - 0.02) * current[calm_idx] + 0.02 * 0.4;
        current[lonely_idx] = (1.0 - 0.02) * current[lonely_idx] + 0.02 * 0.2;
    }
}

/// Step 3: Pink Noise Drift — 1/f noise + mean reversion.
/// GPU kernel candidate: batch RNG (cuRAND/SIMD-friendly), 30 add per agent.
#[inline]
fn f32_pink_noise(
    current: &mut [f32],
    baseline: &[f32],
    pink_state: &mut [f32],
    config: &EmotionConfig,
    rng: &mut SmallRng,
) {
    let amp = config.noise_amplitude as f32;
    let n_taps = PINK_NOISE_TAPS;

    // Batch RNG
    let mut rand_buf = [0.0_f32; 40];
    for v in rand_buf.iter_mut() {
        *v = rng.gen::<f32>();
    }

    let white = (rand_buf[0] * 2.0 - 1.0) * amp;

    let mut sum = white;
    for i in 0..n_taps {
        if rand_buf[1 + i] < 0.5 {
            pink_state[i] = (rand_buf[1 + n_taps + i] * 2.0 - 1.0) * amp;
        }
        sum += pink_state[i];
    }
    let noise = sum / (n_taps as f32 + 1.0);

    let rand_idx_base = 1 + n_taps * 2;
    let num_to_drift = 3 + (rand_buf[rand_idx_base] * 4.0) as usize;
    for k in 0..num_to_drift.min(6) {
        let buf_idx = rand_idx_base + 1 + k;
        if buf_idx >= 40 { break; }
        let idx = (rand_buf[buf_idx] * NUM_DIMS as f32) as usize;
        if idx >= NUM_DIMS { continue; }

        let deviation = current[idx] - baseline[idx];
        let reversion_strength = (deviation.abs() * 0.8 + 0.005).min(0.5);
        let reversion = -deviation * reversion_strength;
        current[idx] += noise + reversion;
    }
}

/// Step 4: Co-activation Spread — emotions trigger related emotions.
/// GPU kernel candidate: sparse scatter via CO_ACTIVATION_INDICES table.
#[inline]
fn f32_coactivation(current: &mut [f32], config: &EmotionConfig) {
    let weight: f32 = config.co_activation_weight as f32 * 0.05;
    let mut deltas = [0.0f32; NUM_DIMS];
    let mut snapshot = [0.0f32; NUM_DIMS];
    snapshot.copy_from_slice(current);

    for &(source, targets) in CO_ACTIVATION_INDICES {
        let intensity = snapshot[source];
        if intensity.abs() < 0.15 {
            continue;
        }
        for &target in targets {
            if source == target { continue; }
            deltas[target] += intensity * weight;
        }
    }

    for i in 0..NUM_DIMS {
        current[i] += deltas[i].clamp(-0.02, 0.02);
    }
}

/// Step 5: Opposition Damping — opposing emotions suppress each other.
/// GPU kernel candidate: small fixed-size scatter (8 pairs × 2 updates).
#[inline]
fn f32_opposition(current: &mut [f32]) {
    let alpha: f32 = 0.25;
    let mut snapshot = [0.0f32; NUM_DIMS];
    snapshot.copy_from_slice(current);

    for &(idx_a, idx_b) in OPPOSITION_PAIRS_INDICES {
        let va = snapshot[idx_a];
        let vb = snapshot[idx_b];

        if va > 0.1 {
            let factor = if vb > 0.0 { 1.0 } else { 0.3 };
            current[idx_b] -= alpha * va * factor;
        }
        if vb > 0.1 {
            let factor = if va > 0.0 { 1.0 } else { 0.3 };
            current[idx_a] -= alpha * vb * factor;
        }

        current[idx_a] = current[idx_a].clamp(-1.0, 1.0);
        current[idx_b] = current[idx_b].clamp(-1.0, 1.0);
    }
}

/// Step 6: Inertia Filter — emotions far from baseline get pulled back.
/// Matches f64 inertia_filter: only applies pull-back when |dist| > 0.6.
#[inline]
fn f32_inertia(
    current: &mut [f32],
    baseline: &[f32],
    config: &EmotionConfig,
) {
    let max_delta = config.max_delta_per_tick as f32;

    for i in 0..NUM_DIMS {
        let val = current[i];
        let base = baseline[i];
        let dist = val - base;

        if dist.abs() > 0.6 {
            let pull_strength = max_delta * (1.0 + (dist.abs() - 0.6) * 2.0);
            current[i] = base + dist * (1.0 - pull_strength);
        }
    }
}

/// Step 7: Social Contagion — graph-based emotion spreading.
/// This is the most compute-intensive step and the main target for GPU optimization.
/// GPU kernel candidate: SpMV-like operation on emotion graph.
fn f32_social_contagion(
    agents: &mut [F32Agent],
    offsets: &[u32],
    neighbors: &[u32],
    levels: &[u8],
    strengths: &[f32],
    tick_count: u32,
) {
    use rayon::prelude::*;

    let n = agents.len();
    // Dunbar frequency table
    const FREQ: [u32; 3] = [1, 3, 12];
    let negativity_bias: f32 = 1.4;

    // Snapshot current states for read (avoid read-write conflict)
    // Each agent's current emotion + susceptibility + expressiveness
    let snapshot: Vec<([f32; NUM_DIMS], f32, f32)> = agents
        .iter()
        .map(|a| (a.current, a.susceptibility, a.expressiveness))
        .collect();

    // Parallel contagion: each agent reads neighbors from snapshot, writes to current
    agents.par_iter_mut().enumerate().for_each(|(i, agent)| {
        if !agent.active { return; }

        let susceptibility = agent.susceptibility;
        let start = offsets[i] as usize;
        let end = offsets[i + 1] as usize;

        for e in start..end {
            let level = levels[e];
            if level > 2 { continue; }
            if tick_count % FREQ[level as usize] != 0 { continue; }

            let nb = neighbors[e] as usize;
            if nb >= n { continue; }

            let weight = strengths[e];
            let (ref nb_current, _nb_suscept, nb_expr) = snapshot[nb];
            let eff_weight = susceptibility * nb_expr * weight;

            for d in 0..NUM_DIMS {
                let their_val = nb_current[d];
                let my_val = agent.current[d];
                let diff = their_val - my_val;
                if diff.abs() > 0.05 {
                    let is_neg = IS_NEGATIVE_DECAY[d] && their_val < my_val;
                    let rate = if is_neg { 0.3 * negativity_bias } else { 0.3 };
                    agent.current[d] += diff * eff_weight * rate;
                }
            }
        }
    });
}

/// Step 8: Baseline Drift — slow drift toward current emotional state.
/// GPU kernel candidate: 30 compare + conditional accumulate.
#[inline]
fn f32_baseline_drift(current: &mut [f32], baseline: &mut [f32], config: &EmotionConfig) {
    let rate = config.baseline_drift_rate as f32;
    for i in 0..NUM_DIMS {
        if current[i].abs() > 0.5 {
            baseline[i] += (current[i] - baseline[i]) * rate;
        }
    }
}

/// Step 9: Velocity Limit — cap per-tick change to max_delta_per_tick.
/// Allows approaching baseline (natural decay) but clamps moving away.
#[inline]
fn f32_velocity_limit(current: &mut [f32], pre_tick: &[f32], baseline: &[f32], config: &EmotionConfig) {
    let max_velocity = config.max_delta_per_tick as f32;
    for i in 0..NUM_DIMS {
        let prev = pre_tick[i];
        let curr = current[i];
        let base = baseline[i];
        let delta = curr - prev;

        if delta.abs() > max_velocity {
            let prev_dist = (prev - base).abs();
            let curr_dist = (curr - base).abs();
            // Approaching baseline → allow (natural decay)
            // Moving away → clamp to max_velocity
            if curr_dist >= prev_dist {
                current[i] = prev + max_velocity * delta.signum();
            }
        }
    }
}

/// Step 10: Clamp — keep all values in [-1, 1] range.
/// GPU kernel candidate: 30 clamp (single SIMD instruction per vector).
#[inline]
fn f32_clamp(current: &mut [f32]) {
    for i in 0..NUM_DIMS {
        let lower = if NON_NEGATIVE[i] { 0.0 } else { -1.0 };
        current[i] = current[i].clamp(lower, 1.0);
    }
}
