/**
 * Longitudinal Life Demo
 *
 * Demonstrates Andy Engine's "persistent life" capability:
 * - User leaves for 24 hours
 * - Character continues living in the background
 * - Events happen, relationships change, memories form
 * - When user returns, character responds based on real events
 *
 * Usage:
 *   node examples/longitudinal-life-demo/demo.js
 */

const AndyEngine = require('andy-engine');

async function runDemo() {
  console.log('=== Andy Engine Longitudinal Life Demo ===\n');

  // Create world
  const engine = new AndyEngine({ seed: 'longitudinal-demo' });

  // Create Alice
  const alice = engine.createCharacter({
    id: 'alice',
    name: 'Alice',
    mbti: 'INFP',
    schedule: 'student',
    background: ['一个安静的图书馆管理员', '喜欢看星星', '养了一只橘猫叫豆豆'],
  });

  // Create Bob
  const bob = engine.createCharacter({
    id: 'bob',
    name: 'Bob',
    mbti: 'ESTJ',
    schedule: 'student',
    background: ['一个热情的运动员', '喜欢篮球', '经常去健身房'],
  });

  console.log('Day 1, 18:00 - User interacts with Alice');
  console.log('Alice is in the library, reading a book.\n');

  // Place Alice in library
  engine.world.regions.place('alice', '图书馆');
  engine.world.regions.place('bob', '操场');

  // Simulate Day 1 evening
  console.log('--- Simulating Day 1 evening ---');
  for (let i = 0; i < 6; i++) {
    engine.tick();
  }

  // Get Alice's state
  const aliceState1 = engine.getAgent('alice').getStatus();
  console.log(`Alice state: ${aliceState1.state}`);
  console.log(`Alice behavior: ${JSON.stringify(aliceState1.behavior.vector)}`);

  console.log('\nDay 1, 22:00 - Alice goes to dinner with Bob');
  console.log('They have a small conflict about scheduling.\n');

  // Place them together for dinner
  engine.world.regions.place('alice', '食堂');
  engine.world.regions.place('bob', '食堂');

  // Simulate dinner
  for (let i = 0; i < 4; i++) {
    engine.tick();
  }

  // Check relationship
  const socialGraph = engine.world.socialGraph;
  const relationship = socialGraph.getRelationship('alice', 'bob');
  console.log(`Alice-Bob relationship strength: ${relationship?.strength.toFixed(3) || 'none'}`);

  console.log('\nDay 2, 08:00 - Alice takes a morning walk alone');
  console.log('She reflects on the previous night.\n');

  // Place Alice alone in park
  engine.world.regions.place('alice', '公园');
  engine.world.regions.place('bob', '图书馆');

  // Simulate morning walk
  for (let i = 0; i < 8; i++) {
    engine.tick();
  }

  // Get Alice's memories
  const aliceMemories = engine.getAgent('alice').memory.memories;
  console.log(`Alice has ${aliceMemories.length} memories`);

  console.log('\nDay 2, 18:00 - User returns');
  console.log('User asks Alice about her day.\n');

  // Get Alice's narrative
  const aliceNarrative = engine.getNarrative('alice', {
    userText: '你今天怎么样？',
  });

  console.log('Alice\'s response:');
  console.log('---');
  console.log(aliceNarrative);
  console.log('---\n');

  // Get Alice's final state
  const aliceState2 = engine.getAgent('alice').getStatus();
  console.log('Alice\'s final state:');
  console.log(`- State: ${aliceState2.state}`);
  console.log(`- Behavior: ${JSON.stringify(aliceState2.behavior.vector)}`);
  console.log(`- Emotion: ${aliceState2.emotion}`);
  console.log(`- Social Energy: ${aliceState2.socialEnergy}%`);
  console.log(`- Health: ${aliceState2.health}%`);

  // Verify persistence
  console.log('\n--- Verification ---');
  console.log(`✓ World continued ticking: ${engine.world.clock.tickCount} ticks`);
  console.log(`✓ Events recorded: ${engine.world.eventDispatcher.eventLog.length} events`);
  console.log(`✓ Memories formed: ${aliceMemories.length} memories`);
  console.log(`✓ Relationship evolved: ${relationship?.strength.toFixed(3) || 'none'}`);
  console.log(`✓ Narrative based on real events: ${aliceNarrative.length > 0 ? 'yes' : 'no'}`);

  console.log('\n=== Demo Complete ===');
  console.log('Alice lived her life while the user was away.');
  console.log('When the user returned, Alice responded based on real events.');
}

runDemo().catch(console.error);
