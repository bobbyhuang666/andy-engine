/**
 * StateMachine 模块测试套件
 *
 * 迁移自 test.js 行 177-208+
 * 原始 assert 数量：待统计
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { StateMachine, STATES } from '../../agent/StateMachine.js';

describe('StateMachine 模块', () => {
  describe('基础功能', () => {
    let sm;

    beforeAll(() => {
      sm = new StateMachine('在图书馆');
    });

    it('初始状态应该正确', () => {
      expect(sm.currentState).toBe('在图书馆');
    });

    it('应该有 40+ 个状态', () => {
      const stateCount = Object.keys(STATES).length;
      expect(stateCount).toBeGreaterThanOrEqual(40);
    });
  });

  describe('状态转移完整性', () => {
    it('所有转移都应该指向合法状态', () => {
      for (const [stateName, stateDef] of Object.entries(STATES)) {
        for (const next of stateDef.next) {
          expect(
            STATES[next],
            `${stateName} → ${next}: target state not defined`
          ).toBeDefined();
        }
      }
    });

    it('每个状态都应该有时间约束', () => {
      for (const [stateName, stateDef] of Object.entries(STATES)) {
        expect(
          stateDef.hours.length,
          `State ${stateName} has valid hours`
        ).toBeGreaterThan(0);
      }
    });

    it('时间约束应该在 [0,23]', () => {
      for (const [stateName, stateDef] of Object.entries(STATES)) {
        for (const h of stateDef.hours) {
          expect(h, `State ${stateName} hour ${h}`).toBeGreaterThanOrEqual(0);
          expect(h, `State ${stateName} hour ${h}`).toBeLessThanOrEqual(23);
        }
      }
    });
  });
});
