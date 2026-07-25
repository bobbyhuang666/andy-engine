import { describe, expect, it } from 'vitest';
import AndyEngine from '../../index.js';

describe('public immutable read projections', () => {
  it('cannot mutate agent or social state through projection results', () => {
    const engine = new AndyEngine({ seed: 'read-projection' });
    engine.createCharacter({ id: 'maya', name: 'Maya', mbti: 'INFP' });
    engine.createCharacter({ id: 'leo', name: 'Leo', mbti: 'ENFP' });
    engine.getSocialGraph().getOrCreateRelationship('maya', 'leo');

    const agent = engine.getAgentSnapshot('maya');
    const agents = engine.getAgentsSnapshot();
    const graph = engine.getSocialGraphSnapshot();

    expect(Object.isFrozen(agent)).toBe(true);
    expect(Object.isFrozen(agents)).toBe(true);
    expect(Object.isFrozen(graph)).toBe(true);
    expect(() => { agent.position = 'tampered'; }).toThrow();
    expect(engine.getAgent('maya').position).not.toBe('tampered');
  });
});
