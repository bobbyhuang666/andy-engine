use serde::Deserialize;

/// Circadian rhythm parameters
#[derive(Clone, Debug, Deserialize)]
pub struct CircadianConfig {
    pub positive_affect_peak: f64,
    pub positive_affect_amp: f64,
    pub negative_affect_peak: f64,
    pub negative_affect_amp: f64,
}

impl Default for CircadianConfig {
    fn default() -> Self {
        Self {
            positive_affect_peak: 14.0,
            positive_affect_amp: 0.15,
            negative_affect_peak: 4.0,
            negative_affect_amp: 0.10,
        }
    }
}

/// Emotion system configuration — deserialized from ANDY_DEFAULTS.emotion
#[derive(Clone, Debug, Deserialize)]
pub struct EmotionConfig {
    pub decay_lambda: f64,
    pub inertia: f64,
    pub max_delta_per_tick: f64,
    pub noise_amplitude: f64,
    pub co_activation_weight: f64,
    pub baseline_drift_rate: f64,
    pub circadian: CircadianConfig,
}

impl Default for EmotionConfig {
    fn default() -> Self {
        Self {
            decay_lambda: 1.0,
            inertia: 0.5,
            max_delta_per_tick: 0.10,
            noise_amplitude: 0.015,
            co_activation_weight: 0.3,
            baseline_drift_rate: 0.0001,
            circadian: CircadianConfig::default(),
        }
    }
}

/// Behavior parameters derived from personality (passed from Node.js)
#[derive(Clone, Debug, Deserialize)]
pub struct BehaviorParams {
    pub emotion_decay_rate: f64,
    pub emotional_inertia: f64,
    pub susceptibility: f64,
    pub expressiveness: f64,
}

impl Default for BehaviorParams {
    fn default() -> Self {
        Self {
            emotion_decay_rate: 0.5,
            emotional_inertia: 0.3,
            susceptibility: 0.4,
            expressiveness: 0.5,
        }
    }
}
