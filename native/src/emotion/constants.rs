/// Emotion dimension constants
///
/// AUTO-GENERATED from ../config/defaults.js — DO NOT EDIT MANUALLY.
/// Run `node native/scripts/gen-constants.js` to regenerate after modifying defaults.js.

use super::EmotionDimension;
use EmotionDimension::*;

pub const NUM_DIMS: usize = 30;
pub const PINK_NOISE_TAPS: usize = 16;

/// Canonical dimension ordering (matches defaults.js EMOTION_DIMENSIONS)
pub const DIMENSIONS: [EmotionDimension; NUM_DIMS] = [
    Joy, Sadness, Anger, Fear, Surprise, Disgust, Amusement, Awe, Contentment, Desire, Embarrassment, Guilt, Horror, Interest, Love, Nervousness, Pride, Relief, Satisfaction, Shame, Sympathy, Triumph, Boredom, Calm, Confusion, Excitement, Frustration, Gratitude, Hope, Loneliness,
];

/// Dimension name strings (for JS bridge, same order as DIMENSIONS)
pub const DIM_NAMES: [&str; NUM_DIMS] = [
    "joy", "sadness", "anger", "fear", "surprise", "disgust", "amusement", "awe", "contentment", "desire", "embarrassment", "guilt", "horror", "interest", "love", "nervousness", "pride", "relief", "satisfaction", "shame", "sympathy", "triumph", "boredom", "calm", "confusion", "excitement", "frustration", "gratitude", "hope", "loneliness",
];

/// Look up dimension index by name (for JS bridge)
pub fn dim_index(name: &str) -> Option<usize> {
    DIM_NAMES.iter().position(|&n| n == name)
}

/// Co-activation matrix: source_index → [target_indices]
/// Auto-generated from CO_ACTIVATION in defaults.js
pub const CO_ACTIVATION: &[(EmotionDimension, &[EmotionDimension])] = &[
    (Joy, &[Contentment, Satisfaction, Excitement, Pride, Love]),
    (Sadness, &[Loneliness, Frustration, Guilt, Shame]),
    (Anger, &[Frustration, Disgust, Nervousness]),
    (Fear, &[Nervousness, Horror, Confusion]),
    (Surprise, &[Confusion, Interest, Excitement]),
    (Contentment, &[Joy, Calm, Satisfaction]),
    (Loneliness, &[Sadness, Boredom, Hope]),
    (Boredom, &[Frustration, Loneliness, Calm]),
    (Excitement, &[Joy, Interest, Hope]),
    (Nervousness, &[Fear, Confusion]),
    (Calm, &[Contentment, Satisfaction]),
    (Interest, &[Excitement, Hope]),
    (Frustration, &[Anger, Sadness, Boredom]),
    (Hope, &[Interest, Excitement, Joy]),
    (Gratitude, &[Joy, Contentment, Love]),
    (Love, &[Joy, Contentment, Gratitude, Sympathy]),
    (Pride, &[Joy, Satisfaction, Excitement]),
    (Disgust, &[Anger, Frustration]),
    (Shame, &[Sadness, Embarrassment, Guilt]),
    (Guilt, &[Sadness, Shame, Nervousness]),
    (Horror, &[Fear, Disgust, Nervousness]),
    (Embarrassment, &[Shame, Nervousness]),
    (Awe, &[Interest, Calm, Excitement]),
    (Desire, &[Excitement, Interest]),
    (Sympathy, &[Sadness, Love, Gratitude]),
    (Triumph, &[Joy, Pride, Excitement]),
    (Confusion, &[Nervousness, Frustration]),
    (Relief, &[Calm, Contentment]),
    (Amusement, &[Joy, Excitement]),
];

/// Co-activation as index pairs: (source_idx, &[target_indices])
pub const CO_ACTIVATION_INDICES: &[(usize, &[usize])] = &[
    (0, &[8, 18, 25, 16, 14]),       // joy → contentment, satisfaction, excitement, pride, love
    (1, &[29, 26, 11, 19]),       // sadness → loneliness, frustration, guilt, shame
    (2, &[26, 5, 15]),       // anger → frustration, disgust, nervousness
    (3, &[15, 12, 24]),       // fear → nervousness, horror, confusion
    (4, &[24, 13, 25]),       // surprise → confusion, interest, excitement
    (8, &[0, 23, 18]),       // contentment → joy, calm, satisfaction
    (29, &[1, 22, 28]),       // loneliness → sadness, boredom, hope
    (22, &[26, 29, 23]),       // boredom → frustration, loneliness, calm
    (25, &[0, 13, 28]),       // excitement → joy, interest, hope
    (15, &[3, 24]),       // nervousness → fear, confusion
    (23, &[8, 18]),       // calm → contentment, satisfaction
    (13, &[25, 28]),       // interest → excitement, hope
    (26, &[2, 1, 22]),       // frustration → anger, sadness, boredom
    (28, &[13, 25, 0]),       // hope → interest, excitement, joy
    (27, &[0, 8, 14]),       // gratitude → joy, contentment, love
    (14, &[0, 8, 27, 20]),       // love → joy, contentment, gratitude, sympathy
    (16, &[0, 18, 25]),       // pride → joy, satisfaction, excitement
    (5, &[2, 26]),       // disgust → anger, frustration
    (19, &[1, 10, 11]),       // shame → sadness, embarrassment, guilt
    (11, &[1, 19, 15]),       // guilt → sadness, shame, nervousness
    (12, &[3, 5, 15]),       // horror → fear, disgust, nervousness
    (10, &[19, 15]),       // embarrassment → shame, nervousness
    (7, &[13, 23, 25]),       // awe → interest, calm, excitement
    (9, &[25, 13]),       // desire → excitement, interest
    (20, &[1, 14, 27]),       // sympathy → sadness, love, gratitude
    (21, &[0, 16, 25]),       // triumph → joy, pride, excitement
    (24, &[15, 26]),       // confusion → nervousness, frustration
    (17, &[23, 8]),       // relief → calm, contentment
    (6, &[0, 25]),       // amusement → joy, excitement
];

/// Opposition pairs (deduplicated, each pair appears once)
/// Auto-generated from EMOTION_OPPOSITES in defaults.js
pub const OPPOSITION_PAIRS: &[(EmotionDimension, EmotionDimension)] = &[
    (Joy, Sadness),
    (Anger, Calm),
    (Fear, Triumph),
    (Interest, Boredom),
    (Loneliness, Contentment),
    (Hope, Frustration),
    (Nervousness, Relief),
    (Excitement, Boredom),
];

/// Opposition as index pairs
pub const OPPOSITION_PAIRS_INDICES: &[(usize, usize)] = &[
    (0, 1),   // Joy ↔ Sadness
    (2, 23),   // Anger ↔ Calm
    (3, 21),   // Fear ↔ Triumph
    (13, 22),   // Interest ↔ Boredom
    (29, 8),   // Loneliness ↔ Contentment
    (28, 26),   // Hope ↔ Frustration
    (15, 17),   // Nervousness ↔ Relief
    (25, 22),   // Excitement ↔ Boredom
];

/// Positive-valence dimensions (used for getValence)
pub const POSITIVE_DIMS: &[EmotionDimension] = &[
    Joy, Contentment, Satisfaction, Excitement, Calm, Hope, Love, Pride, Gratitude, Relief, Triumph, Amusement,
];

/// Positive-valence dimension indices (used in tick pipeline)
/// SORTED ascending for binary search in hot path
pub const POSITIVE_INDICES: [usize; 12] = [
    0, 6, 8, 14, 16, 17, 18, 21, 23, 25, 27, 28,
    // joy, amusement, contentment, love, pride, relief, satisfaction, triumph, calm, excitement, gratitude, hope
];

/// Negative-valence dimensions (used for getValence)
pub const NEGATIVE_DIMS: &[EmotionDimension] = &[
    Sadness, Anger, Fear, Disgust, Loneliness, Nervousness, Frustration, Guilt, Shame, Horror, Boredom,
];

/// Negative-valence dimension indices (for decay acceleration)
/// SORTED ascending for binary search in hot path
pub const NEGATIVE_INDICES_DECAY: [usize; 11] = [
    1, 2, 3, 5, 11, 12, 15, 19, 22, 26, 29,
    // sadness, anger, fear, disgust, guilt, horror, nervousness, shame, boredom, frustration, loneliness
];

/// Negative-valence dimension indices for getValence() — excludes boredom (matches JS)
/// SORTED ascending for binary search in hot path
pub const NEGATIVE_VALENCE_INDICES: [usize; 10] = [
    1, 2, 3, 5, 11, 12, 15, 19, 26, 29,
    // sadness, anger, fear, disgust, guilt, horror, nervousness, shame, frustration, loneliness
];

/// High-arousal dimensions
pub const HIGH_AROUSAL: &[EmotionDimension] = &[
    Anger, Fear, Excitement, Surprise, Nervousness, Horror, Pride, Love, Triumph,
];

/// High-arousal dimension indices
/// SORTED ascending for binary search
pub const HIGH_AROUSAL_INDICES: [usize; 9] = [
    2, 3, 4, 12, 14, 15, 16, 21, 25,
    // anger, fear, surprise, horror, love, nervousness, pride, triumph, excitement
];

/// Low-arousal dimensions
pub const LOW_AROUSAL: &[EmotionDimension] = &[
    Calm, Boredom, Contentment, Sadness,
];

/// Low-arousal dimension indices
/// SORTED ascending for binary search
pub const LOW_AROUSAL_INDICES: [usize; 4] = [
    1, 8, 22, 23,
    // sadness, contentment, boredom, calm
];

/// Circadian positive emotion indices (subset used in circadian modulation)
pub const CIRCADIAN_POSITIVE_INDICES: [usize; 6] = [
    Joy as usize, Contentment as usize, Satisfaction as usize,
    Excitement as usize, Calm as usize, Hope as usize,
];

/// Circadian negative emotion indices (subset used in circadian modulation)
pub const CIRCADIAN_NEGATIVE_INDICES: [usize; 6] = [
    Sadness as usize, Anger as usize, Fear as usize,
    Loneliness as usize, Nervousness as usize, Frustration as usize,
];

/// Non-negative emotion dimensions (intensity-only, min=0)
pub const NON_NEGATIVE: [bool; NUM_DIMS] = {
    let mut arr = [false; NUM_DIMS];
    arr[Loneliness as usize] = true;
    arr[Boredom as usize] = true;
    arr[Nervousness as usize] = true;
    arr[Guilt as usize] = true;
    arr[Shame as usize] = true;
    arr[Embarrassment as usize] = true;
    arr
};

/// Positive-valence bitmask for SIMD-friendly time_decay and circadian loops.
/// Replaces POSITIVE_INDICES.binary_search(&i) with O(1) direct lookup.
/// LLVM can auto-vectorize loops using this [bool; 30] mask via blend instructions.
pub const IS_POSITIVE: [bool; NUM_DIMS] = {
    let mut arr = [false; NUM_DIMS];
    arr[Joy as usize] = true;
    arr[Contentment as usize] = true;
    arr[Satisfaction as usize] = true;
    arr[Excitement as usize] = true;
    arr[Calm as usize] = true;
    arr[Hope as usize] = true;
    arr[Love as usize] = true;
    arr[Pride as usize] = true;
    arr[Gratitude as usize] = true;
    arr[Relief as usize] = true;
    arr[Triumph as usize] = true;
    arr[Amusement as usize] = true;
    arr
};

/// Negative-valence bitmask for SIMD-friendly decay acceleration.
/// Replaces NEGATIVE_INDICES_DECAY.binary_search(&i) with O(1) direct lookup.
pub const IS_NEGATIVE_DECAY: [bool; NUM_DIMS] = {
    let mut arr = [false; NUM_DIMS];
    arr[Sadness as usize] = true;
    arr[Anger as usize] = true;
    arr[Fear as usize] = true;
    arr[Disgust as usize] = true;
    arr[Guilt as usize] = true;
    arr[Horror as usize] = true;
    arr[Nervousness as usize] = true;
    arr[Shame as usize] = true;
    arr[Boredom as usize] = true;
    arr[Frustration as usize] = true;
    arr[Loneliness as usize] = true;
    arr
};
