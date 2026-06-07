pub mod constants;
pub mod config;
pub mod vector;
pub mod soa;

/// Emotion dimension enum — maps 1:1 with EMOTION_DIMENSIONS in defaults.js
/// The discriminant values are used as array indices into [f64; 30]
#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum EmotionDimension {
    Joy = 0,
    Sadness = 1,
    Anger = 2,
    Fear = 3,
    Surprise = 4,
    Disgust = 5,
    Amusement = 6,
    Awe = 7,
    Contentment = 8,
    Desire = 9,
    Embarrassment = 10,
    Guilt = 11,
    Horror = 12,
    Interest = 13,
    Love = 14,
    Nervousness = 15,
    Pride = 16,
    Relief = 17,
    Satisfaction = 18,
    Shame = 19,
    Sympathy = 20,
    Triumph = 21,
    Boredom = 22,
    Calm = 23,
    Confusion = 24,
    Excitement = 25,
    Frustration = 26,
    Gratitude = 27,
    Hope = 28,
    Loneliness = 29,
}

impl EmotionDimension {
    /// Get the array index (same as the discriminant)
    #[inline]
    pub fn index(self) -> usize {
        self as usize
    }

    /// Look up by name string
    pub fn from_name(name: &str) -> Option<Self> {
        constants::dim_index(name).map(|i| constants::DIMENSIONS[i])
    }
}

// Re-exports for convenience
pub use constants::{DIMENSIONS, DIM_NAMES, NUM_DIMS};
pub use config::EmotionConfig;
pub use vector::EmotionVector;
