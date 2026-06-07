use napi_derive::napi;
use napi::bindgen_prelude::*;

use crate::emotion::{EmotionVector, NUM_DIMS, DIM_NAMES};
use crate::emotion::config::{EmotionConfig, BehaviorParams};
use crate::emotion::vector::ContagionInput;
use crate::needs::NeedsSystem;
use crate::needs::config::NeedsConfig;

use rand::SeedableRng;
use rand::rngs::SmallRng;
use rayon::prelude::*;
use std::sync::atomic::{AtomicU32, Ordering};

/// Global agent creation counter — each EmotionVectorJs instance gets a unique index.
/// Combined with rng_seed to produce per-agent unique seeds.
static AGENT_COUNTER: AtomicU32 = AtomicU32::new(0);

// ═══════════════════════════════════════════
// EmotionVectorJs
// ═══════════════════════════════════════════

#[napi]
pub struct EmotionVectorJs {
    inner: EmotionVector,
    config: EmotionConfig,
    behavior: BehaviorParams,
    rng: SmallRng,
}

#[napi]
impl EmotionVectorJs {
    #[napi(constructor)]
    pub fn new(
        behavior_json_str: String,
        config_json_str: String,
        saved_state_json_str: Option<String>,
        rng_seed: Option<u32>,
    ) -> Result<Self> {
        let behavior_json: serde_json::Value = serde_json::from_str(&behavior_json_str)
            .map_err(|e| Error::from_reason(format!("Invalid behavior JSON: {}", e)))?;
        let config_json: serde_json::Value = serde_json::from_str(&config_json_str)
            .map_err(|e| Error::from_reason(format!("Invalid config JSON: {}", e)))?;

        let behavior: BehaviorParams = serde_json::from_value(behavior_json.clone())
            .map_err(|e| Error::from_reason(format!("Invalid behavior config: {}", e)))?;
        let config: EmotionConfig = serde_json::from_value(config_json)
            .map_err(|e| Error::from_reason(format!("Invalid emotion config: {}", e)))?;

        let inner = match saved_state_json_str {
            Some(ref s) => {
                let state: serde_json::Value = serde_json::from_str(s)
                    .map_err(|e| Error::from_reason(format!("Invalid saved state: {}", e)))?;
                let current = extract_f64_array(&state, "current", [0.0; NUM_DIMS]);
                let mood = extract_f64_array(&state, "mood", [0.0; NUM_DIMS]);
                let baseline = extract_f64_array(&state, "baseline", [0.0; NUM_DIMS]);
                let stress = state.get("stress").and_then(|v| v.as_f64()).unwrap_or(2.0);
                let pink = extract_pink_noise(&state);
                EmotionVector::from_saved(current, mood, baseline, stress, pink)
            }
            None => {
                let baseline = extract_f64_array(&behavior_json, "emotionBaseline", [0.0; NUM_DIMS]);
                EmotionVector::new(baseline, 2.0)
            }
        };

        // Per-agent unique seed: base_seed XOR'ed with agent creation index.
        // If no seed provided, default to 42 (deterministic but now varied per agent).
        let base_seed = rng_seed.unwrap_or(42) as u64;
        let agent_idx = AGENT_COUNTER.fetch_add(1, Ordering::Relaxed) as u64;
        // Mix bits to avoid correlated sequences between agents
        let mixed = base_seed.wrapping_mul(0x517cc1b727220a95).wrapping_add(agent_idx);
        let rng = SmallRng::seed_from_u64(mixed);

        Ok(Self { inner, config, behavior, rng })
    }

    #[napi]
    pub fn tick(
        &mut self,
        hours_elapsed: f64,
        hour_of_day: f64,
        contagion_inputs_json: Option<String>,
    ) -> Result<()> {
        let contagion = match contagion_inputs_json {
            Some(s) => {
                let json: serde_json::Value = serde_json::from_str(&s)
                    .map_err(|e| Error::from_reason(format!("Invalid contagion JSON: {}", e)))?;
                Some(parse_contagion_inputs(&json)?)
            }
            None => None,
        };

        self.inner.tick(
            hours_elapsed,
            hour_of_day,
            &self.config,
            &self.behavior,
            contagion.as_deref(),
            &mut self.rng,
        );
        Ok(())
    }

    /// Combined sync+tick: takes current state + stress, runs tick, returns full JSON state.
    /// Eliminates 60+ boundary crossings per tick.
    #[napi]
    pub fn tick_full(
        &mut self,
        current_json_str: String,
        stress: f64,
        hours_elapsed: f64,
        hour_of_day: f64,
        contagion_inputs_json: Option<String>,
    ) -> Result<String> {
        // Set state from JSON
        let current_json: serde_json::Value = serde_json::from_str(&current_json_str)
            .map_err(|e| Error::from_reason(format!("Invalid current JSON: {}", e)))?;
        if let Some(obj) = current_json.as_object() {
            for (key, val) in obj {
                if let Some(idx) = crate::emotion::constants::dim_index(key) {
                    self.inner.current[idx] = val.as_f64().unwrap_or(0.0);
                }
            }
        }
        self.inner.set_stress(stress);

        // Parse contagion
        let contagion = match contagion_inputs_json {
            Some(s) => {
                let json: serde_json::Value = serde_json::from_str(&s)
                    .map_err(|e| Error::from_reason(format!("Invalid contagion JSON: {}", e)))?;
                Some(parse_contagion_inputs(&json)?)
            }
            None => None,
        };

        // Run tick
        self.inner.tick(
            hours_elapsed,
            hour_of_day,
            &self.config,
            &self.behavior,
            contagion.as_deref(),
            &mut self.rng,
        );

        // Return full state as JSON
        self.to_json()
    }

    /// Combined sync+apply_effect: takes current state + stress, applies effect, returns full JSON state.
    #[napi]
    pub fn apply_effect_full(
        &mut self,
        current_json_str: String,
        stress: f64,
        effects_json_str: String,
        multiplier: Option<f64>,
        appraisal_json_str: Option<String>,
    ) -> Result<String> {
        // Set state from JSON
        let current_json: serde_json::Value = serde_json::from_str(&current_json_str)
            .map_err(|e| Error::from_reason(format!("Invalid current JSON: {}", e)))?;
        if let Some(obj) = current_json.as_object() {
            for (key, val) in obj {
                if let Some(idx) = crate::emotion::constants::dim_index(key) {
                    self.inner.current[idx] = val.as_f64().unwrap_or(0.0);
                }
            }
        }
        self.inner.set_stress(stress);

        // Parse effects
        let effects_json: serde_json::Value = serde_json::from_str(&effects_json_str)
            .map_err(|e| Error::from_reason(format!("Invalid effects JSON: {}", e)))?;
        let effects = parse_effects(&effects_json)?;

        let appraisal = match appraisal_json_str {
            Some(s) => {
                let json: serde_json::Value = serde_json::from_str(&s)
                    .map_err(|e| Error::from_reason(format!("Invalid appraisal JSON: {}", e)))?;
                Some(parse_effects(&json)?)
            }
            None => None,
        };

        self.inner.apply_effect(
            &effects,
            multiplier.unwrap_or(1.0),
            appraisal.as_deref(),
            &self.config,
            &self.behavior,
        );

        self.to_json()
    }

    /// Binary fast-path: takes f64 buffer [30 dims + 1 stress = 31 doubles],
    /// runs tick, returns f64 buffer [30 current + 30 mood + 30 baseline + 1 stress = 91 doubles].
    /// Eliminates all JSON overhead.
    #[napi]
    pub fn tick_binary(
        &mut self,
        state_buf: &[u8],
        hours_elapsed: f64,
        hour_of_day: f64,
        contagion_inputs_json: Option<String>,
    ) -> Result<Buffer> {
        // Validate buffer size: 31 doubles × 8 bytes = 248 bytes
        if state_buf.len() < 31 * 8 {
            return Err(Error::from_reason(format!(
                "state_buf too small: expected {} bytes, got {}", 31 * 8, state_buf.len()
            )));
        }

        // Read 30 emotion dims + 1 stress from buffer
        let doubles = read_f64_array::<31>(state_buf);
        for i in 0..crate::emotion::NUM_DIMS {
            self.inner.current[i] = doubles[i];
        }
        self.inner.set_stress(doubles[30]);

        // Parse contagion
        let contagion = match contagion_inputs_json {
            Some(s) => {
                let json: serde_json::Value = serde_json::from_str(&s)
                    .map_err(|e| Error::from_reason(format!("Invalid contagion JSON: {}", e)))?;
                Some(parse_contagion_inputs(&json)?)
            }
            None => None,
        };

        // Run tick
        self.inner.tick(
            hours_elapsed,
            hour_of_day,
            &self.config,
            &self.behavior,
            contagion.as_deref(),
            &mut self.rng,
        );

        // Return state as binary buffer: 30 current + 30 mood + 30 baseline + 1 stress + 16 pink = 107 doubles
        let total = crate::emotion::NUM_DIMS * 3 + 1 + 16;
        let mut out = vec![0u8; total * 8];
        let mut offset = 0;
        for i in 0..crate::emotion::NUM_DIMS {
            write_f64(&mut out, offset, self.inner.current[i]);
            offset += 8;
        }
        for i in 0..crate::emotion::NUM_DIMS {
            write_f64(&mut out, offset, self.inner.mood[i]);
            offset += 8;
        }
        for i in 0..crate::emotion::NUM_DIMS {
            write_f64(&mut out, offset, self.inner.baseline[i]);
            offset += 8;
        }
        write_f64(&mut out, offset, self.inner.stress);
        offset += 8;
        for i in 0..16 {
            write_f64(&mut out, offset, self.inner.pink_noise_state[i]);
            offset += 8;
        }
        Ok(Buffer::from(out))
    }

    /// Full binary fast-path: state + contagion both as binary buffers.
    /// contagion_buf format: N × [30 emotion doubles + 1 weight + 1 expressiveness] = N × 32 × 8 bytes.
    /// Empty or null contagion_buf = no contagion.
    #[napi]
    pub fn tick_binary_full(
        &mut self,
        state_buf: &[u8],
        contagion_buf: Option<&[u8]>,
        hours_elapsed: f64,
        hour_of_day: f64,
    ) -> Result<Buffer> {
        if state_buf.len() < 31 * 8 {
            return Err(Error::from_reason(format!(
                "state_buf too small: expected {} bytes, got {}", 31 * 8, state_buf.len()
            )));
        }

        let doubles = read_f64_array::<31>(state_buf);
        for i in 0..crate::emotion::NUM_DIMS {
            self.inner.current[i] = doubles[i];
        }
        self.inner.set_stress(doubles[30]);

        // Parse binary contagion buffer
        let contagion: Option<Vec<ContagionInput>> = match contagion_buf {
            Some(buf) if buf.len() >= 32 * 8 => {
                let n = buf.len() / (32 * 8);
                let mut inputs = Vec::with_capacity(n);
                for k in 0..n {
                    let base = k * 32 * 8;
                    let mut emotion = [0.0_f64; NUM_DIMS];
                    for i in 0..NUM_DIMS {
                        let bytes: [u8; 8] = buf[base + i * 8..base + (i + 1) * 8].try_into().unwrap_or([0u8; 8]);
                        emotion[i] = f64::from_le_bytes(bytes);
                    }
                    let weight_bytes: [u8; 8] = buf[base + 30 * 8..base + 31 * 8].try_into().unwrap_or([0u8; 8]);
                    let weight = f64::from_le_bytes(weight_bytes);
                    let expr_bytes: [u8; 8] = buf[base + 31 * 8..base + 32 * 8].try_into().unwrap_or([0u8; 8]);
                    let expressiveness = f64::from_le_bytes(expr_bytes);
                    inputs.push(ContagionInput { emotion, weight, expressiveness });
                }
                Some(inputs)
            }
            _ => None,
        };

        self.inner.tick(
            hours_elapsed,
            hour_of_day,
            &self.config,
            &self.behavior,
            contagion.as_deref(),
            &mut self.rng,
        );

        // Return state as binary buffer
        let total = crate::emotion::NUM_DIMS * 3 + 1 + 16;
        let mut out = vec![0u8; total * 8];
        let mut offset = 0;
        for i in 0..crate::emotion::NUM_DIMS { write_f64(&mut out, offset, self.inner.current[i]); offset += 8; }
        for i in 0..crate::emotion::NUM_DIMS { write_f64(&mut out, offset, self.inner.mood[i]); offset += 8; }
        for i in 0..crate::emotion::NUM_DIMS { write_f64(&mut out, offset, self.inner.baseline[i]); offset += 8; }
        write_f64(&mut out, offset, self.inner.stress); offset += 8;
        for i in 0..16 { write_f64(&mut out, offset, self.inner.pink_noise_state[i]); offset += 8; }
        Ok(Buffer::from(out))
    }

    /// Binary fast-path for apply_effect
    #[napi]
    pub fn apply_effect_binary(
        &mut self,
        state_buf: &[u8],
        effects_json_str: String,
        multiplier: Option<f64>,
        appraisal_json_str: Option<String>,
    ) -> Result<Buffer> {
        if state_buf.len() < 31 * 8 {
            return Err(Error::from_reason(format!(
                "state_buf too small: expected {} bytes, got {}", 31 * 8, state_buf.len()
            )));
        }

        let doubles = read_f64_array::<31>(state_buf);
        for i in 0..crate::emotion::NUM_DIMS {
            self.inner.current[i] = doubles[i];
        }
        self.inner.set_stress(doubles[30]);

        let effects_json: serde_json::Value = serde_json::from_str(&effects_json_str)
            .map_err(|e| Error::from_reason(format!("Invalid effects JSON: {}", e)))?;
        let effects = parse_effects(&effects_json)?;

        let appraisal = match appraisal_json_str {
            Some(s) => {
                let json: serde_json::Value = serde_json::from_str(&s)
                    .map_err(|e| Error::from_reason(format!("Invalid appraisal JSON: {}", e)))?;
                Some(parse_effects(&json)?)
            }
            None => None,
        };

        self.inner.apply_effect(
            &effects,
            multiplier.unwrap_or(1.0),
            appraisal.as_deref(),
            &self.config,
            &self.behavior,
        );

        // Return current + mood + baseline + stress + pink
        let total = crate::emotion::NUM_DIMS * 3 + 1 + 16;
        let mut out = vec![0u8; total * 8];
        let mut offset = 0;
        for i in 0..crate::emotion::NUM_DIMS {
            write_f64(&mut out, offset, self.inner.current[i]); offset += 8;
        }
        for i in 0..crate::emotion::NUM_DIMS {
            write_f64(&mut out, offset, self.inner.mood[i]); offset += 8;
        }
        for i in 0..crate::emotion::NUM_DIMS {
            write_f64(&mut out, offset, self.inner.baseline[i]); offset += 8;
        }
        write_f64(&mut out, offset, self.inner.stress); offset += 8;
        for i in 0..16 {
            write_f64(&mut out, offset, self.inner.pink_noise_state[i]); offset += 8;
        }
        Ok(Buffer::from(out))
    }

    #[napi]
    pub fn apply_effect(
        &mut self,
        effects_json_str: String,
        multiplier: Option<f64>,
        appraisal_json_str: Option<String>,
    ) -> Result<()> {
        let effects_json: serde_json::Value = serde_json::from_str(&effects_json_str)
            .map_err(|e| Error::from_reason(format!("Invalid effects JSON: {}", e)))?;
        let effects = parse_effects(&effects_json)?;

        let appraisal = match appraisal_json_str {
            Some(s) => {
                let json: serde_json::Value = serde_json::from_str(&s)
                    .map_err(|e| Error::from_reason(format!("Invalid appraisal JSON: {}", e)))?;
                Some(parse_effects(&json)?)
            }
            None => None,
        };

        self.inner.apply_effect(
            &effects,
            multiplier.unwrap_or(1.0),
            appraisal.as_deref(),
            &self.config,
            &self.behavior,
        );
        Ok(())
    }

    /// Fully binary apply_effect: effects as packed f64 pairs (dimIndex, delta).
    /// effects_buf: N × 16 bytes (N pairs of [f64 dim_index, f64 delta]).
    /// appraisal_buf: optional, same format.
    /// Returns updated state as binary buffer (107 doubles).
    /// Eliminates ALL JSON serialization overhead.
    #[napi]
    pub fn apply_effect_packed(
        &mut self,
        state_buf: &[u8],
        effects_buf: &[u8],
        multiplier: Option<f64>,
        appraisal_buf: Option<&[u8]>,
    ) -> Result<Buffer> {
        if state_buf.len() < 31 * 8 {
            return Err(Error::from_reason(format!(
                "state_buf too small: expected {} bytes, got {}", 31 * 8, state_buf.len()
            )));
        }

        // Sync state
        let doubles = read_f64_array::<31>(state_buf);
        for i in 0..crate::emotion::NUM_DIMS {
            self.inner.current[i] = doubles[i];
        }
        self.inner.set_stress(doubles[30]);

        // Parse packed effects: N × (dim_index, delta)
        let n_effects = effects_buf.len() / 16;
        let mut effects = Vec::with_capacity(n_effects);
        for k in 0..n_effects {
            let base = k * 16;
            let idx_bytes: [u8; 8] = effects_buf[base..base + 8].try_into().unwrap_or([0u8; 8]);
            let delta_bytes: [u8; 8] = effects_buf[base + 8..base + 16].try_into().unwrap_or([0u8; 8]);
            let idx = f64::from_le_bytes(idx_bytes) as usize;
            let delta = f64::from_le_bytes(delta_bytes);
            if idx < NUM_DIMS {
                effects.push((idx, delta));
            }
        }

        // Parse optional packed appraisal
        let appraisal: Option<Vec<(usize, f64)>> = appraisal_buf.map(|buf| {
            let n = buf.len() / 16;
            let mut mods = Vec::with_capacity(n);
            for k in 0..n {
                let base = k * 16;
                let idx_bytes: [u8; 8] = buf[base..base + 8].try_into().unwrap_or([0u8; 8]);
                let delta_bytes: [u8; 8] = buf[base + 8..base + 16].try_into().unwrap_or([0u8; 8]);
                let idx = f64::from_le_bytes(idx_bytes) as usize;
                let val = f64::from_le_bytes(delta_bytes);
                if idx < NUM_DIMS {
                    mods.push((idx, val));
                }
            }
            mods
        });

        self.inner.apply_effect(
            &effects,
            multiplier.unwrap_or(1.0),
            appraisal.as_deref(),
            &self.config,
            &self.behavior,
        );

        // Return updated state as binary buffer
        let total = NUM_DIMS * 3 + 1 + 16;
        let mut out = vec![0u8; total * 8];
        let mut offset = 0;
        for i in 0..NUM_DIMS { write_f64(&mut out, offset, self.inner.current[i]); offset += 8; }
        for i in 0..NUM_DIMS { write_f64(&mut out, offset, self.inner.mood[i]); offset += 8; }
        for i in 0..NUM_DIMS { write_f64(&mut out, offset, self.inner.baseline[i]); offset += 8; }
        write_f64(&mut out, offset, self.inner.stress); offset += 8;
        for i in 0..16 { write_f64(&mut out, offset, self.inner.pink_noise_state[i]); offset += 8; }
        Ok(Buffer::from(out))
    }

    #[napi]
    pub fn get_valence(&self) -> f64 {
        self.inner.get_valence()
    }

    #[napi]
    pub fn get_arousal(&self) -> f64 {
        self.inner.get_arousal()
    }

    #[napi]
    pub fn get_dominant(&self, n: u32) -> Vec<JsDominantEmotion> {
        // Use stack-allocated array to avoid heap allocation per call.
        // Typical n is 3-5; max supported without heap is 8.
        let result = match n.min(8) {
            1 => { let (c, p) = self.inner.get_dominant::<1>(); p[..c].iter().map(|&(idx, value)| JsDominantEmotion { dimension: DIM_NAMES[idx].to_string(), value }).collect() }
            2 => { let (c, p) = self.inner.get_dominant::<2>(); p[..c].iter().map(|&(idx, value)| JsDominantEmotion { dimension: DIM_NAMES[idx].to_string(), value }).collect() }
            3 => { let (c, p) = self.inner.get_dominant::<3>(); p[..c].iter().map(|&(idx, value)| JsDominantEmotion { dimension: DIM_NAMES[idx].to_string(), value }).collect() }
            4 => { let (c, p) = self.inner.get_dominant::<4>(); p[..c].iter().map(|&(idx, value)| JsDominantEmotion { dimension: DIM_NAMES[idx].to_string(), value }).collect() }
            5 => { let (c, p) = self.inner.get_dominant::<5>(); p[..c].iter().map(|&(idx, value)| JsDominantEmotion { dimension: DIM_NAMES[idx].to_string(), value }).collect() }
            _ => { let (c, p) = self.inner.get_dominant::<8>(); p[..c].iter().map(|&(idx, value)| JsDominantEmotion { dimension: DIM_NAMES[idx].to_string(), value }).collect() }
        };
        result
    }

    #[napi]
    pub fn get_stress(&self) -> f64 {
        self.inner.stress
    }

    #[napi]
    pub fn set_stress(&mut self, value: f64) {
        self.inner.set_stress(value);
    }

    #[napi]
    pub fn get_current(&self, dim: String) -> f64 {
        crate::emotion::constants::dim_index(&dim)
            .map(|i| self.inner.current[i])
            .unwrap_or(0.0)
    }

    #[napi]
    pub fn set_current(&mut self, dim: String, value: f64) -> Result<()> {
        let idx = crate::emotion::constants::dim_index(&dim)
            .ok_or_else(|| Error::from_reason(format!("Unknown dimension: {}", dim)))?;
        self.inner.current[idx] = value;
        Ok(())
    }

    #[napi]
    pub fn get_current_all(&self) -> Vec<f64> {
        self.inner.current.to_vec()
    }

    #[napi]
    pub fn to_json(&self) -> Result<String> {
        let current = dim_array_to_json(&self.inner.current);
        let mood = dim_array_to_json(&self.inner.mood);
        let baseline = dim_array_to_json(&self.inner.baseline);
        let pink: Vec<f64> = self.inner.pink_noise_state.to_vec();

        let val = serde_json::json!({
            "current": current,
            "mood": mood,
            "baseline": baseline,
            "stress": self.inner.stress,
            "_pinkNoiseState": pink,
        });

        serde_json::to_string(&val).map_err(|e| Error::from_reason(e.to_string()))
    }
}

#[napi(object)]
pub struct JsDominantEmotion {
    pub dimension: String,
    pub value: f64,
}

// ═══════════════════════════════════════════
// NeedsSystemJs
// ═══════════════════════════════════════════

#[napi]
pub struct NeedsSystemJs {
    inner: NeedsSystem,
}

#[napi]
impl NeedsSystemJs {
    #[napi(constructor)]
    pub fn new(
        ocean_json_str: String,
        config_json_str: String,
        saved_state_json_str: Option<String>,
    ) -> Result<Self> {
        let ocean: serde_json::Value = serde_json::from_str(&ocean_json_str)
            .map_err(|e| Error::from_reason(format!("Invalid ocean JSON: {}", e)))?;
        let config_json: serde_json::Value = serde_json::from_str(&config_json_str)
            .map_err(|e| Error::from_reason(format!("Invalid config JSON: {}", e)))?;

        let ocean_neuroticism = ocean.get("neuroticism").and_then(|v| v.as_f64()).unwrap_or(0.5);
        let ocean_extraversion = ocean.get("extraversion").and_then(|v| v.as_f64()).unwrap_or(0.5);
        let ocean_openness = ocean.get("openness").and_then(|v| v.as_f64()).unwrap_or(0.5);

        let config: NeedsConfig = serde_json::from_value(config_json)
            .map_err(|e| Error::from_reason(format!("Invalid needs config: {}", e)))?;

        let inner = match saved_state_json_str {
            Some(ref s) => {
                let state: serde_json::Value = serde_json::from_str(s)
                    .map_err(|e| Error::from_reason(format!("Invalid saved state: {}", e)))?;
                let needs = extract_needs_array(&state);
                let decay = extract_decay_array(&state);
                NeedsSystem::from_saved(needs, decay, config)
            }
            None => NeedsSystem::new(ocean_neuroticism, ocean_extraversion, ocean_openness, config),
        };

        Ok(Self { inner })
    }

    #[napi]
    pub fn tick(&mut self, hours_elapsed: f64, current_state: String, current_region: String) {
        self.inner.tick(hours_elapsed, &current_state, &current_region);
    }

    #[napi]
    pub fn get_drive(&self) -> Option<String> {
        self.inner.get_drive().and_then(|d| serde_json::to_string(&d).ok())
    }

    #[napi]
    pub fn get_state_weights(&self, candidate_states: Vec<String>) -> Vec<f64> {
        self.inner.get_state_weights(&candidate_states)
    }

    #[napi]
    pub fn get_needs(&self) -> String {
        serde_json::json!({
            "hunger": self.inner.needs[0],
            "energy": self.inner.needs[1],
            "social": self.inner.needs[2],
            "comfort": self.inner.needs[3],
            "stimulation": self.inner.needs[4],
        }).to_string()
    }

    #[napi]
    pub fn set_needs(&mut self, needs_json_str: String) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&needs_json_str) {
            if let Some(h) = json.get("hunger").and_then(|v| v.as_f64()) { self.inner.needs[0] = h; }
            if let Some(e) = json.get("energy").and_then(|v| v.as_f64()) { self.inner.needs[1] = e; }
            if let Some(s) = json.get("social").and_then(|v| v.as_f64()) { self.inner.needs[2] = s; }
            if let Some(c) = json.get("comfort").and_then(|v| v.as_f64()) { self.inner.needs[3] = c; }
            if let Some(st) = json.get("stimulation").and_then(|v| v.as_f64()) { self.inner.needs[4] = st; }
        }
    }

    #[napi]
    pub fn to_json(&self) -> Result<String> {
        serde_json::to_string(&serde_json::json!({
            "needs": {
                "hunger": self.inner.needs[0],
                "energy": self.inner.needs[1],
                "social": self.inner.needs[2],
                "comfort": self.inner.needs[3],
                "stimulation": self.inner.needs[4],
            },
            "_decayRates": {
                "hunger": self.inner.decay_rates[0],
                "energy": self.inner.decay_rates[1],
                "social": self.inner.decay_rates[2],
                "comfort": self.inner.decay_rates[3],
                "stimulation": self.inner.decay_rates[4],
            }
        })).map_err(|e| Error::from_reason(e.to_string()))
    }
}

// ═══════════════════════════════════════════
// BatchEmotionEngine — N agents, 1 N-API call
// ═══════════════════════════════════════════

struct AgentSlot {
    emotion: EmotionVector,
    config: EmotionConfig,
    behavior: BehaviorParams,
    rng: SmallRng,
}

/// Dunbar level constants (matching JS DunbarLayer enum)
#[allow(dead_code)]
const DUNBAR_CLOSE_FRIEND: u8 = 0;
#[allow(dead_code)]
const DUNBAR_FRIEND: u8 = 1;
const DUNBAR_ACQUAINTANCE: u8 = 2;

/// Contagion frequency per Dunbar level (in ticks)
/// close_friend: every tick, friend: every 3 ticks, acquaintance: every 12 ticks
const DUNBAR_FREQ: [u32; 3] = [1, 3, 12];

/// CSR (Compressed Sparse Row) social graph for hierarchical contagion.
/// Agent i's neighbors are at indices `offsets[i]..offsets[i+1]`.
struct CsrGraph {
    offsets: Vec<u32>,     // len = num_agents + 1
    neighbors: Vec<u32>,   // len = total_edges
    levels: Vec<u8>,       // len = total_edges (0=close, 1=friend, 2=acquaintance)
    strengths: Vec<f32>,   // len = total_edges
}

#[napi]
pub struct BatchEmotionEngine {
    agents: Vec<AgentSlot>,
    base_rng_seed: u32,
    graph: Option<CsrGraph>,
    tick_count: u32,
}

#[napi]
impl BatchEmotionEngine {
    #[napi(constructor)]
    pub fn new(rng_seed: Option<u32>) -> Self {
        Self {
            agents: Vec::new(),
            base_rng_seed: rng_seed.unwrap_or(42),
            graph: None,
            tick_count: 0,
        }
    }

    #[napi]
    pub fn agent_count(&self) -> u32 {
        self.agents.len() as u32
    }

    /// Add an agent with JSON config
    #[napi]
    pub fn add_agent(
        &mut self,
        behavior_json_str: String,
        config_json_str: String,
        saved_state_json_str: Option<String>,
    ) -> Result<u32> {
        let behavior_json: serde_json::Value = serde_json::from_str(&behavior_json_str)
            .map_err(|e| Error::from_reason(format!("Invalid behavior JSON: {}", e)))?;
        let config_json: serde_json::Value = serde_json::from_str(&config_json_str)
            .map_err(|e| Error::from_reason(format!("Invalid config JSON: {}", e)))?;

        let behavior: BehaviorParams = serde_json::from_value(behavior_json.clone())
            .map_err(|e| Error::from_reason(format!("Invalid behavior config: {}", e)))?;
        let config: EmotionConfig = serde_json::from_value(config_json)
            .map_err(|e| Error::from_reason(format!("Invalid emotion config: {}", e)))?;

        let emotion = match saved_state_json_str {
            Some(ref s) => {
                let state: serde_json::Value = serde_json::from_str(s)
                    .map_err(|e| Error::from_reason(format!("Invalid saved state: {}", e)))?;
                let current = extract_f64_array(&state, "current", [0.0; NUM_DIMS]);
                let mood = extract_f64_array(&state, "mood", [0.0; NUM_DIMS]);
                let baseline = extract_f64_array(&state, "baseline", [0.0; NUM_DIMS]);
                let stress = state.get("stress").and_then(|v| v.as_f64()).unwrap_or(2.0);
                let pink = extract_pink_noise(&state);
                EmotionVector::from_saved(current, mood, baseline, stress, pink)
            }
            None => {
                let baseline = extract_f64_array(&behavior_json, "emotionBaseline", [0.0; NUM_DIMS]);
                EmotionVector::new(baseline, 2.0)
            }
        };

        let agent_idx = self.agents.len() as u64;
        let mixed = (self.base_rng_seed as u64)
            .wrapping_mul(0x517cc1b727220a95)
            .wrapping_add(agent_idx);
        let rng = SmallRng::seed_from_u64(mixed);

        self.agents.push(AgentSlot { emotion, config, behavior, rng });
        Ok(self.agents.len() as u32 - 1)
    }

    /// Tick all agents — single N-API call for N agents.
    /// Takes one big binary buffer with N × 31 doubles (current[30] + stress).
    /// Returns one big binary buffer with N × 107 doubles (current[30] + mood[30] + baseline[30] + stress[1] + pink[16]).
    #[napi]
    pub fn tick_all_binary(
        &mut self,
        states_buf: &[u8],
        hours_elapsed: f64,
        hour_of_day: f64,
    ) -> Result<Buffer> {
        let n = self.agents.len();
        if n == 0 {
            return Err(Error::from_reason("No agents in batch"));
        }

        let input_size = 31 * 8; // per agent
        if states_buf.len() < n * input_size {
            return Err(Error::from_reason(format!(
                "states_buf too small: expected {} bytes for {} agents, got {}",
                n * input_size, n, states_buf.len()
            )));
        }

        // Output: 107 doubles per agent
        let output_per_agent = NUM_DIMS * 3 + 1 + 16; // = 107

        // Phase 1: Sync state + parallel tick (each agent is independent)
        self.agents.par_iter_mut().enumerate().for_each(|(i, slot)| {
            let offset_in = i * input_size;
            let doubles = read_f64_array::<31>(&states_buf[offset_in..offset_in + input_size]);
            for d in 0..NUM_DIMS {
                slot.emotion.current[d] = doubles[d];
            }
            slot.emotion.set_stress(doubles[30]);
            slot.emotion.tick(
                hours_elapsed, hour_of_day,
                &slot.config, &slot.behavior, None, &mut slot.rng,
            );
        });

        // Phase 2: Write output (sequential — I/O is fast, computation was parallel)
        let mut out = vec![0u8; n * output_per_agent * 8];
        for (i, slot) in self.agents.iter().enumerate() {
            let offset_out = i * output_per_agent * 8;
            let mut off = offset_out;
            for d in 0..NUM_DIMS { write_f64(&mut out, off, slot.emotion.current[d]); off += 8; }
            for d in 0..NUM_DIMS { write_f64(&mut out, off, slot.emotion.mood[d]); off += 8; }
            for d in 0..NUM_DIMS { write_f64(&mut out, off, slot.emotion.baseline[d]); off += 8; }
            write_f64(&mut out, off, slot.emotion.stress); off += 8;
            for p in 0..16 { write_f64(&mut out, off, slot.emotion.pink_noise_state[p]); off += 8; }
        }

        Ok(Buffer::from(out))
    }

    /// Tick all agents with pre-allocated output buffer (zero-allocation hot path).
    /// out_buf must be exactly N × 107 × 8 bytes, pre-allocated by JS.
    /// Writes results directly into out_buf — no Vec allocation, no Buffer creation.
    #[napi]
    pub fn tick_all_binary_inplace(
        &mut self,
        states_buf: &[u8],
        mut out_buf: Buffer,
        hours_elapsed: f64,
        hour_of_day: f64,
    ) -> Result<Buffer> {
        let n = self.agents.len();
        if n == 0 {
            return Err(Error::from_reason("No agents in batch"));
        }

        let input_size = 31 * 8;
        if states_buf.len() < n * input_size {
            return Err(Error::from_reason(format!(
                "states_buf too small: expected {} bytes for {} agents, got {}",
                n * input_size, n, states_buf.len()
            )));
        }

        let output_per_agent = NUM_DIMS * 3 + 1 + 16; // 107
        let expected_out = n * output_per_agent * 8;
        if out_buf.len() < expected_out {
            return Err(Error::from_reason(format!(
                "out_buf too small: expected {} bytes, got {}", expected_out, out_buf.len()
            )));
        }

        // Phase 1: Sync state + parallel tick
        self.agents.par_iter_mut().enumerate().for_each(|(i, slot)| {
            let offset_in = i * input_size;
            let doubles = read_f64_array::<31>(&states_buf[offset_in..offset_in + input_size]);
            for d in 0..NUM_DIMS {
                slot.emotion.current[d] = doubles[d];
            }
            slot.emotion.set_stress(doubles[30]);
            slot.emotion.tick(
                hours_elapsed, hour_of_day,
                &slot.config, &slot.behavior, None, &mut slot.rng,
            );
        });

        // Phase 2: Write output directly into pre-allocated buffer
        for (i, slot) in self.agents.iter().enumerate() {
            let offset_out = i * output_per_agent * 8;
            let mut off = offset_out;
            for d in 0..NUM_DIMS { write_f64(&mut out_buf, off, slot.emotion.current[d]); off += 8; }
            for d in 0..NUM_DIMS { write_f64(&mut out_buf, off, slot.emotion.mood[d]); off += 8; }
            for d in 0..NUM_DIMS { write_f64(&mut out_buf, off, slot.emotion.baseline[d]); off += 8; }
            write_f64(&mut out_buf, off, slot.emotion.stress); off += 8;
            for p in 0..16 { write_f64(&mut out_buf, off, slot.emotion.pink_noise_state[p]); off += 8; }
        }

        Ok(out_buf)
    }

    /// Tick all agents with internal state (no state sync in/out).
    /// Uses rayon parallel iteration for multi-core utilization.
    /// Returns summary JSON with per-agent valence/arousal/stress.
    #[napi]
    pub fn tick_all(
        &mut self,
        hours_elapsed: f64,
        hour_of_day: f64,
    ) -> Result<String> {
        let n = self.agents.len();
        if n == 0 {
            return Err(Error::from_reason("No agents in batch"));
        }

        // Parallel tick — each agent is independent
        self.agents.par_iter_mut().for_each(|slot| {
            slot.emotion.tick(
                hours_elapsed, hour_of_day,
                &slot.config, &slot.behavior, None, &mut slot.rng,
            );
        });

        // Sequential result collection
        let results: Vec<serde_json::Value> = self.agents.iter().map(|slot| {
            serde_json::json!({
                "valence": slot.emotion.get_valence(),
                "arousal": slot.emotion.get_arousal(),
                "stress": slot.emotion.stress,
            })
        }).collect();

        serde_json::to_string(&results).map_err(|e| Error::from_reason(e.to_string()))
    }

    /// Get dominant emotions for all agents (batch query)
    #[napi]
    pub fn get_dominant_all(&self, n: u32) -> Vec<Vec<JsDominantEmotion>> {
        let k = (n as usize).min(5);
        self.agents.iter().map(|slot| {
            let (count, pairs) = slot.emotion.get_dominant::<5>();
            pairs[..count.min(k)].iter().map(|&(idx, value)| JsDominantEmotion {
                dimension: DIM_NAMES[idx].to_string(),
                value,
            }).collect()
        }).collect()
    }

    /// Tick all agents WITH binary contagion data.
    ///
    /// contagion_bufs: Array of N binary buffers, one per agent.
    ///   Each buffer: K × 32 × 8 bytes (K neighbors × 32 doubles).
    ///   32 doubles = [30 emotion dims + 1 weight + 1 expressiveness].
    ///   Empty buffer = no contagion for that agent.
    ///
    /// states_buf: N × 31 × 8 bytes (current[30] + stress).
    /// Returns: N × 107 × 8 bytes (current[30] + mood[30] + baseline[30] + stress[1] + pink[16]).
    #[napi]
    pub fn tick_all_with_contagion_binary(
        &mut self,
        states_buf: &[u8],
        contagion_bufs: Vec<&[u8]>,
        hours_elapsed: f64,
        hour_of_day: f64,
    ) -> Result<Buffer> {
        let n = self.agents.len();
        if n == 0 {
            return Err(Error::from_reason("No agents in batch"));
        }

        let input_size = 31 * 8;
        if states_buf.len() < n * input_size {
            return Err(Error::from_reason(format!(
                "states_buf too small: expected {} bytes for {} agents, got {}",
                n * input_size, n, states_buf.len()
            )));
        }

        if contagion_bufs.len() != n {
            return Err(Error::from_reason(format!(
                "contagion_bufs length {} != agent count {}", contagion_bufs.len(), n
            )));
        }

        let output_per_agent = NUM_DIMS * 3 + 1 + 16; // 107

        // Phase 1: Parse contagion buffers (can be parallelized since each is independent)
        let contagion_data: Vec<Option<Vec<ContagionInput>>> = contagion_bufs.par_iter().map(|buf| {
            if buf.len() < 32 * 8 {
                return None;
            }
            let n_neighbors = buf.len() / (32 * 8);
            let mut inputs = Vec::with_capacity(n_neighbors);
            for k in 0..n_neighbors {
                let base = k * 32 * 8;
                let mut emotion = [0.0_f64; NUM_DIMS];
                for i in 0..NUM_DIMS {
                    let bytes: [u8; 8] = buf[base + i * 8..base + (i + 1) * 8].try_into().unwrap_or([0u8; 8]);
                    emotion[i] = f64::from_le_bytes(bytes);
                }
                let weight_bytes: [u8; 8] = buf[base + 30 * 8..base + 31 * 8].try_into().unwrap_or([0u8; 8]);
                let weight = f64::from_le_bytes(weight_bytes);
                let expr_bytes: [u8; 8] = buf[base + 31 * 8..base + 32 * 8].try_into().unwrap_or([0u8; 8]);
                let expressiveness = f64::from_le_bytes(expr_bytes);
                inputs.push(ContagionInput { emotion, weight, expressiveness });
            }
            Some(inputs)
        }).collect();

        // Phase 2: Sync state + parallel tick with contagion
        // SAFETY: We need to borrow contagion_data while mutating agents.
        // Since each agent only reads its own contagion entry, this is safe.
        let contagion_refs: Vec<Option<&[ContagionInput]>> = contagion_data.iter()
            .map(|opt| opt.as_deref())
            .collect();

        self.agents.par_iter_mut().enumerate().for_each(|(i, slot)| {
            let offset_in = i * input_size;
            let doubles = read_f64_array::<31>(&states_buf[offset_in..offset_in + input_size]);
            for d in 0..NUM_DIMS {
                slot.emotion.current[d] = doubles[d];
            }
            slot.emotion.set_stress(doubles[30]);
            slot.emotion.tick(
                hours_elapsed, hour_of_day,
                &slot.config, &slot.behavior,
                contagion_refs[i],
                &mut slot.rng,
            );
        });

        // Phase 3: Write output
        let mut out = vec![0u8; n * output_per_agent * 8];
        for (i, slot) in self.agents.iter().enumerate() {
            let offset_out = i * output_per_agent * 8;
            let mut off = offset_out;
            for d in 0..NUM_DIMS { write_f64(&mut out, off, slot.emotion.current[d]); off += 8; }
            for d in 0..NUM_DIMS { write_f64(&mut out, off, slot.emotion.mood[d]); off += 8; }
            for d in 0..NUM_DIMS { write_f64(&mut out, off, slot.emotion.baseline[d]); off += 8; }
            write_f64(&mut out, off, slot.emotion.stress); off += 8;
            for p in 0..16 { write_f64(&mut out, off, slot.emotion.pink_noise_state[p]); off += 8; }
        }

        Ok(Buffer::from(out))
    }

    // ═══════════════════════════════════════════
    // Dunbar Hierarchical Contagion
    // ═══════════════════════════════════════════

    /// Initialize the social graph for hierarchical contagion.
    ///
    /// Binary CSR format:
    ///   offsets_buf:  (N+1) × u32 — agent i's edges are at offsets[i]..offsets[i+1]
    ///   neighbors_buf: E × u32    — neighbor agent indices
    ///   levels_buf:   E × u8     — Dunbar level per edge (0=close_friend, 1=friend, 2=acquaintance)
    ///   strengths_buf: E × f32   — relationship strength per edge
    #[napi]
    pub fn setup_social_graph_binary(
        &mut self,
        offsets_buf: &[u8],
        neighbors_buf: &[u8],
        levels_buf: &[u8],
        strengths_buf: &[u8],
    ) -> Result<()> {
        let n = self.agents.len();
        if n == 0 {
            return Err(Error::from_reason("No agents in batch — add agents before setting up graph"));
        }

        // Validate sizes
        if offsets_buf.len() < (n + 1) * 4 {
            return Err(Error::from_reason(format!(
                "offsets_buf too small: expected {} bytes for {} agents, got {}",
                (n + 1) * 4, n, offsets_buf.len()
            )));
        }

        // Parse offsets (u32 LE)
        let mut offsets = Vec::with_capacity(n + 1);
        for i in 0..=n {
            let bytes: [u8; 4] = offsets_buf[i * 4..(i + 1) * 4].try_into()
                .map_err(|_| Error::from_reason("offsets read error"))?;
            offsets.push(u32::from_le_bytes(bytes));
        }

        let total_edges = offsets[n] as usize;

        if neighbors_buf.len() < total_edges * 4 {
            return Err(Error::from_reason(format!(
                "neighbors_buf too small: expected {} bytes for {} edges, got {}",
                total_edges * 4, total_edges, neighbors_buf.len()
            )));
        }
        if levels_buf.len() < total_edges {
            return Err(Error::from_reason(format!(
                "levels_buf too small: expected {} bytes for {} edges, got {}",
                total_edges, total_edges, levels_buf.len()
            )));
        }
        if strengths_buf.len() < total_edges * 4 {
            return Err(Error::from_reason(format!(
                "strengths_buf too small: expected {} bytes for {} edges, got {}",
                total_edges * 4, total_edges, strengths_buf.len()
            )));
        }

        // Parse neighbors (u32 LE)
        let mut neighbors = Vec::with_capacity(total_edges);
        for i in 0..total_edges {
            let bytes: [u8; 4] = neighbors_buf[i * 4..(i + 1) * 4].try_into()
                .map_err(|_| Error::from_reason("neighbors read error"))?;
            neighbors.push(u32::from_le_bytes(bytes));
        }

        // Levels: direct copy (already u8)
        let levels = levels_buf[..total_edges].to_vec();

        // Parse strengths (f32 LE)
        let mut strengths = Vec::with_capacity(total_edges);
        for i in 0..total_edges {
            let bytes: [u8; 4] = strengths_buf[i * 4..(i + 1) * 4].try_into()
                .map_err(|_| Error::from_reason("strengths read error"))?;
            strengths.push(f32::from_le_bytes(bytes));
        }

        self.graph = Some(CsrGraph { offsets, neighbors, levels, strengths });
        self.tick_count = 0;

        Ok(())
    }

    /// Get current tick count (for hierarchical contagion scheduling)
    #[napi]
    pub fn get_tick_count(&self) -> u32 {
        self.tick_count
    }

    /// Get total edge count in the social graph
    #[napi]
    pub fn graph_edge_count(&self) -> u32 {
        match &self.graph {
            Some(g) => g.neighbors.len() as u32,
            None => 0,
        }
    }

    /// Tick all agents with Dunbar hierarchical contagion.
    ///
    /// Instead of syncing ALL neighbors every tick, this method only includes
    /// neighbors whose Dunbar level matches the current tick frequency:
    ///   - Close friends (level 0): every tick
    ///   - Friends (level 1): every 3 ticks
    ///   - Acquaintances (level 2): every 12 ticks
    ///
    /// This reduces contagion compute by ~10x while keeping emotion trajectories
    /// within 5% of full-sync (validated empirically).
    ///
    /// Requires `setup_social_graph_binary` to be called first.
    ///
    /// states_buf: N × 31 × 8 bytes (current[30] + stress).
    /// Returns: N × 107 × 8 bytes (current[30] + mood[30] + baseline[30] + stress[1] + pink[16]).
    #[napi]
    pub fn tick_all_hierarchical_binary(
        &mut self,
        states_buf: &[u8],
        hours_elapsed: f64,
        hour_of_day: f64,
    ) -> Result<Buffer> {
        let n = self.agents.len();
        if n == 0 {
            return Err(Error::from_reason("No agents in batch"));
        }

        let graph = self.graph.as_ref()
            .ok_or_else(|| Error::from_reason("No social graph — call setup_social_graph_binary first"))?;

        let input_size = 31 * 8;
        if states_buf.len() < n * input_size {
            return Err(Error::from_reason(format!(
                "states_buf too small: expected {} bytes for {} agents, got {}",
                n * input_size, n, states_buf.len()
            )));
        }

        let output_per_agent = NUM_DIMS * 3 + 1 + 16; // 107
        let current_tick = self.tick_count;

        // Snapshot neighbor emotion states for contagion (immutable borrow, done before mutation).
        // This avoids borrow checker conflict: we can't immutably borrow self.agents
        // inside a par_iter that later mutably borrows them.
        let neighbor_snapshots: Vec<([f64; NUM_DIMS], f64)> = self.agents.iter()
            .map(|slot| (slot.emotion.current, slot.behavior.expressiveness))
            .collect();

        // Build per-agent filtered contagion inputs in parallel.
        // Each thread only reads CSR data (immutable) and neighbor_snapshots (immutable).
        let contagion_data: Vec<Vec<ContagionInput>> = (0..n).into_par_iter().map(|i| {
            let start = graph.offsets[i] as usize;
            let end = graph.offsets[i + 1] as usize;
            let mut inputs = Vec::new();

            for e in start..end {
                let level = graph.levels[e];
                // Skip unknown levels
                if level > DUNBAR_ACQUAINTANCE { continue; }
                // Frequency scheduling: only include if this tick matches the level's schedule
                if current_tick % DUNBAR_FREQ[level as usize] != 0 { continue; }

                let neighbor_idx = graph.neighbors[e] as usize;
                if neighbor_idx >= n { continue; } // bounds safety

                let (emotion, expressiveness) = neighbor_snapshots[neighbor_idx];
                inputs.push(ContagionInput {
                    emotion,
                    weight: graph.strengths[e] as f64,
                    expressiveness,
                });
            }

            inputs
        }).collect();

        // Phase 2: Sync state + parallel tick with hierarchical contagion
        let contagion_refs: Vec<Option<&[ContagionInput]>> = contagion_data.iter()
            .map(|v| if v.is_empty() { None } else { Some(v.as_slice()) })
            .collect();

        self.agents.par_iter_mut().enumerate().for_each(|(i, slot)| {
            let offset_in = i * input_size;
            let doubles = read_f64_array::<31>(&states_buf[offset_in..offset_in + input_size]);
            for d in 0..NUM_DIMS {
                slot.emotion.current[d] = doubles[d];
            }
            slot.emotion.set_stress(doubles[30]);
            slot.emotion.tick(
                hours_elapsed, hour_of_day,
                &slot.config, &slot.behavior,
                contagion_refs[i],
                &mut slot.rng,
            );
        });

        self.tick_count += 1;

        // Phase 3: Write output
        let mut out = vec![0u8; n * output_per_agent * 8];
        for (i, slot) in self.agents.iter().enumerate() {
            let offset_out = i * output_per_agent * 8;
            let mut off = offset_out;
            for d in 0..NUM_DIMS { write_f64(&mut out, off, slot.emotion.current[d]); off += 8; }
            for d in 0..NUM_DIMS { write_f64(&mut out, off, slot.emotion.mood[d]); off += 8; }
            for d in 0..NUM_DIMS { write_f64(&mut out, off, slot.emotion.baseline[d]); off += 8; }
            write_f64(&mut out, off, slot.emotion.stress); off += 8;
            for p in 0..16 { write_f64(&mut out, off, slot.emotion.pink_noise_state[p]); off += 8; }
        }

        Ok(Buffer::from(out))
    }

    /// Tick all agents with FULL contagion (every neighbor, every tick).
    /// This is the "baseline" for comparison with hierarchical contagion.
    ///
    /// Requires `setup_social_graph_binary` to be called first.
    ///
    /// states_buf: N × 31 × 8 bytes (current[30] + stress).
    /// Returns: N × 107 × 8 bytes (current[30] + mood[30] + baseline[30] + stress[1] + pink[16]).
    #[napi]
    pub fn tick_all_full_contagion_binary(
        &mut self,
        states_buf: &[u8],
        hours_elapsed: f64,
        hour_of_day: f64,
    ) -> Result<Buffer> {
        let n = self.agents.len();
        if n == 0 {
            return Err(Error::from_reason("No agents in batch"));
        }

        let graph = self.graph.as_ref()
            .ok_or_else(|| Error::from_reason("No social graph — call setup_social_graph_binary first"))?;

        let input_size = 31 * 8;
        if states_buf.len() < n * input_size {
            return Err(Error::from_reason(format!(
                "states_buf too small: expected {} bytes for {} agents, got {}",
                n * input_size, n, states_buf.len()
            )));
        }

        let output_per_agent = NUM_DIMS * 3 + 1 + 16; // 107

        // Snapshot neighbor states (immutable, before mutation)
        let neighbor_snapshots: Vec<([f64; NUM_DIMS], f64)> = self.agents.iter()
            .map(|slot| (slot.emotion.current, slot.behavior.expressiveness))
            .collect();

        // Build per-agent contagion from ALL neighbors (no frequency filtering)
        let contagion_data: Vec<Vec<ContagionInput>> = (0..n).into_par_iter().map(|i| {
            let start = graph.offsets[i] as usize;
            let end = graph.offsets[i + 1] as usize;
            let mut inputs = Vec::with_capacity(end - start);

            for e in start..end {
                let neighbor_idx = graph.neighbors[e] as usize;
                if neighbor_idx >= n { continue; }
                let (emotion, expressiveness) = neighbor_snapshots[neighbor_idx];
                inputs.push(ContagionInput {
                    emotion,
                    weight: graph.strengths[e] as f64,
                    expressiveness,
                });
            }

            inputs
        }).collect();

        let contagion_refs: Vec<Option<&[ContagionInput]>> = contagion_data.iter()
            .map(|v| if v.is_empty() { None } else { Some(v.as_slice()) })
            .collect();

        self.agents.par_iter_mut().enumerate().for_each(|(i, slot)| {
            let offset_in = i * input_size;
            let doubles = read_f64_array::<31>(&states_buf[offset_in..offset_in + input_size]);
            for d in 0..NUM_DIMS {
                slot.emotion.current[d] = doubles[d];
            }
            slot.emotion.set_stress(doubles[30]);
            slot.emotion.tick(
                hours_elapsed, hour_of_day,
                &slot.config, &slot.behavior,
                contagion_refs[i],
                &mut slot.rng,
            );
        });

        self.tick_count += 1;

        // Phase 3: Write output
        let mut out = vec![0u8; n * output_per_agent * 8];
        for (i, slot) in self.agents.iter().enumerate() {
            let offset_out = i * output_per_agent * 8;
            let mut off = offset_out;
            for d in 0..NUM_DIMS { write_f64(&mut out, off, slot.emotion.current[d]); off += 8; }
            for d in 0..NUM_DIMS { write_f64(&mut out, off, slot.emotion.mood[d]); off += 8; }
            for d in 0..NUM_DIMS { write_f64(&mut out, off, slot.emotion.baseline[d]); off += 8; }
            write_f64(&mut out, off, slot.emotion.stress); off += 8;
            for p in 0..16 { write_f64(&mut out, off, slot.emotion.pink_noise_state[p]); off += 8; }
        }

        Ok(Buffer::from(out))
    }
}

// ═══════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════

fn extract_f64_array(json: &serde_json::Value, key: &str, default: [f64; NUM_DIMS]) -> [f64; NUM_DIMS] {
    let mut arr = default;
    if let Some(obj) = json.get(key).and_then(|v| v.as_object()) {
        for (i, name) in DIM_NAMES.iter().enumerate() {
            if let Some(val) = obj.get(*name).and_then(|v| v.as_f64()) {
                arr[i] = val;
            }
        }
    }
    arr
}

fn extract_pink_noise(json: &serde_json::Value) -> [f64; 16] {
    let mut arr = [0.0; 16];
    if let Some(pink) = json.get("_pinkNoiseState").and_then(|v| v.as_array()) {
        for (i, val) in pink.iter().enumerate().take(16) {
            arr[i] = val.as_f64().unwrap_or(0.0);
        }
    }
    arr
}

fn extract_needs_array(json: &serde_json::Value) -> [f64; 5] {
    let mut arr = [0.5; 5];
    if let Some(needs) = json.get("needs").and_then(|v| v.as_object()) {
        if let Some(h) = needs.get("hunger").and_then(|v| v.as_f64()) { arr[0] = h; }
        if let Some(e) = needs.get("energy").and_then(|v| v.as_f64()) { arr[1] = e; }
        if let Some(s) = needs.get("social").and_then(|v| v.as_f64()) { arr[2] = s; }
        if let Some(c) = needs.get("comfort").and_then(|v| v.as_f64()) { arr[3] = c; }
        if let Some(st) = needs.get("stimulation").and_then(|v| v.as_f64()) { arr[4] = st; }
    }
    arr
}

fn extract_decay_array(json: &serde_json::Value) -> [f64; 5] {
    let mut arr = [0.05; 5];
    if let Some(dr) = json.get("_decayRates").and_then(|v| v.as_object()) {
        if let Some(h) = dr.get("hunger").and_then(|v| v.as_f64()) { arr[0] = h; }
        if let Some(e) = dr.get("energy").and_then(|v| v.as_f64()) { arr[1] = e; }
        if let Some(s) = dr.get("social").and_then(|v| v.as_f64()) { arr[2] = s; }
        if let Some(c) = dr.get("comfort").and_then(|v| v.as_f64()) { arr[3] = c; }
        if let Some(st) = dr.get("stimulation").and_then(|v| v.as_f64()) { arr[4] = st; }
    }
    arr
}

fn parse_effects(json: &serde_json::Value) -> Result<Vec<(usize, f64)>> {
    let obj = json.as_object()
        .ok_or_else(|| Error::from_reason("effects must be an object"))?;

    let mut effects = Vec::new();
    for (key, val) in obj {
        if let Some(idx) = crate::emotion::constants::dim_index(key) {
            if let Some(delta) = val.as_f64() {
                effects.push((idx, delta));
            }
        }
    }
    Ok(effects)
}

fn dim_array_to_json(arr: &[f64; NUM_DIMS]) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for (i, name) in DIM_NAMES.iter().enumerate() {
        map.insert(name.to_string(), serde_json::json!(arr[i]));
    }
    serde_json::Value::Object(map)
}

fn parse_contagion_inputs(json: &serde_json::Value) -> Result<Vec<ContagionInput>> {
    let mut inputs = Vec::new();

    if let Some(obj) = json.as_object() {
        for (_agent_id, data) in obj {
            let emotion_obj = data.get("emotion").and_then(|v| v.as_object());
            let emotion = match emotion_obj {
                Some(obj) => {
                    let mut arr = [0.0; NUM_DIMS];
                    for (key, val) in obj {
                        if let Some(idx) = crate::emotion::constants::dim_index(key) {
                            arr[idx] = val.as_f64().unwrap_or(0.0);
                        }
                    }
                    arr
                }
                None => [0.0; NUM_DIMS],
            };

            let weight = data.get("weight").and_then(|v| v.as_f64()).unwrap_or(0.3);
            let expressiveness = data.get("expressiveness").and_then(|v| v.as_f64()).unwrap_or(0.5);

            inputs.push(ContagionInput { emotion, weight, expressiveness });
        }
    }

    Ok(inputs)
}

// ═══════════════════════════════════════════
// Binary Buffer Helpers
// ═══════════════════════════════════════════

/// Read f64 values from a little-endian byte buffer into a stack-allocated array.
/// Returns a fixed-size array of `N` f64 values — zero heap allocation.
/// Panics if `N * 8 > buf.len()`.
#[inline(always)]
fn read_f64_array<const N: usize>(buf: &[u8]) -> [f64; N] {
    debug_assert!(buf.len() >= N * 8, "buffer too small: need {} bytes, got {}", N * 8, buf.len());
    let mut result = [0.0_f64; N];
    for i in 0..N {
        let bytes: [u8; 8] = buf[i * 8..(i + 1) * 8].try_into().unwrap_or([0u8; 8]);
        result[i] = f64::from_le_bytes(bytes);
    }
    result
}

fn write_f64(buf: &mut [u8], offset: usize, value: f64) {
    let bytes = value.to_le_bytes();
    buf[offset..offset + 8].copy_from_slice(&bytes);
}

#[inline(always)]
fn read_f32(buf: &[u8], offset: usize) -> f32 {
    let bytes: [u8; 4] = buf[offset..offset + 4].try_into().unwrap_or([0u8; 4]);
    f32::from_le_bytes(bytes)
}

fn write_f32(buf: &mut [u8], offset: usize, value: f32) {
    let bytes = value.to_le_bytes();
    buf[offset..offset + 4].copy_from_slice(&bytes);
}

// ═══════════════════════════════════════════
// SoA f32 Batch Engine — forward-looking GPU-migration architecture
// ═══════════════════════════════════════════

use crate::emotion::soa::F32Agent;

/// SoA f32 batch emotion engine.
/// Uses per-agent F32Agent structs (480 bytes each) with rayon parallelism.
/// Input/output: f32 binary buffers (half the size of f64).
#[napi]
pub struct SoaBatchEngine {
    agents: Vec<F32Agent>,
    config: EmotionConfig,
    graph: Option<CsrGraph>,
    tick_count: u32,
    base_rng_seed: u32,
}

#[napi]
impl SoaBatchEngine {
    #[napi(constructor)]
    pub fn new(rng_seed: Option<u32>) -> Self {
        Self {
            agents: Vec::new(),
            config: EmotionConfig::default(),
            graph: None,
            tick_count: 0,
            base_rng_seed: rng_seed.unwrap_or(42),
        }
    }

    #[napi]
    pub fn agent_count(&self) -> u32 {
        self.agents.len() as u32
    }

    /// Add an agent with JSON config (same interface as BatchEmotionEngine).
    #[napi]
    pub fn add_agent(
        &mut self,
        behavior_json_str: String,
        config_json_str: String,
        saved_state_json_str: Option<String>,
    ) -> Result<u32> {
        let behavior_json: serde_json::Value = serde_json::from_str(&behavior_json_str)
            .map_err(|e| Error::from_reason(format!("Invalid behavior JSON: {}", e)))?;
        let config_json: serde_json::Value = serde_json::from_str(&config_json_str)
            .map_err(|e| Error::from_reason(format!("Invalid config JSON: {}", e)))?;

        let behavior: BehaviorParams = serde_json::from_value(behavior_json.clone())
            .map_err(|e| Error::from_reason(format!("Invalid behavior config: {}", e)))?;
        let config: EmotionConfig = serde_json::from_value(config_json)
            .map_err(|e| Error::from_reason(format!("Invalid emotion config: {}", e)))?;
        self.config = config;

        // Parse state from saved state or behavior (matching BatchEmotionEngine logic)
        let (current_f64, mood_f64, baseline_f64) = match saved_state_json_str {
            Some(ref s) => {
                let state: serde_json::Value = serde_json::from_str(s)
                    .map_err(|e| Error::from_reason(format!("Invalid saved state: {}", e)))?;
                let current = extract_f64_array(&state, "current", [0.0; NUM_DIMS]);
                let mood = extract_f64_array(&state, "mood", [0.0; NUM_DIMS]);
                let baseline = extract_f64_array(&state, "baseline", [0.0; NUM_DIMS]);
                (current, mood, baseline)
            }
            None => {
                let baseline = extract_f64_array(&behavior_json, "emotionBaseline", [0.0; NUM_DIMS]);
                (baseline, baseline, baseline)
            }
        };

        // Convert f64 arrays to f32
        let mut current = [0.0f32; NUM_DIMS];
        let mut mood = [0.0f32; NUM_DIMS];
        let mut baseline = [0.0f32; NUM_DIMS];
        for i in 0..NUM_DIMS {
            current[i] = current_f64[i] as f32;
            mood[i] = mood_f64[i] as f32;
            baseline[i] = baseline_f64[i] as f32;
        }

        let agent_idx = self.agents.len() as u64;
        let mixed = (self.base_rng_seed as u64)
            .wrapping_mul(0x517cc1b727220a95)
            .wrapping_add(agent_idx);
        let rng = SmallRng::seed_from_u64(mixed);

        let mut agent = F32Agent::new(baseline, rng);
        agent.current = current;
        agent.mood = mood;
        agent.pre_tick = current;
        agent.decay_rate = behavior.emotion_decay_rate as f32;
        agent.inertia = behavior.emotional_inertia as f32;
        agent.susceptibility = behavior.susceptibility as f32;
        agent.expressiveness = behavior.expressiveness as f32;

        self.agents.push(agent);
        Ok(self.agents.len() as u32 - 1)
    }

    /// Load CSR social graph for contagion (same format as BatchEmotionEngine).
    #[napi]
    pub fn setup_social_graph_binary(
        &mut self,
        offsets_buf: &[u8],
        neighbors_buf: &[u8],
        levels_buf: &[u8],
        strengths_buf: &[u8],
    ) -> Result<()> {
        let n = self.agents.len();
        if n == 0 {
            return Err(Error::from_reason("No agents — add agents before setting up graph"));
        }

        let expected_offsets = (n + 1) * 4;
        if offsets_buf.len() < expected_offsets {
            return Err(Error::from_reason(format!(
                "offsets_buf too small: expected {} bytes, got {}", expected_offsets, offsets_buf.len()
            )));
        }

        let mut offsets = Vec::with_capacity(n + 1);
        for i in 0..=n {
            let bytes: [u8; 4] = offsets_buf[i * 4..(i + 1) * 4].try_into().unwrap();
            offsets.push(u32::from_le_bytes(bytes));
        }

        let total_edges = *offsets.last().unwrap() as usize;
        let expected_neighbors = total_edges * 4;
        let expected_levels = total_edges;
        let expected_strengths = total_edges * 4;

        if neighbors_buf.len() < expected_neighbors {
            return Err(Error::from_reason(format!(
                "neighbors_buf too small: expected {} bytes, got {}", expected_neighbors, neighbors_buf.len()
            )));
        }
        if levels_buf.len() < expected_levels {
            return Err(Error::from_reason(format!(
                "levels_buf too small: expected {} bytes, got {}", expected_levels, levels_buf.len()
            )));
        }
        if strengths_buf.len() < expected_strengths {
            return Err(Error::from_reason(format!(
                "strengths_buf too small: expected {} bytes, got {}", expected_strengths, strengths_buf.len()
            )));
        }

        let mut neighbors = Vec::with_capacity(total_edges);
        for i in 0..total_edges {
            let bytes: [u8; 4] = neighbors_buf[i * 4..(i + 1) * 4].try_into().unwrap();
            neighbors.push(u32::from_le_bytes(bytes));
        }

        let levels: Vec<u8> = levels_buf[..total_edges].to_vec();

        let mut strengths = Vec::with_capacity(total_edges);
        for i in 0..total_edges {
            let bytes: [u8; 4] = strengths_buf[i * 4..(i + 1) * 4].try_into().unwrap();
            strengths.push(f32::from_le_bytes(bytes));
        }

        self.graph = Some(CsrGraph { offsets, neighbors, levels, strengths });
        Ok(())
    }

    /// Tick all agents without contagion — f32 binary I/O.
    /// Input: N × 31 × 4 bytes (Float32Array): current[30] + stress[1].
    /// Output: N × 107 × 4 bytes (Float32Array): current[30] + mood[30] + baseline[30] + stress[1] + pink[16].
    #[napi]
    pub fn tick_soa_binary(
        &mut self,
        states_buf: &[u8],
        hours_elapsed: f64,
        hour_of_day: f64,
    ) -> Result<Buffer> {
        let n = self.agents.len();
        if n == 0 {
            return Err(Error::from_reason("No agents in batch"));
        }

        let input_per_agent = NUM_DIMS + 1; // 31
        let input_size = input_per_agent * 4; // 124 bytes
        if states_buf.len() < n * input_size {
            return Err(Error::from_reason(format!(
                "states_buf too small: expected {} bytes for {} agents, got {}",
                n * input_size, n, states_buf.len()
            )));
        }

        // Phase 1: Sync state from f32 input + tick
        use rayon::prelude::*;
        self.agents.par_iter_mut().enumerate().for_each(|(i, agent)| {
            let offset = i * input_size;
            for d in 0..NUM_DIMS {
                agent.current[d] = read_f32(states_buf, offset + d * 4);
            }
            // stress at index 30 (not used in current tick pipeline, but stored)
            let _stress = read_f32(states_buf, offset + NUM_DIMS * 4);
        });

        crate::emotion::soa::f32_tick_no_contagion(
            &mut self.agents, &self.config,
            hours_elapsed as f32, hour_of_day as f32,
        );

        self.tick_count += 1;

        // Phase 2: Write f32 output
        let output_per_agent = NUM_DIMS * 3 + 1 + 16; // 107
        let mut out = vec![0u8; n * output_per_agent * 4];
        for (i, agent) in self.agents.iter().enumerate() {
            let base = i * output_per_agent * 4;
            let mut off = base;
            for d in 0..NUM_DIMS { write_f32(&mut out, off, agent.current[d]); off += 4; }
            for d in 0..NUM_DIMS { write_f32(&mut out, off, agent.mood[d]); off += 4; }
            for d in 0..NUM_DIMS { write_f32(&mut out, off, agent.baseline[d]); off += 4; }
            write_f32(&mut out, off, agent.stress); off += 4;
            for p in 0..16 { write_f32(&mut out, off, agent.pink_state[p]); off += 4; }
        }

        Ok(Buffer::from(out))
    }

    /// Tick all agents WITH Dunbar hierarchical contagion — f32 binary I/O.
    /// Input/Output format same as tick_soa_binary.
    #[napi]
    pub fn tick_soa_contagion_binary(
        &mut self,
        states_buf: &[u8],
        hours_elapsed: f64,
        hour_of_day: f64,
    ) -> Result<Buffer> {
        let n = self.agents.len();
        if n == 0 {
            return Err(Error::from_reason("No agents in batch"));
        }

        let input_per_agent = NUM_DIMS + 1;
        let input_size = input_per_agent * 4;
        if states_buf.len() < n * input_size {
            return Err(Error::from_reason(format!(
                "states_buf too small: expected {} bytes for {} agents, got {}",
                n * input_size, n, states_buf.len()
            )));
        }

        let graph = self.graph.as_ref()
            .ok_or_else(|| Error::from_reason("Social graph not initialized — call setupSocialGraphBinary first"))?;

        // Sync state from f32 input
        use rayon::prelude::*;
        self.agents.par_iter_mut().enumerate().for_each(|(i, agent)| {
            let offset = i * input_size;
            for d in 0..NUM_DIMS {
                agent.current[d] = read_f32(states_buf, offset + d * 4);
            }
        });

        // Tick with contagion
        crate::emotion::soa::f32_tick_with_contagion(
            &mut self.agents, &self.config,
            hours_elapsed as f32, hour_of_day as f32,
            &graph.offsets, &graph.neighbors, &graph.levels, &graph.strengths,
            self.tick_count,
        );

        self.tick_count += 1;

        // Write f32 output
        let output_per_agent = NUM_DIMS * 3 + 1 + 16;
        let mut out = vec![0u8; n * output_per_agent * 4];
        for (i, agent) in self.agents.iter().enumerate() {
            let base = i * output_per_agent * 4;
            let mut off = base;
            for d in 0..NUM_DIMS { write_f32(&mut out, off, agent.current[d]); off += 4; }
            for d in 0..NUM_DIMS { write_f32(&mut out, off, agent.mood[d]); off += 4; }
            for d in 0..NUM_DIMS { write_f32(&mut out, off, agent.baseline[d]); off += 4; }
            write_f32(&mut out, off, agent.stress); off += 4;
            for p in 0..16 { write_f32(&mut out, off, agent.pink_state[p]); off += 4; }
        }

        Ok(Buffer::from(out))
    }
}
