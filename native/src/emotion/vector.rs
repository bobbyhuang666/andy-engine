use super::config::{BehaviorParams, EmotionConfig};
use super::constants::*;
use super::EmotionDimension;
use rand::Rng;

/// Contagion input from another agent
pub struct ContagionInput {
    pub emotion: [f64; NUM_DIMS],
    pub weight: f64,
    pub expressiveness: f64,
}

/// Multi-dimensional emotion vector (30 dimensions, Cowen & Keltner 2017)
///
/// SoA layout: each field is a contiguous [f64; 30] array.
/// Scratch buffers are embedded to avoid heap allocation in the hot path.
pub struct EmotionVector {
    // ── SoA arrays (30 x f64) ──
    pub current: [f64; NUM_DIMS],
    pub mood: [f64; NUM_DIMS],
    pub baseline: [f64; NUM_DIMS],

    // ── Scalar state ──
    pub stress: f64,

    // ── Pink noise internal state ──
    pub pink_noise_state: [f64; PINK_NOISE_TAPS],

    // ── Scratch buffers (reused across ticks) ──
    pre_tick_values: [f64; NUM_DIMS],
}

// All constants (NON_NEGATIVE, POSITIVE_INDICES, NEGATIVE_INDICES_DECAY,
// HIGH_AROUSAL_INDICES, LOW_AROUSAL_INDICES, CO_ACTIVATION_INDICES,
// OPPOSITION_PAIRS_INDICES) are now imported from constants.rs
// via `use super::constants::*;` above.
// To regenerate: `node native/scripts/gen-constants.js`

impl EmotionVector {
    /// Create a new EmotionVector from baseline values
    pub fn new(baseline: [f64; NUM_DIMS], stress: f64) -> Self {
        Self {
            current: baseline,
            mood: baseline,
            baseline,
            stress,
            pink_noise_state: [0.0; PINK_NOISE_TAPS],
            pre_tick_values: [0.0; NUM_DIMS],
        }
    }

    /// Restore from saved state
    pub fn from_saved(
        current: [f64; NUM_DIMS],
        mood: [f64; NUM_DIMS],
        baseline: [f64; NUM_DIMS],
        stress: f64,
        pink_noise_state: [f64; PINK_NOISE_TAPS],
    ) -> Self {
        Self {
            current,
            mood,
            baseline,
            stress,
            pink_noise_state,
            pre_tick_values: [0.0; NUM_DIMS],
        }
    }

    // ═══════════════════════════════════════════
    // Core Tick Pipeline (10 steps)
    // ═══════════════════════════════════════════

    /// Full tick — advances emotion state by one time step
    pub fn tick<R: Rng>(
        &mut self,
        hours_elapsed: f64,
        hour_of_day: f64,
        config: &EmotionConfig,
        behavior: &BehaviorParams,
        contagion_inputs: Option<&[ContagionInput]>,
        rng: &mut R,
    ) {
        self.time_decay(hours_elapsed, config, behavior);
        self.circadian_modulation(hour_of_day, config);
        self.pink_noise_drift(config, rng);
        self.co_activation_spread(config);
        self.opposition_damping();
        self.inertia_filter(config);

        // Snapshot pre-tick values (after inertia, before contagion)
        self.pre_tick_values.copy_from_slice(&self.current);

        if let Some(inputs) = contagion_inputs {
            self.social_contagion(inputs, behavior);
        }

        self.baseline_drift(config);
        self.velocity_limit(config);
        self.clamp();
    }

    // ── Step 1: Time Decay (3-layer architecture) ──
    // 使用 IS_POSITIVE/IS_NEGATIVE_DECAY 位掩码替代 binary_search，
    // 消除循环内函数调用阻碍，使 LLVM 能自动 SIMD 向量化 exp() 和乘法。
    fn time_decay(&mut self, dt: f64, config: &EmotionConfig, behavior: &BehaviorParams) {
        let lambda = if behavior.emotion_decay_rate > 0.0 {
            behavior.emotion_decay_rate
        } else {
            config.decay_lambda
        };

        let hedonic_adapt = 1.2_f64;
        let negativity_bias = 0.7_f64;

        // current → mood (fast decay)
        // 位掩码查表 O(1) — 无分支、无函数调用，LLVM 可向量化整个循环
        for i in 0..NUM_DIMS {
            let mood_level = self.mood[i];
            let current = self.current[i];
            let excess = current - mood_level;

            let mut effective_lambda = lambda;
            if excess > 0.0 && IS_POSITIVE[i] {
                effective_lambda = lambda * hedonic_adapt;
            } else if excess < 0.0 && IS_NEGATIVE_DECAY[i] {
                effective_lambda = lambda * negativity_bias;
            }

            let factor = (-effective_lambda * dt).exp();
            self.current[i] = mood_level + (current - mood_level) * factor;
        }

        // mood → baseline (slow decay)
        let base_mood_lambda = lambda / 6.0;
        for i in 0..NUM_DIMS {
            let base = self.baseline[i];
            let mood_excess = self.mood[i] - base;
            let mut mood_lambda = base_mood_lambda;
            if mood_excess < 0.0 && IS_NEGATIVE_DECAY[i] {
                mood_lambda *= negativity_bias;
            }
            let factor = (-mood_lambda * dt).exp();
            self.mood[i] = base + (self.mood[i] - base) * factor;
        }

        // Mood clamping (non-negative dims + [-1, 1])
        for i in 0..NUM_DIMS {
            let lower = if NON_NEGATIVE[i] { 0.0 } else { -1.0 };
            self.mood[i] = self.mood[i].max(lower).min(1.0);
        }
    }

    // ── Step 2: Circadian Modulation ──
    fn circadian_modulation(&mut self, hour: f64, config: &EmotionConfig) {
        let two_pi_over_24 = 2.0 * std::f64::consts::PI / 24.0;
        let alpha = 0.05_f64;

        let pa_offset = config.circadian.positive_affect_amp
            * (two_pi_over_24 * (hour - config.circadian.positive_affect_peak)).cos();
        let na_offset = config.circadian.negative_affect_amp
            * (two_pi_over_24 * (hour - config.circadian.negative_affect_peak)).cos();

        // Positive emotions
        for &i in &CIRCADIAN_POSITIVE_INDICES {
            let target = self.baseline[i] + pa_offset;
            self.current[i] = (1.0 - alpha) * self.current[i] + alpha * target;
        }

        // Negative emotions
        for &i in &CIRCADIAN_NEGATIVE_INDICES {
            let target = self.baseline[i] + na_offset;
            self.current[i] = (1.0 - alpha) * self.current[i] + alpha * target;
        }

        // Late-night special modulation
        if hour >= 23.0 || hour < 5.0 {
            let calm_idx = EmotionDimension::Calm as usize;
            let lonely_idx = EmotionDimension::Loneliness as usize;
            self.current[calm_idx] = (1.0 - 0.02) * self.current[calm_idx] + 0.02 * 0.4;
            self.current[lonely_idx] = (1.0 - 0.02) * self.current[lonely_idx] + 0.02 * 0.2;
        }
    }

    // ── Step 3: Pink Noise Drift ──
    // 优化：批量预生成随机数，减少 RNG 调用次数（从 ~30+ 次降到 1 次 fill）
    fn pink_noise_drift<R: Rng>(&mut self, config: &EmotionConfig, rng: &mut R) {
        let amp = config.noise_amplitude;
        let n = PINK_NOISE_TAPS;

        // 批量生成所有随机数：1 (white) + 16 (pink state update flags) + 16 (pink values) + 1 (num_to_drift) + 6 (max indices) = 40
        let mut rand_buf = [0.0_f64; 40];
        for v in rand_buf.iter_mut() {
            *v = rng.gen::<f64>();
        }

        // White noise source
        let white = (rand_buf[0] * 2.0 - 1.0) * amp;

        // Update pink noise state
        let mut sum = white;
        for i in 0..n {
            if rand_buf[1 + i] < 0.5 {
                self.pink_noise_state[i] = (rand_buf[1 + n + i] * 2.0 - 1.0) * amp;
            }
            sum += self.pink_noise_state[i];
        }
        let noise = sum / (n as f64 + 1.0);

        // Randomly select 3-6 dimensions to apply noise
        let rand_idx_base = 1 + n * 2; // offset into rand_buf
        let num_to_drift = 3 + (rand_buf[rand_idx_base] * 4.0) as usize;
        for k in 0..num_to_drift.min(6) {
            let buf_idx = rand_idx_base + 1 + k;
            if buf_idx >= 40 { break; }
            let idx = (rand_buf[buf_idx] * NUM_DIMS as f64) as usize;
            if idx >= NUM_DIMS { continue; }
            let current = self.current[idx];
            let base = self.baseline[idx];

            // Mean reversion force
            let deviation = current - base;
            let reversion_strength = (deviation.abs() * 0.8 + 0.005).min(0.5);
            let reversion = -deviation * reversion_strength;

            self.current[idx] = current + noise + reversion;
        }
    }

    // ── Step 4: Co-activation Spread ──
    fn co_activation_spread(&mut self, config: &EmotionConfig) {
        let weight = config.co_activation_weight;
        let mut deltas = [0.0_f64; NUM_DIMS];

        // Use snapshot to prevent read-write ordering issues
        let snapshot = self.current;

        for &(source, targets) in CO_ACTIVATION_INDICES {
            let source_intensity = snapshot[source];
            if source_intensity.abs() < 0.15 {
                continue;
            }

            for &target in targets {
                if source == target { continue; }
                deltas[target] += source_intensity * weight * 0.05;
            }
        }

        // Apply clamped deltas
        for i in 0..NUM_DIMS {
            let clamped = deltas[i].max(-0.02).min(0.02);
            self.current[i] += clamped;
        }
    }

    // ── Step 5: Opposition Damping ──
    fn opposition_damping(&mut self) {
        let alpha = 0.25_f64;
        let snapshot = self.current;

        for &(idx_a, idx_b) in OPPOSITION_PAIRS_INDICES {
            let val_a = snapshot[idx_a];
            let val_b = snapshot[idx_b];

            // A suppresses B
            if val_a > 0.1 {
                let factor = if val_b > 0.0 { 1.0 } else { 0.3 };
                self.current[idx_b] -= alpha * val_a * factor;
            }
            // B suppresses A
            if val_b > 0.1 {
                let factor = if val_a > 0.0 { 1.0 } else { 0.3 };
                self.current[idx_a] -= alpha * val_b * factor;
            }

            // Clamp each
            self.current[idx_a] = self.current[idx_a].max(-1.0).min(1.0);
            self.current[idx_b] = self.current[idx_b].max(-1.0).min(1.0);
        }
    }

    // ── Step 6: Inertia Filter ──
    fn inertia_filter(&mut self, config: &EmotionConfig) {
        let max_delta = config.max_delta_per_tick;
        for i in 0..NUM_DIMS {
            let val = self.current[i];
            let base = self.baseline[i];
            let dist = val - base;

            if dist.abs() > 0.6 {
                let pull_strength = max_delta * (1.0 + (dist.abs() - 0.6) * 2.0);
                self.current[i] = base + dist * (1.0 - pull_strength);
            }
        }
    }

    // ── Step 7: Social Contagion ──
    // 使用 IS_NEGATIVE_DECAY 位掩码替代 binary_search，消除内层循环函数调用
    fn social_contagion(&mut self, inputs: &[ContagionInput], behavior: &BehaviorParams) {
        let susceptibility = behavior.susceptibility;
        let negativity_bias = 1.4_f64;

        for input in inputs {
            let effective_weight = susceptibility * input.expressiveness * input.weight;

            for i in 0..NUM_DIMS {
                let their_val = input.emotion[i];
                let my_val = self.current[i];
                let diff = their_val - my_val;

                if diff.abs() > 0.05 {
                    // 位掩码查表 O(1) — 无函数调用，内层循环可向量化
                    let is_negative = IS_NEGATIVE_DECAY[i] && their_val < my_val;
                    let contagion_rate = if is_negative { 0.3 * negativity_bias } else { 0.3 };
                    self.current[i] = my_val + diff * effective_weight * contagion_rate;
                }
            }
        }
    }

    // ── Step 8: Baseline Drift ──
    fn baseline_drift(&mut self, config: &EmotionConfig) {
        let rate = config.baseline_drift_rate;
        for i in 0..NUM_DIMS {
            let current = self.current[i];
            let base = self.baseline[i];
            if current.abs() > 0.5 {
                self.baseline[i] = base + (current - base) * rate;
            }
        }
    }

    // ── Step 9: Velocity Limit ──
    // 无分支重构：用 f64::copysign + select 替代嵌套 if/continue，
    // 消除循环内控制流阻碍 SIMD 向量化
    fn velocity_limit(&mut self, config: &EmotionConfig) {
        let max_velocity = config.max_delta_per_tick;
        for i in 0..NUM_DIMS {
            let prev = self.pre_tick_values[i];
            let curr = self.current[i];
            let base = self.baseline[i];
            let delta = curr - prev;

            if delta.abs() > max_velocity {
                let prev_dist = (prev - base).abs();
                let curr_dist = (curr - base).abs();
                // Approaching baseline → allow (natural decay)
                // Moving away → clamp to max_velocity
                if curr_dist >= prev_dist {
                    self.current[i] = prev + max_velocity.copysign(delta);
                }
            }
        }
    }

    // ── Step 10: Clamp ──
    fn clamp(&mut self) {
        for i in 0..NUM_DIMS {
            let lower = if NON_NEGATIVE[i] { 0.0 } else { -1.0 };
            self.current[i] = self.current[i].max(lower).min(1.0);
        }
        self.stress = self.stress.max(0.0).min(10.0);
    }

    // ═══════════════════════════════════════════
    // External Effects
    // ═══════════════════════════════════════════

    /// Apply emotional effects from events
    pub fn apply_effect(
        &mut self,
        effects: &[(usize, f64)],      // (dim_index, delta)
        multiplier: f64,
        appraisal_modifiers: Option<&[(usize, f64)]>, // (dim_index, modifier)
        config: &EmotionConfig,
        behavior: &BehaviorParams,
    ) {
        let inertia = behavior.emotional_inertia;
        let max_delta = config.max_delta_per_tick;

        for &(dim, delta) in effects {
            if dim >= NUM_DIMS { continue; }

            let mut appraisal_mult = 1.0;
            if let Some(mods) = appraisal_modifiers {
                for &(mod_dim, mod_val) in mods {
                    if mod_dim == dim {
                        appraisal_mult = mod_val;
                        break;
                    }
                }
            }

            let effective_delta = delta * multiplier * appraisal_mult * (1.0 - inertia * 0.5);
            let clamped_delta = effective_delta.max(-max_delta).min(max_delta);
            self.current[dim] += clamped_delta;
            self.mood[dim] += clamped_delta * 0.1;
        }

        // Clamp current and mood
        for i in 0..NUM_DIMS {
            let lower = if NON_NEGATIVE[i] { 0.0 } else { -1.0 };
            self.current[i] = self.current[i].max(lower).min(1.0);
            self.mood[i] = self.mood[i].max(lower).min(1.0);
        }
        self.stress = self.stress.max(0.0).min(10.0);
    }

    /// Set stress value
    pub fn set_stress(&mut self, value: f64) {
        self.stress = value.max(0.0).min(10.0);
    }

    // ═══════════════════════════════════════════
    // Query Interface
    // ═══════════════════════════════════════════

    /// Get valence (positive/negative balance), range [-1, +1]
    /// Uses NEGATIVE_VALENCE_INDICES (10 dims, no boredom) matching JS getValence()
    pub fn get_valence(&self) -> f64 {
        let mut sum = 0.0;
        let mut count = 0;

        for &i in &POSITIVE_INDICES {
            sum += self.current[i];
            count += 1;
        }
        for &i in &NEGATIVE_VALENCE_INDICES {
            sum -= self.current[i];
            count += 1;
        }

        if count > 0 { sum / count as f64 } else { 0.0 }
    }

    /// Get arousal level, range [0, 1]
    pub fn get_arousal(&self) -> f64 {
        let mut arousal = 0.5_f64;
        for &i in &HIGH_AROUSAL_INDICES {
            arousal += self.current[i].abs() * 0.1;
        }
        for &i in &LOW_AROUSAL_INDICES {
            arousal -= self.current[i].abs() * 0.05;
        }
        arousal.max(0.0).min(1.0)
    }

    /// Get the N most dominant emotions (by absolute value).
    /// Uses stack-allocated arrays and partial selection — zero heap allocation.
    /// Returns (count, pairs) where `count` is the number of valid entries.
    pub fn get_dominant<const N: usize>(&self) -> (usize, [(usize, f64); N]) {
        let mut pairs = [(0usize, 0.0f64); N];
        let mut count = 0usize;

        for i in 0..NUM_DIMS {
            let abs_val = self.current[i].abs();

            // Find insertion position: pairs[0..count] is sorted descending by |value|
            let mut pos = count;
            for j in 0..count {
                if abs_val > pairs[j].1.abs() {
                    pos = j;
                    break;
                }
            }

            // Shift down if needed (count < N or we're inserting)
            if count < N {
                // Still filling — shift elements from pos..count right by 1
                let mut j = count;
                while j > pos {
                    pairs[j] = pairs[j - 1];
                    j -= 1;
                }
                pairs[pos] = (i, self.current[i]);
                count += 1;
            } else if pos < N {
                // Full — shift down and insert at pos
                let mut j = N - 1;
                while j > pos {
                    pairs[j] = pairs[j - 1];
                    j -= 1;
                }
                pairs[pos] = (i, self.current[i]);
            }
        }

        (count, pairs)
    }

    /// Backward-compatible wrapper returning Vec (for tests that use it)
    pub fn get_dominant_vec(&self, n: usize) -> Vec<(usize, f64)> {
        let n = n.min(NUM_DIMS);
        match n {
            1 => { let (c, p) = self.get_dominant::<1>(); p[..c].to_vec() }
            2 => { let (c, p) = self.get_dominant::<2>(); p[..c].to_vec() }
            3 => { let (c, p) = self.get_dominant::<3>(); p[..c].to_vec() }
            4 => { let (c, p) = self.get_dominant::<4>(); p[..c].to_vec() }
            5 => { let (c, p) = self.get_dominant::<5>(); p[..c].to_vec() }
            _ => {
                // Fallback for uncommon sizes — still uses stack array, Vec only for return
                let (c, p) = self.get_dominant::<8>();
                p[..c.min(n)].to_vec()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::emotion::config::{BehaviorParams, EmotionConfig};
    use rand::SeedableRng;
    use rand::rngs::SmallRng;

    fn default_config() -> EmotionConfig {
        EmotionConfig::default()
    }

    fn default_behavior() -> BehaviorParams {
        BehaviorParams::default()
    }

    #[test]
    fn test_initial_values_in_range() {
        let baseline = [0.1; NUM_DIMS];
        let ev = EmotionVector::new(baseline, 2.0);
        for i in 0..NUM_DIMS {
            assert!(ev.current[i] >= -1.0 && ev.current[i] <= 1.0);
            assert!(ev.mood[i] >= -1.0 && ev.mood[i] <= 1.0);
        }
    }

    #[test]
    fn test_tick_preserves_bounds() {
        let baseline = [0.05; NUM_DIMS];
        let mut ev = EmotionVector::new(baseline, 2.0);
        let config = default_config();
        let behavior = default_behavior();
        let mut rng = SmallRng::seed_from_u64(42);

        for _ in 0..100 {
            ev.tick(5.0 / 60.0, 14.0, &config, &behavior, None, &mut rng);
        }

        for i in 0..NUM_DIMS {
            let lower = if NON_NEGATIVE[i] { 0.0 } else { -1.0 };
            assert!(
                ev.current[i] >= lower && ev.current[i] <= 1.0,
                "dim {} out of bounds: {}", i, ev.current[i]
            );
        }
    }

    #[test]
    fn test_valence_range() {
        let baseline = [0.0; NUM_DIMS];
        let mut ev = EmotionVector::new(baseline, 2.0);
        let config = default_config();
        let behavior = default_behavior();
        let mut rng = SmallRng::seed_from_u64(42);

        for _ in 0..50 {
            ev.tick(5.0 / 60.0, 14.0, &config, &behavior, None, &mut rng);
            let v = ev.get_valence();
            assert!(v >= -1.0 && v <= 1.0, "valence out of range: {}", v);
        }
    }

    #[test]
    fn test_contagion_effect() {
        let baseline = [0.0; NUM_DIMS];
        let mut ev = EmotionVector::new(baseline, 2.0);
        let config = default_config();
        let behavior = default_behavior();
        let mut rng = SmallRng::seed_from_u64(42);

        let mut other_emotion = [0.0; NUM_DIMS];
        other_emotion[EmotionDimension::Joy as usize] = 0.8;

        let inputs = vec![ContagionInput {
            emotion: other_emotion,
            weight: 0.5,
            expressiveness: 0.5,
        }];

        ev.tick(5.0 / 60.0, 14.0, &config, &behavior, Some(&inputs), &mut rng);

        // Joy should have increased due to contagion
        assert!(
            ev.current[EmotionDimension::Joy as usize] > 0.0,
            "Joy should increase from contagion"
        );
    }
}
