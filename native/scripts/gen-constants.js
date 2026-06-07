#!/usr/bin/env node
/**
 * gen-constants.js — Generate Rust constants from JS defaults.js
 *
 * Reads CO_ACTIVATION, EMOTION_OPPOSITES, EMOTION_DIMENSIONS from
 * ../config/defaults.js and writes ../native/src/emotion/constants.rs
 *
 * Usage: node native/scripts/gen-constants.js
 * Run whenever defaults.js is modified.
 */

const path = require('path');
const fs = require('fs');

// Load JS source of truth
const defaultsPath = path.resolve(__dirname, '../../config/defaults.js');
const defaults = require(defaultsPath);

const { EMOTION_DIMENSIONS, CO_ACTIVATION, EMOTION_OPPOSITES } = defaults;

// Build index map: dimension name → Rust enum variant name (PascalCase)
function toPascalCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const dimIndex = {};
EMOTION_DIMENSIONS.forEach((name, i) => {
  dimIndex[name] = i;
});

const NUM_DIMS = EMOTION_DIMENSIONS.length;
const PINK_NOISE_TAPS = 16;

// Generate Rust enum
const enumVariants = EMOTION_DIMENSIONS.map(toPascalCase);

// Generate constants
const coActivationEntries = Object.entries(CO_ACTIVATION).map(([src, targets]) => {
  const srcIdx = dimIndex[src];
  const targetIndices = targets.map(t => dimIndex[t]);
  return `    (${srcIdx}, &[${targetIndices.join(', ')}]),       // ${src} → ${targets.join(', ')}`;
});

// Opposites: deduplicated pairs (only one direction per pair)
const seen = new Set();
const oppositePairs = [];
for (const [a, b] of Object.entries(EMOTION_OPPOSITES)) {
  if (seen.has(`${b}:${a}`)) continue;
  if (seen.has(`${a}:${b}`)) continue;
  seen.add(`${a}:${b}`);
  oppositePairs.push([a, b]);
}
const oppositEntries = oppositePairs.map(([a, b]) =>
  `    (${dimIndex[a]}, ${dimIndex[b]}),   // ${toPascalCase(a)} ↔ ${toPascalCase(b)}`
);

// Determine positive / negative / arousal dimensions from JS EmotionVector
// These are the categories used in the tick pipeline
const POSITIVE = ['joy', 'contentment', 'satisfaction', 'excitement', 'calm',
  'hope', 'love', 'pride', 'gratitude', 'relief', 'triumph', 'amusement'];
const NEGATIVE = ['sadness', 'anger', 'fear', 'disgust', 'loneliness',
  'nervousness', 'frustration', 'guilt', 'shame', 'horror', 'boredom'];
// Negative-valence for getValence() — excludes boredom (matches JS getValence)
const NEGATIVE_VALENCE = ['sadness', 'anger', 'fear', 'disgust', 'loneliness',
  'nervousness', 'frustration', 'guilt', 'shame', 'horror'];
const HIGH_AROUSAL = ['anger', 'fear', 'excitement', 'surprise', 'nervousness',
  'horror', 'pride', 'love', 'triumph'];
const LOW_AROUSAL = ['calm', 'boredom', 'contentment', 'sadness'];

const formatIndices = (names) => names.map(n => dimIndex[n]);
const formatSortedIndices = (names) => names.map(n => dimIndex[n]).sort((a, b) => a - b);
const formatIndicesWithComment = (names, comment) =>
  `const ${comment}: [usize; ${names.length}] = [\n    ${formatIndices(names).map((idx, i) => {
    const enumName = toPascalCase(names[i]);
    return `${EmotionDimension}::${enumName} as usize`;
  }).join(',\n    ')}\n];`;

const EmotionDimension = 'EmotionDimension';

// Write the file
const output = `/// Emotion dimension constants
///
/// AUTO-GENERATED from ../config/defaults.js — DO NOT EDIT MANUALLY.
/// Run \`node native/scripts/gen-constants.js\` to regenerate after modifying defaults.js.

use super::EmotionDimension;
use EmotionDimension::*;

pub const NUM_DIMS: usize = ${NUM_DIMS};
pub const PINK_NOISE_TAPS: usize = ${PINK_NOISE_TAPS};

/// Canonical dimension ordering (matches defaults.js EMOTION_DIMENSIONS)
pub const DIMENSIONS: [EmotionDimension; NUM_DIMS] = [
    ${enumVariants.join(', ')},
];

/// Dimension name strings (for JS bridge, same order as DIMENSIONS)
pub const DIM_NAMES: [&str; NUM_DIMS] = [
    ${EMOTION_DIMENSIONS.map(n => `"${n}"`).join(', ')},
];

/// Look up dimension index by name (for JS bridge)
pub fn dim_index(name: &str) -> Option<usize> {
    DIM_NAMES.iter().position(|&n| n == name)
}

/// Co-activation matrix: source_index → [target_indices]
/// Auto-generated from CO_ACTIVATION in defaults.js
pub const CO_ACTIVATION: &[(${EmotionDimension}, &[${EmotionDimension}])] = &[
${CO_ACTIVATION ? Object.entries(CO_ACTIVATION).map(([src, targets]) => {
    const targetEnums = targets.map(t => toPascalCase(t)).join(', ');
    return `    (${toPascalCase(src)}, &[${targetEnums}]),`;
  }).join('\n') : ''}
];

/// Co-activation as index pairs: (source_idx, &[target_indices])
pub const CO_ACTIVATION_INDICES: &[(usize, &[usize])] = &[
${coActivationEntries.join('\n')}
];

/// Opposition pairs (deduplicated, each pair appears once)
/// Auto-generated from EMOTION_OPPOSITES in defaults.js
pub const OPPOSITION_PAIRS: &[(${EmotionDimension}, ${EmotionDimension})] = &[
${oppositePairs.map(([a, b]) => `    (${toPascalCase(a)}, ${toPascalCase(b)}),`).join('\n')}
];

/// Opposition as index pairs
pub const OPPOSITION_PAIRS_INDICES: &[(usize, usize)] = &[
${oppositEntries.join('\n')}
];

/// Positive-valence dimensions (used for getValence)
pub const POSITIVE_DIMS: &[${EmotionDimension}] = &[
    ${POSITIVE.map(n => toPascalCase(n)).join(', ')},
];

/// Positive-valence dimension indices (used in tick pipeline)
/// SORTED ascending for binary search in hot path
pub const POSITIVE_INDICES: [usize; ${POSITIVE.length}] = [
    ${formatSortedIndices(POSITIVE).join(', ')},
    // ${formatSortedIndices(POSITIVE).map(idx => EMOTION_DIMENSIONS[idx]).join(', ')}
];

/// Negative-valence dimensions (used for getValence)
pub const NEGATIVE_DIMS: &[${EmotionDimension}] = &[
    ${NEGATIVE.map(n => toPascalCase(n)).join(', ')},
];

/// Negative-valence dimension indices (for decay acceleration)
/// SORTED ascending for binary search in hot path
pub const NEGATIVE_INDICES_DECAY: [usize; ${NEGATIVE.length}] = [
    ${formatSortedIndices(NEGATIVE).join(', ')},
    // ${formatSortedIndices(NEGATIVE).map(idx => EMOTION_DIMENSIONS[idx]).join(', ')}
];

/// Negative-valence dimension indices for getValence() — excludes boredom (matches JS)
/// SORTED ascending for binary search in hot path
pub const NEGATIVE_VALENCE_INDICES: [usize; ${NEGATIVE_VALENCE.length}] = [
    ${formatSortedIndices(NEGATIVE_VALENCE).join(', ')},
    // ${formatSortedIndices(NEGATIVE_VALENCE).map(idx => EMOTION_DIMENSIONS[idx]).join(', ')}
];

/// High-arousal dimensions
pub const HIGH_AROUSAL: &[${EmotionDimension}] = &[
    ${HIGH_AROUSAL.map(n => toPascalCase(n)).join(', ')},
];

/// High-arousal dimension indices
/// SORTED ascending for binary search
pub const HIGH_AROUSAL_INDICES: [usize; ${HIGH_AROUSAL.length}] = [
    ${formatSortedIndices(HIGH_AROUSAL).join(', ')},
    // ${formatSortedIndices(HIGH_AROUSAL).map(idx => EMOTION_DIMENSIONS[idx]).join(', ')}
];

/// Low-arousal dimensions
pub const LOW_AROUSAL: &[${EmotionDimension}] = &[
    ${LOW_AROUSAL.map(n => toPascalCase(n)).join(', ')},
];

/// Low-arousal dimension indices
/// SORTED ascending for binary search
pub const LOW_AROUSAL_INDICES: [usize; ${LOW_AROUSAL.length}] = [
    ${formatSortedIndices(LOW_AROUSAL).join(', ')},
    // ${formatSortedIndices(LOW_AROUSAL).map(idx => EMOTION_DIMENSIONS[idx]).join(', ')}
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
`;

const outPath = path.resolve(__dirname, '../src/emotion/constants.rs');
fs.writeFileSync(outPath, output, 'utf-8');

console.log(`✓ Generated ${outPath}`);
console.log(`  ${NUM_DIMS} dimensions, ${Object.keys(CO_ACTIVATION).length} co-activation entries, ${oppositePairs.length} opposition pairs`);
console.log('  Run: cargo check -p andy-native  to verify compilation');
