/**
 * PositionDelta coverage — 补未被测试守护的 typed delta
 *
 * PositionDelta 是 EffectCommitter 写回路径的核心 typed delta,
 * 此前无直接测试。本文件覆盖构造 + toJSON + 默认值。
 *
 * 纯逻辑,hermetic。
 */

import { describe, it, expect } from 'vitest';
import { PositionDelta } from '../../../src/effects/PositionDelta.js';

describe('PositionDelta', () => {
  it('constructs with agentId + payload {to, from, reason}', () => {
    const d = new PositionDelta('alice', { to: '食堂', from: '宿舍', reason: '去吃饭' });
    expect(d.type).toBe('position');
    expect(d.target).toBe('agent');
    expect(d.agentId).toBe('alice');
    expect(d.to).toBe('食堂');
    expect(d.from).toBe('宿舍');
    expect(d.reason).toBe('去吃饭');
  });

  it('defaults from=null and reason="" when omitted', () => {
    const d = new PositionDelta('bob', { to: '图书馆' });
    expect(d.from).toBeNull();
    expect(d.reason).toBe('');
    expect(d.to).toBe('图书馆');
  });

  it('toJSON serializes type/target/agentId + to/from/reason', () => {
    const d = new PositionDelta('alice', { to: '食堂', from: '宿舍', reason: '饿' });
    const j = d.toJSON();
    expect(j.type).toBe('position');
    expect(j.target).toBe('agent');
    expect(j.agentId).toBe('alice');
    expect(j.to).toBe('食堂');
    expect(j.from).toBe('宿舍');
    expect(j.reason).toBe('饿');
  });

  it('toJSON includes defaults when from/reason omitted', () => {
    const j = new PositionDelta('a', { to: 'x' }).toJSON();
    expect(j.from).toBeNull();
    expect(j.reason).toBe('');
  });

  it('extends StateDelta (inheritance)', () => {
    const { StateDelta } = require('../../../src/effects/StateDelta.js');
    expect(new PositionDelta('a', { to: 'x' })).toBeInstanceOf(StateDelta);
  });
});
