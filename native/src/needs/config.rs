use serde::Deserialize;

/// NeedsSystem configuration — deserialized from ANDY_DEFAULTS.needs
#[derive(Clone, Debug, Deserialize)]
pub struct NeedsConfig {
    pub decay_rate: NeedsDecayRate,
    pub recovery_rate: NeedsRecoveryRate,
    pub threshold: NeedsThreshold,
}

#[derive(Clone, Debug, Deserialize)]
pub struct NeedsDecayRate {
    pub hunger: f64,
    pub energy: f64,
    pub social: f64,
    pub comfort: f64,
    pub stimulation: f64,
}

#[derive(Clone, Debug, Deserialize)]
pub struct NeedsRecoveryRate {
    pub hunger: f64,
    pub energy: f64,
    pub social: f64,
    pub comfort: f64,
    pub stimulation: f64,
}

#[derive(Clone, Debug, Deserialize)]
pub struct NeedsThreshold {
    pub hunger: f64,
    pub energy: f64,
    pub social: f64,
    pub comfort: f64,
    pub stimulation: f64,
}

impl Default for NeedsConfig {
    fn default() -> Self {
        Self {
            decay_rate: NeedsDecayRate {
                hunger: 0.08,
                energy: 0.10, // R5: 与 JS defaults.js 同步，从 0.06 提升到 0.10
                social: 0.04,
                comfort: 0.03,
                stimulation: 0.05,
            },
            recovery_rate: NeedsRecoveryRate {
                hunger: 0.5,
                energy: 0.15,
                social: 0.3,
                comfort: 0.2,
                stimulation: 0.25,
            },
            threshold: NeedsThreshold {
                hunger: 0.3,
                energy: 0.25,
                social: 0.2,
                comfort: 0.2,
                stimulation: 0.15,
            },
        }
    }
}
