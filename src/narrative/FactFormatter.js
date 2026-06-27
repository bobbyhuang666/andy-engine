/**
 * FactFormatter - 事实格式化器
 *
 * 将结构化事实转换为自然语言或 JSON 格式。
 * 用于注入 LLM 的 system prompt 或日志输出。
 */

const { FactType } = require('../canon/FactSchema');

class FactFormatter {
  /**
   * 事实→自然语言
   * @param {Object} fact
   * @returns {string}
   */
  static toNaturalLanguage(fact) {
    if (!fact || typeof fact !== 'object') return '';

    switch (fact.type) {
      case FactType.STATIC_ENV:
        return FactFormatter._formatStaticEnv(fact);
      case FactType.AGENT_STATE:
        return FactFormatter._formatAgentState(fact);
      case FactType.RELATIONSHIP:
        return FactFormatter._formatRelationship(fact);
      case FactType.EVENT:
        return FactFormatter._formatEvent(fact);
      case FactType.OBSERVATION:
        return FactFormatter._formatObservation(fact);
      case FactType.MEMORY:
        return FactFormatter._formatMemory(fact);
      default:
        return `[Unknown fact type: ${fact.type}] ${fact.id}`;
    }
  }

  /**
   * 事实→JSON（带类型标记）
   * @param {Object} fact
   * @returns {Object}
   */
  static toJSON(fact) {
    if (!fact || typeof fact !== 'object') return {};
    const result = { ...fact };
    if (result.timestamp instanceof Date) {
      result.timestamp = result.timestamp.toISOString();
    }
    return result;
  }

  /**
   * 批量格式化
   * @param {Object[]} facts
   * @returns {string[]}
   */
  static batchToNaturalLanguage(facts) {
    if (!Array.isArray(facts)) return [];
    return facts.map(f => FactFormatter.toNaturalLanguage(f));
  }

  /**
   * 事实→自然语言 + 来源标注
   *
   * Evidence source → annotation mapping:
   *   direct/observed → no annotation (free expression)
   *   overheard       → （听闻）
   *   told            → （{propagatedFrom}告诉你）or （听闻）if propagatedFrom is null
   *   inferred        → （推测）
   *
   * told fallback: When a told-level fact has no propagatedFrom (the informer's
   * identity is unknown), the formatter falls back to generic "听闻" annotation
   * instead of "XX告诉你". This is by design: without a known source, fabricating
   * an informer name would be worse than the imprecise "听闻" label. The fallback
   * is consistent with the checker's toldMarkers which include "听说" as a valid
   * attribution.
   *
   * @param {Object} fact
   * @returns {string}
   */
  static toNaturalLanguageWithSource(fact) {
    const base = FactFormatter.toNaturalLanguage(fact);
    if (!fact._evidence) return base;

    const { source, propagatedFrom } = fact._evidence;

    switch (source) {
      case 'direct':
      case 'observed':
        return base;
      case 'overheard':
        return `${base}（听闻）`;
      case 'told':
        return propagatedFrom ? `${base}（${propagatedFrom}告诉你）` : `${base}（听闻）`;
      case 'inferred':
        return `${base}（推测）`;
      default:
        return base;
    }
  }
  // ═══════════════════════════════════════════
  // 内部格式化方法
  // ═══════════════════════════════════════════

  /** @private */
  static _formatStaticEnv(fact) {
    const desc = fact.description ? `：${fact.description}` : '';
    return `${fact.area}的${fact.object}${desc}`;
  }

  /** @private */
  static _formatAgentState(fact) {
    const region = fact.region ? `在${fact.region}` : '';
    return `${region}${region ? '，' : ''}正在${fact.state}`;
  }

  /** @private */
  static _formatRelationship(fact) {
    const prev = fact.previousType ? `（之前是${fact.previousType}）` : '';
    return `${fact.agentA}和${fact.agentB}的关系是${fact.relationType}，强度${(fact.strength * 100).toFixed(0)}%${prev}`;
  }

  /** @private */
  static _formatEvent(fact) {
    const loc = fact.location ? `（${fact.location}）` : '';
    return `[事件] ${fact.description}${loc}`;
  }

  /** @private */
  static _formatObservation(fact) {
    const ctx = fact.context ? `，当时${fact.context}` : '';
    return `${fact.observerId}观察到${fact.targetId}${fact.action}${ctx}`;
  }

  /** @private */
  static _formatMemory(fact) {
    const emotion = fact.emotionTag && fact.emotionTag !== 'neutral'
      ? `（情绪：${fact.emotionTag}）`
      : '';
    return `[记忆·${fact.category}] ${fact.content}${emotion}（重要性：${(fact.importance * 100).toFixed(0)}%）`;
  }
}

module.exports = FactFormatter;
