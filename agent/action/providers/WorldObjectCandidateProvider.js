/**
 * WorldObjectCandidateProvider — 物体 affordance 候选提供者
 *
 * 读取 context.visibleObjects，为每个可见物体的每个 affordance 生成候选。
 * 物体交互必须经过 action selection → event → pipeline，不直接修改状态。
 */

const { CandidateProvider } = require('./CandidateProvider');
const { createCandidate } = require('../ActionCandidate');

class WorldObjectCandidateProvider extends CandidateProvider {
  constructor() {
    super('worldObject');
  }

  generate(context) {
    if (!context.visibleObjects || context.visibleObjects.length === 0) return [];

    const candidates = [];

    for (const obj of context.visibleObjects) {
      if (!obj.affordances || obj.affordances.length === 0) continue;

      for (const affordance of obj.affordances) {
        const need = affordance.need;
        const satisfyRate = affordance.satisfyRate || 0.1;

        // 只有当对应需求较低时才生成候选
        if (context.needs && context.needs[need] !== undefined && context.needs[need] > 0.7) {
          continue; // 需求充足，不需要使用物体
        }

        candidates.push(createCandidate({
          id: `cand_obj_${obj.id}_${need}`,
          type: 'consume',
          source: 'worldObject',
          label: `使用${obj.name}`,
          targetObjectId: obj.id,
          targetRegion: obj.location,
          expectedEffects: {
            needDelta: { [need]: satisfyRate },
          },
          metadata: {
            objectId: obj.id,
            objectType: obj.type,
            affordance: need,
          },
        }));
      }
    }

    return candidates;
  }
}

module.exports = { WorldObjectCandidateProvider };
