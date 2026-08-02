import { describe, expect, it } from 'vitest';
import { classifyGroundedQuestion, classifyThirdPartyQuestion } from '../../../src/sdk/ConversationQuestion.js';

describe('classifyGroundedQuestion direct character surfaces', () => {
  it('does not route ordinary first-person or third-person statements', () => {
    expect(classifyGroundedQuestion('我打算明天旅行')).toBeNull();
    expect(classifyGroundedQuestion('我的朋友来了')).toBeNull();
    expect(classifyGroundedQuestion('我记得一件事')).toBeNull();
    expect(classifyGroundedQuestion('你朋友来了')).toBeNull();
  });

  it('routes direct relationship, memory, and intention questions', () => {
    expect(classifyGroundedQuestion('你认识谁？')).toBe('relationship');
    expect(classifyGroundedQuestion('你还记得什么？')).toBe('memory');
    expect(classifyGroundedQuestion('你接下来打算做什么？')).toBe('future_intention');
    expect(classifyGroundedQuestion('您计划去哪儿？')).toBe('future_intention');
  });

  it('keeps observation and recent-event no-pronoun questions', () => {
    expect(classifyGroundedQuestion('刚才发生了什么？')).toBe('recent_event');
    expect(classifyGroundedQuestion('观察到什么？')).toBe('observation');
  });

  it('recognizes only direct third-party knowledge questions', () => {
    const names = { alice: 'Alice', bob: 'Bob' };
    expect(classifyThirdPartyQuestion('Bob在哪里？', names, 'alice')).toEqual({
      targetId: 'bob', targetName: 'Bob', dimension: 'location',
    });
    expect(classifyThirdPartyQuestion('Bob最近在做什么？', names, 'alice')).toEqual({
      targetId: 'bob', targetName: 'Bob', dimension: 'recent',
    });
    expect(classifyThirdPartyQuestion('Bob感觉如何？', names, 'alice')).toEqual({
      targetId: 'bob', targetName: 'Bob', dimension: 'forbidden',
    });
    expect(classifyThirdPartyQuestion('Bob在酒馆', names, 'alice')).toBeNull();
  });
});
