/**
 * 最简诊断：1 agent, 1 tick, 零噪声
 * 对比 f64 vs f32 逐步输出
 */

'use strict';

const native = require('./native/index');

const DIM_NAMES = [
  'joy', 'sadness', 'anger', 'fear', 'surprise', 'disgust',
  'amusement', 'awe', 'contentment', 'desire', 'embarrassment', 'guilt',
  'horror', 'interest', 'love', 'nervousness', 'pride', 'relief',
  'satisfaction', 'shame', 'sympathy', 'triumph', 'boredom', 'calm',
  'confusion', 'excitement', 'frustration', 'gratitude', 'hope', 'loneliness',
];

const ZERO_CONFIG = JSON.stringify({
  decay_lambda: 1.0,
  inertia: 0.5,
  max_delta_per_tick: 0.10,
  noise_amplitude: 0.0,
  co_activation_weight: 0.3,
  baseline_drift_rate: 0.0001,
  circadian: {
    positive_affect_peak: 14.0,
    positive_affect_amp: 0.15,
    negative_affect_peak: 4.0,
    negative_affect_amp: 0.10,
  },
});

// 用一个固定的 baseline，不用随机
const baseline = {};
for (const dim of DIM_NAMES) baseline[dim] = 0.1;

const behavior = JSON.stringify({
  emotion_decay_rate: 0.5,
  emotional_inertia: 0.3,
  susceptibility: 0.5,
  expressiveness: 0.5,
});

const savedState = JSON.stringify({ current: baseline });

// Create engines
const f64e = new native.BatchEmotionEngine(42);
const f32e = new native.SoaBatchEngine(42);
f64e.addAgent(behavior, ZERO_CONFIG, savedState);
f32e.addAgent(behavior, ZERO_CONFIG, savedState);

// Build inputs: current[0..29]=0.1, stress=2.0
const f64in = Buffer.alloc(31 * 8);
const f32in = Buffer.alloc(31 * 4);
for (let d = 0; d < 30; d++) {
  f64in.writeDoubleLE(0.1, d * 8);
  f32in.writeFloatLE(0.1, d * 4);
}
f64in.writeDoubleLE(2.0, 30 * 8);
f32in.writeFloatLE(2.0, 30 * 4);

// Tick once
const hour = 8.0;
const dt = 5 / 60;

console.log('=== 1 agent, 1 tick, zero noise, baseline=0.1 ===\n');

const f64out = f64e.tickAllBinary(f64in, dt, hour);
const f32out = f32e.tickSoaBinary(f32in, dt, hour);

// Read outputs
console.log('维度           f64         f32         Δ');
console.log('─'.repeat(50));

let totalErr = 0;
for (let d = 0; d < 30; d++) {
  const v64 = f64out.readDoubleLE(d * 8);
  const v32 = f32out.readFloatLE(d * 4);
  const err = Math.abs(v64 - v32);
  totalErr += err;
  const marker = err > 0.01 ? ' ⚠️' : '';
  console.log(`${DIM_NAMES[d].padEnd(15)} ${v64.toFixed(6)}   ${v32.toFixed(6)}   ${err.toFixed(6)}${marker}`);
}

console.log('─'.repeat(50));
console.log(`MAE: ${(totalErr / 30).toFixed(6)}`);

// Also read mood, baseline from f64 output for reference
console.log('\nf64 mood (first 5):');
for (let d = 0; d < 5; d++) {
  console.log(`  ${DIM_NAMES[d]}: ${f64out.readDoubleLE((30 + d) * 8).toFixed(6)}`);
}

console.log('\nf32 mood (first 5):');
for (let d = 0; d < 5; d++) {
  console.log(`  ${DIM_NAMES[d]}: ${f32out.readFloatLE((30 + d) * 4).toFixed(6)}`);
}

// Check f32 output structure: total should be 107 * 4 = 428 bytes
console.log(`\nf64 output size: ${f64out.length} bytes (expected ${107 * 8})`);
console.log(`f32 output size: ${f32out.length} bytes (expected ${107 * 4})`);
