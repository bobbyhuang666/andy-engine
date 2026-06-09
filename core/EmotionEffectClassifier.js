/**
 * EmotionEffectClassifier — 用户消息 → Andy 30 维情绪 effect
 *
 * 设计原则:
 *   1. 不用正则匹配，用关键词→30维 effect 映射表
 *   2. 输出直接是 Andy applyEffect() 能吃的格式
 *   3. 多个关键词的 effect 累加（用户说"又累又烦"→ 疲劳 + 挫败）
 *   4. 强度根据关键词数量和上下文自适应
 *
 * 将来升级路径:
 *   - 短期: 当前关键词映射（覆盖 90% 日常场景）
 *   - 中期: 加一个 fastText 小模型（50KB，本地推理 <1ms）
 *   - 长期: 用 Bobby 已有的 LLM 分类（不额外调用，复用对话上下文）
 */

// Andy 30 维情绪维度名（与 EmotionDimension 枚举一致）
const DIM_NAMES = [
  'joy', 'sadness', 'anger', 'fear', 'surprise', 'disgust',
  'amusement', 'awe', 'contentment', 'desire', 'embarrassment', 'guilt',
  'horror', 'interest', 'love', 'nervousness', 'pride', 'relief',
  'satisfaction', 'shame', 'sympathy', 'triumph', 'boredom', 'calm',
  'confusion', 'excitement', 'frustration', 'gratitude', 'hope', 'loneliness',
];

// ═══════════════════════════════════════════
// 关键词 → 30 维 effect 映射表
// ═══════════════════════════════════════════
// 每个关键词映射到 { dimension: delta } 对
// delta 范围 [0, 0.15]，Andy 的 applyEffect 内部会做校准

const KEYWORD_EFFECTS = {
  // ── 负面情绪 ──
  '累':     { sadness: 0.04, fatigue_proxy: 0.06, calm: 0.02 },
  '疲':     { sadness: 0.04, calm: 0.03 },
  '辛苦':   { sadness: 0.03, frustration: 0.02 },
  '难过':   { sadness: 0.08, loneliness: 0.04 },
  '伤心':   { sadness: 0.10, loneliness: 0.05 },
  '哭':     { sadness: 0.10, sympathy: 0.06 },
  '烦':     { frustration: 0.07, anger: 0.03 },
  '烦死':   { frustration: 0.10, anger: 0.05 },
  '烦躁':   { frustration: 0.08, anger: 0.03 },
  '孤独':   { loneliness: 0.10, sadness: 0.05 },
  '寂寞':   { loneliness: 0.10, sadness: 0.04 },
  '无聊':   { boredom: 0.08, loneliness: 0.03 },
  '丧':     { sadness: 0.07, boredom: 0.03 },
  '焦虑':   { nervousness: 0.08, fear: 0.04 },
  '担心':   { nervousness: 0.06, fear: 0.03 },
  '害怕':   { fear: 0.08, nervousness: 0.05 },
  '紧张':   { nervousness: 0.08, fear: 0.03 },
  '生气':   { anger: 0.08, frustration: 0.04 },
  '愤怒':   { anger: 0.12, frustration: 0.06 },
  '讨厌':   { disgust: 0.07, anger: 0.03 },
  '恶心':   { disgust: 0.08 },
  '尴尬':   { embarrassment: 0.08, shame: 0.04 },
  '丢脸':   { shame: 0.08, embarrassment: 0.06 },
  '愧疚':   { guilt: 0.08, sadness: 0.03 },
  '后悔':   { guilt: 0.06, sadness: 0.04 },
  '绝望':   { sadness: 0.12, fear: 0.06, hope: -0.10 },
  '崩溃':   { sadness: 0.10, frustration: 0.08, fear: 0.04 },
  '压力大': { nervousness: 0.07, frustration: 0.05, sadness: 0.03 },

  // ── 正面情绪 ──
  '开心':   { joy: 0.08, contentment: 0.05 },
  '高兴':   { joy: 0.08, contentment: 0.04 },
  '快乐':   { joy: 0.10, contentment: 0.06 },
  '爽':     { joy: 0.06, excitement: 0.05 },
  '太好了': { joy: 0.08, relief: 0.04, triumph: 0.03 },
  '哈哈':   { amusement: 0.07, joy: 0.04 },
  '搞笑':   { amusement: 0.08, joy: 0.03 },
  '有趣':   { amusement: 0.05, interest: 0.06 },
  '期待':   { hope: 0.07, excitement: 0.05, desire: 0.04 },
  '兴奋':   { excitement: 0.08, joy: 0.05 },
  '感动':   { sympathy: 0.06, joy: 0.05, love: 0.04 },
  '幸福':   { joy: 0.10, contentment: 0.08, love: 0.05 },
  '满足':   { satisfaction: 0.08, contentment: 0.06 },
  '自豪':   { pride: 0.08, joy: 0.04, triumph: 0.03 },
  '成功':   { triumph: 0.08, pride: 0.06, joy: 0.05 },
  '赢了':   { triumph: 0.10, pride: 0.06, excitement: 0.04 },
  '感谢':   { gratitude: 0.08, love: 0.03 },
  '谢谢':   { gratitude: 0.07, contentment: 0.03 },
  '放松':   { calm: 0.08, relief: 0.05, contentment: 0.03 },
  '安心':   { relief: 0.08, calm: 0.06, contentment: 0.04 },
  '舒服':   { calm: 0.06, contentment: 0.05 },
  '好看':   { awe: 0.05, interest: 0.04 },
  '厉害':   { awe: 0.06, admiration_proxy: 0.04 },
  '酷':     { awe: 0.04, excitement: 0.03 },

  // ── 关系/社交 ──
  '想你':   { love: 0.10, loneliness: 0.05, desire: 0.04 },
  '爱你':   { love: 0.12, joy: 0.06, contentment: 0.04 },
  '喜欢你': { love: 0.10, joy: 0.05 },
  '陪我':   { love: 0.06, loneliness: 0.04, sympathy: 0.03 },
  '想见你': { desire: 0.08, love: 0.06, loneliness: 0.04 },
  '吵架':   { anger: 0.06, sadness: 0.04, frustration: 0.05 },
  '分手':   { sadness: 0.12, loneliness: 0.08, grief_proxy: 0.06 },
  '失恋':   { sadness: 0.10, loneliness: 0.08, love: -0.05 },

  // ── 关心/询问（意图信号）──
  '你还好吗':   { joy: 0.04, sympathy: 0.03 },
  '注意身体':   { joy: 0.03, calm: 0.02 },
  '早点休息':   { calm: 0.03, sympathy: 0.02 },
  '辛苦了':     { gratitude: 0.04, sympathy: 0.03 },
  '别太累了':   { calm: 0.03, sympathy: 0.03 },

  // ── 疲劳/睡眠 ──
  '困':     { calm: 0.04, boredom: 0.02 },
  '想睡':   { calm: 0.05 },
  '睡不着': { frustration: 0.05, nervousness: 0.04, loneliness: 0.03 },
  '失眠':   { frustration: 0.06, nervousness: 0.05 },
  '熬夜':   { boredom: 0.03, frustration: 0.03 },

  // ── 工作/劳动 ──
  '加班':   { frustration: 0.05, anger: 0.03, boredom: 0.03 },
  '考核':   { nervousness: 0.06, fear: 0.04 },
  '任务':   { boredom: 0.04, frustration: 0.03 },
  '放假':   { joy: 0.06, relief: 0.05, excitement: 0.04 },
  '下班':   { relief: 0.05, joy: 0.03, calm: 0.03 },
};

// 代理维度（Andy 30 维中没有的，映射到最接近的维度）
const PROXY_MAPPING = {
  fatigue_proxy: 'sadness',       // 疲劳 → sadness（最接近）
  admiration_proxy: 'awe',        // 钦佩 → awe
  grief_proxy: 'sadness',         // 悲伤 → sadness
};

// ═══════════════════════════════════════════
// 意图检测（不依赖正则，用 includes）
// ═══════════════════════════════════════════

const INTENT_PATTERNS = {
  care:    ['你还好吗', '注意身体', '早点休息', '辛苦了', '别太累了', '保重', '照顾好自己'],
  share:   ['我今天', '我觉得', '我想', '我遇到', '我跟你说', '告诉你'],
  praise:  ['你好棒', '厉害', '好厉害', '太强了', '真不错', '厉害了'],
  comfort: ['没事的', '别担心', '会好的', '加油', '别怕', '没关系'],
};

// ═══════════════════════════════════════════
// 主分类器
// ═══════════════════════════════════════════

class EmotionEffectClassifier {
  /**
   * 从用户消息提取 Andy 30 维情绪 effect
   *
   * @param {string} text - 用户消息
   * @returns {{ effect: Object, intent: string, matchedKeywords: string[] }}
   *   effect: { dimension: delta, ... } 可直接传给 Andy applyEffect
   *   intent: 'care' | 'share' | 'praise' | 'comfort' | 'chat'
   *   matchedKeywords: 命中的关键词列表
   */
  static classify(text) {
    const effect = {};
    const matchedKeywords = [];

    // 1. 关键词匹配（长关键词优先，避免"辛苦了"被"辛苦"先匹配）
    const sortedKeywords = Object.keys(KEYWORD_EFFECTS)
      .sort((a, b) => b.length - a.length);

    for (const keyword of sortedKeywords) {
      if (text.includes(keyword)) {
        matchedKeywords.push(keyword);
        const mapping = KEYWORD_EFFECTS[keyword];

        for (const [dim, delta] of Object.entries(mapping)) {
          // 处理代理维度
          const realDim = PROXY_MAPPING[dim] || dim;

          // 只保留 Andy 30 维中存在的维度
          if (DIM_NAMES.includes(realDim)) {
            effect[realDim] = (effect[realDim] || 0) + delta;
          }
        }
      }
    }

    // 2. 意图检测
    let intent = 'chat';
    for (const [intentType, patterns] of Object.entries(INTENT_PATTERNS)) {
      for (const pattern of patterns) {
        if (text.includes(pattern)) {
          intent = intentType;
          break;
        }
      }
      if (intent !== 'chat') break;
    }

    // 3. 意图叠加 effect
    if (intent === 'care') {
      effect.joy = (effect.joy || 0) + 0.04;
      effect.contentment = (effect.contentment || 0) + 0.03;
    } else if (intent === 'praise') {
      effect.joy = (effect.joy || 0) + 0.05;
      effect.pride = (effect.pride || 0) + 0.03;
    } else if (intent === 'comfort') {
      effect.calm = (effect.calm || 0) + 0.04;
      effect.relief = (effect.relief || 0) + 0.03;
    }

    // 4. 强度限制（单次对话不超过 0.2 任何维度）
    for (const dim of Object.keys(effect)) {
      effect[dim] = Math.max(-0.2, Math.min(0.2, effect[dim]));
    }

    return { effect, intent, matchedKeywords };
  }

  /**
   * 批量分类多条消息（信号缓冲用）
   * @param {string[]} messages
   * @returns {{ mergedEffect: Object, dominantIntent: string, allKeywords: string[] }}
   */
  static classifyBatch(messages) {
    const mergedEffect = {};
    const intentCounts = {};
    const allKeywords = [];

    for (const msg of messages) {
      const { effect, intent, matchedKeywords } = this.classify(msg);

      // 合并 effect（累加）
      for (const [dim, delta] of Object.entries(effect)) {
        mergedEffect[dim] = (mergedEffect[dim] || 0) + delta;
      }

      // 统计意图
      intentCounts[intent] = (intentCounts[intent] || 0) + 1;
      allKeywords.push(...matchedKeywords);
    }

    // 取出现最多的意图
    const dominantIntent = Object.entries(intentCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'chat';

    // 强度限制（批量合并后上限放宽到 0.3）
    for (const dim of Object.keys(mergedEffect)) {
      mergedEffect[dim] = Math.max(-0.3, Math.min(0.3, mergedEffect[dim]));
    }

    return { mergedEffect, dominantIntent, allKeywords };
  }
}

module.exports = { EmotionEffectClassifier, DIM_NAMES };
