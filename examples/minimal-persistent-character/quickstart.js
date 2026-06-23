/**
 * Minimal Persistent Character Quickstart
 *
 * Demonstrates Andy Engine's basic capabilities:
 * 1. Create a character
 * 2. Tick the world
 * 3. View narrative and behavior
 *
 * Usage:
 *   node examples/minimal-persistent-character/quickstart.js
 */

const AndyEngine = require('../../index');

// Create world
const engine = new AndyEngine({ seed: 'quickstart' });

// Create character
const alice = engine.createCharacter({
  id: 'alice',
  name: 'Alice',
  mbti: 'INFP',
  schedule: 'student',
  background: ['一个安静的图书馆管理员', '喜欢看星星'],
});

// Place character in location
engine.world.regions.place('alice', '图书馆');

console.log('=== Andy Engine Quickstart ===\n');

// Tick world
console.log('1. Ticking world...');
for (let i = 0; i < 5; i++) {
  engine.tick();
}
console.log(`   World ticked ${engine.world.clock.tickCount} times\n`);

// View behavior
console.log('2. Character behavior:');
const agent = engine.getAgent('alice');
const behavior = agent.behavior;
console.log(`   Activity: ${behavior.vector[0].toFixed(2)}`);
console.log(`   Sociality: ${behavior.vector[1].toFixed(2)}`);
console.log(`   Focus: ${behavior.vector[2].toFixed(2)}`);
console.log(`   Expressiveness: ${behavior.vector[3].toFixed(2)}`);
console.log(`   Label: ${behavior.label}\n`);

// View narrative
console.log('3. Character narrative:');
const narrative = engine.getNarrative('alice');
console.log(`   ${narrative}\n`);

// View status
console.log('4. Character status:');
const status = agent.getStatus();
console.log(`   State: ${status.state}`);
console.log(`   Emotion: ${status.emotion}`);
console.log(`   Social Energy: ${status.socialEnergy}%`);
console.log(`   Health: ${status.health}%\n`);

// View memories
console.log('5. Character memories:');
const memories = agent.memory.memories;
console.log(`   Total memories: ${memories.length}`);
if (memories.length > 0) {
  const recent = memories[memories.length - 1];
  console.log(`   Most recent: ${recent.content?.substring(0, 50) || 'N/A'}...`);
}

console.log('\n=== Quickstart Complete ===');
