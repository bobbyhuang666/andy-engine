/**
 * Module Guard Contract Tests
 *
 * 为 W2 模块守护判定识别出的"未守护"模块补直接测试入口。
 * 这些模块此前无任何测试 import，仅经上游/facade 间接可达或完全不可达。
 * 本测试覆盖导出契约（barrels）与校验契约（schemas），
 * 让 scripts/module-guard-scan.js 把它们判为 guarded-direct。
 *
 * 不为补 coverage 数字凑测试（阶段边界）——每个断言针对真实导出/校验行为。
 */

import { describe, it, expect } from 'vitest';

// ─── Barrels: 验证公开导出形状契约 ───

const effectsBarrel = require('../../src/effects');
const narrativeBarrel = require('../../src/narrative');
const pressureBarrel = require('../../src/pressure');
const runtimeBarrel = require('../../src/runtime');

describe('module-guard: src/effects barrel 导出契约', () => {
  it('导出全部 7 类 typed delta + StateDelta 基类 + EffectResult/EffectCommitter + pipeline 函数', () => {
    const expected = [
      'StateDelta', 'NeedDelta', 'EmotionDelta', 'MemoryDelta',
      'RelationshipDelta', 'LocationMeaningDelta', 'FutureTendencyDelta',
      'PositionDelta', 'EffectResult', 'EffectCommitter',
    ];
    for (const name of expected) {
      expect(effectsBarrel[name], `effects barrel 缺 ${name}`).toBeDefined();
    }
    // pipeline 函数
    expect(typeof effectsBarrel.applyActionEffect).toBe('function');
    expect(typeof effectsBarrel.computeDeltas).toBe('function');
    expect(typeof effectsBarrel.computeStateDeltas).toBe('function');
    expect(typeof effectsBarrel.applyEventConsequences).toBe('function');
  });
});

describe('module-guard: src/narrative barrel 导出契约', () => {
  it('导出 FactProvider/FactConsistencyChecker/FactFormatter', () => {
    for (const name of ['FactProvider', 'FactConsistencyChecker', 'FactFormatter']) {
      expect(narrativeBarrel[name], `narrative barrel 缺 ${name}`).toBeDefined();
    }
  });
});

describe('module-guard: src/pressure barrel 导出契约', () => {
  it('导出全部 pressure source + PressureContext', () => {
    const expected = [
      'WorldPressure', 'NeedPressure', 'MemoryPressure',
      'RelationshipPressure', 'LocationPressure', 'PressureContext',
    ];
    for (const name of expected) {
      expect(pressureBarrel[name], `pressure barrel 缺 ${name}`).toBeDefined();
    }
  });
});

describe('module-guard: src/runtime barrel 导出契约', () => {
  it('导出 AndyWorld/WorldClock/RuntimeContext/RuntimeConfig', () => {
    for (const name of ['AndyWorld', 'WorldClock', 'RuntimeContext', 'RuntimeConfig']) {
      expect(runtimeBarrel[name], `runtime barrel 缺 ${name}`).toBeDefined();
    }
  });
});

// ─── Schemas: 验证校验契约 ───

const { validateCanonEvent } = require('../../src/shared/schemas/CanonEvent.schema');
const { validateGroundingPackage } = require('../../src/shared/schemas/GroundingPackage.schema');
const { validateKnowledgeFact } = require('../../src/shared/schemas/KnowledgeFact.schema');
const { validateStateDelta } = require('../../src/shared/schemas/StateDelta.schema');
const { validateWorldFact } = require('../../src/shared/schemas/WorldFact.schema');

describe('module-guard: CanonEvent schema 校验', () => {
  it('缺少 type/content 报错，完整对象通过', () => {
    expect(validateCanonEvent(null).valid).toBe(false);
    expect(validateCanonEvent({}).errors).toContain('type is required');
    expect(validateCanonEvent({ type: 'x', content: 'y' }).valid).toBe(true);
  });
});

describe('module-guard: GroundingPackage schema 校验', () => {
  it('非对象失败，对象通过', () => {
    expect(validateGroundingPackage(null).valid).toBe(false);
    expect(validateGroundingPackage({}).valid).toBe(true);
  });
});

describe('module-guard: KnowledgeFact schema 校验', () => {
  it('缺少 subject/predicate 报错', () => {
    expect(validateKnowledgeFact({}).errors).toEqual(expect.arrayContaining(['subject is required', 'predicate is required']));
    expect(validateKnowledgeFact({ subject: 'a', predicate: 'b' }).valid).toBe(true);
  });
});

describe('module-guard: StateDelta schema 校验', () => {
  it('非对象失败，对象通过', () => {
    expect(validateStateDelta(null).valid).toBe(false);
    expect(validateStateDelta({}).valid).toBe(true);
  });
});

describe('module-guard: WorldFact schema 校验', () => {
  it('缺少 id/subject/predicate 报错，完整对象通过', () => {
    const r = validateWorldFact({});
    expect(r.errors).toEqual(expect.arrayContaining(['id is required', 'subject is required', 'predicate is required']));
    expect(validateWorldFact({ id: '1', subject: 'a', predicate: 'b' }).valid).toBe(true);
  });
});
