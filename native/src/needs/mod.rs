pub mod config;

use config::NeedsConfig;
use serde::{Deserialize, Serialize};

pub const NUM_NEEDS: usize = 5;

/// Need dimension indices
#[repr(u8)]
#[derive(Clone, Copy, Debug)]
pub enum Need {
    Hunger = 0,
    Energy = 1,
    Social = 2,
    Comfort = 3,
    Stimulation = 4,
}

/// NEED_SATISFACTION lookup — which states/regions satisfy which needs
/// Matches NEED_SATISFACTION from NeedsSystem.js
/// Bitmask representation for O(1) lookup
pub struct SatisfactionMapping {
    pub states: &'static [&'static str],
    pub regions: &'static [&'static str],
}

pub static SATISFACTION: [(Need, SatisfactionMapping); NUM_NEEDS] = [
    (Need::Hunger, SatisfactionMapping {
        states: &["在食堂", "在吃饭", "在做饭", "做好了", "在便利店"],
        regions: &["食堂", "便利店"],
    }),
    (Need::Energy, SatisfactionMapping {
        states: &["睡了", "在翻身", "快睡了", "在休息", "趴一会", "先躺一会"],
        regions: &["宿舍", "家"],
    }),
    (Need::Social, SatisfactionMapping {
        states: &["在聊天", "在食堂", "在校园广场", "在咖啡店", "在开会"],
        regions: &["食堂", "校园广场", "咖啡店"],
    }),
    (Need::Comfort, SatisfactionMapping {
        states: &["在家", "到家了", "在宿舍", "在休息", "在看剧", "在洗澡"],
        regions: &["家", "宿舍"],
    }),
    (Need::Stimulation, SatisfactionMapping {
        states: &["在看剧", "在听歌", "在看书", "在咖啡店", "在看手机", "在打工"],
        regions: &["咖啡店", "操场", "公园"],
    }),
];

/// NEED_DRIVE_STATES — target states when a need is deficient
pub static DRIVE_STATES: [(Need, &[&str]); NUM_NEEDS] = [
    (Need::Hunger, &["在食堂", "在便利店"]),
    (Need::Energy, &["在休息", "睡了", "趴一会", "先躺一会"]),
    (Need::Social, &["在聊天", "在校园广场", "在咖啡店"]),
    (Need::Comfort, &["到家了", "在休息", "先躺一会"]),
    (Need::Stimulation, &["在看手机", "在看剧", "在操场", "在咖啡店", "在看书"]),
];

/// Drive signal from a deficient need
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Drive {
    pub need: String,
    pub urgency: f64,
    pub target_states: Vec<String>,
}

/// NeedsSystem — Maslow-inspired need hierarchy
pub struct NeedsSystem {
    pub needs: [f64; NUM_NEEDS],
    pub decay_rates: [f64; NUM_NEEDS],
    pub config: NeedsConfig,
}

impl NeedsSystem {
    /// Create new NeedsSystem with personality-adjusted decay rates
    pub fn new(ocean_neuroticism: f64, ocean_extraversion: f64, ocean_openness: f64, config: NeedsConfig) -> Self {
        let base = &config.decay_rate;
        let decay_rates = [
            base.hunger,                                                     // 生理需求不受人格影响
            base.energy * (1.0 + ocean_neuroticism * 0.2),                   // 神经质高→精力消耗更快
            base.social * (1.0 + ocean_extraversion * 0.5),                  // 外向→社交需求衰减更快
            base.comfort * (1.0 + ocean_neuroticism * 0.3),                  // 神经质→更不安
            base.stimulation * (1.0 + ocean_openness * 0.4),                 // 开放→更渴望新刺激
        ];

        Self {
            needs: [0.8, 0.9, 0.6, 0.7, 0.5], // Initial values matching JS
            decay_rates,
            config,
        }
    }

    /// Restore from saved state
    pub fn from_saved(needs: [f64; NUM_NEEDS], decay_rates: [f64; NUM_NEEDS], config: NeedsConfig) -> Self {
        Self { needs, decay_rates, config }
    }

    /// Advance needs — decay + recovery
    pub fn tick(&mut self, hours_elapsed: f64, current_state: &str, current_region: &str) {
        // Step 1: Natural decay (exponential with floor protection)
        for i in 0..NUM_NEEDS {
            let current = self.needs[i];
            let rate = self.decay_rates[i];
            let effective_rate = rate * (0.5 + current * 0.5);
            self.needs[i] = (current - effective_rate * hours_elapsed).max(0.0);
        }

        // Step 2: Activity-based recovery
        for (need_idx, mapping) in SATISFACTION.iter() {
            let idx = *need_idx as usize;
            let mut recovery = 0.0;

            let base_recovery = match need_idx {
                Need::Hunger => self.config.recovery_rate.hunger,
                Need::Energy => self.config.recovery_rate.energy,
                Need::Social => self.config.recovery_rate.social,
                Need::Comfort => self.config.recovery_rate.comfort,
                Need::Stimulation => self.config.recovery_rate.stimulation,
            };

            if mapping.states.contains(&current_state) {
                recovery += base_recovery;
            }
            if mapping.regions.contains(&current_region) {
                recovery += base_recovery * 0.3;
            }

            if recovery > 0.0 {
                self.needs[idx] = (self.needs[idx] + recovery * hours_elapsed).min(1.0);
            }
        }
    }

    /// Get the most urgent drive signal
    pub fn get_drive(&self) -> Option<Drive> {
        let mut max_urgency = 0.0_f64;
        let mut urgent_need_idx = None;

        for i in 0..NUM_NEEDS {
            let threshold = match i {
                0 => self.config.threshold.hunger,
                1 => self.config.threshold.energy,
                2 => self.config.threshold.social,
                3 => self.config.threshold.comfort,
                4 => self.config.threshold.stimulation,
                _ => 0.3,
            };
            if self.needs[i] < threshold {
                let urgency = threshold - self.needs[i];
                if urgency > max_urgency {
                    max_urgency = urgency;
                    urgent_need_idx = Some(i);
                }
            }
        }

        urgent_need_idx.map(|idx| {
            let need_name = match idx {
                0 => "hunger",
                1 => "energy",
                2 => "social",
                3 => "comfort",
                4 => "stimulation",
                _ => "unknown",
            };
            let target_states: Vec<String> = DRIVE_STATES.iter()
                .find(|(n, _)| *n as usize == idx)
                .map(|(_, states)| states.iter().map(|s| s.to_string()).collect())
                .unwrap_or_default();

            Drive {
                need: need_name.to_string(),
                urgency: max_urgency,
                target_states,
            }
        })
    }

    /// Get state transition weight modifiers for candidate states
    pub fn get_state_weights(&self, candidate_states: &[String]) -> Vec<f64> {
        let drive = self.get_drive();
        match drive {
            None => vec![1.0; candidate_states.len()],
            Some(d) => {
                candidate_states.iter().map(|state| {
                    if d.target_states.contains(state) {
                        1.0 + d.urgency * 3.0
                    } else {
                        1.0
                    }
                }).collect()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use config::NeedsConfig;

    #[test]
    fn test_needs_decay() {
        let config = NeedsConfig::default();
        let mut ns = NeedsSystem::new(0.5, 0.5, 0.5, config);
        let initial_hunger = ns.needs[0];

        ns.tick(1.0, "在图书馆", "图书馆");

        assert!(ns.needs[0] < initial_hunger, "Hunger should decay");
    }

    #[test]
    fn test_food_recovery() {
        let config = NeedsConfig::default();
        let mut ns = NeedsSystem::new(0.5, 0.5, 0.5, config);
        ns.needs[0] = 0.2; // Hungry

        ns.tick(1.0, "在食堂", "食堂");

        assert!(ns.needs[0] > 0.2, "Hunger should recover when eating");
    }

    #[test]
    fn test_drive_urgency() {
        let config = NeedsConfig::default();
        let mut ns = NeedsSystem::new(0.5, 0.5, 0.5, config);
        ns.needs[0] = 0.1; // Very hungry (< threshold 0.3)

        let drive = ns.get_drive();
        assert!(drive.is_some(), "Should have a drive when hungry");
        let d = drive.unwrap();
        assert_eq!(d.need, "hunger");
        assert!(d.urgency > 0.0);
    }

    #[test]
    fn test_no_drive_when_satisfied() {
        let config = NeedsConfig::default();
        let mut ns = NeedsSystem::new(0.5, 0.5, 0.5, config);
        // All needs above threshold
        ns.needs = [0.8, 0.8, 0.8, 0.8, 0.8];

        let drive = ns.get_drive();
        assert!(drive.is_none(), "Should have no drive when satisfied");
    }
}
