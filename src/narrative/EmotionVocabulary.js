/**
 * Canonical names for the bounded emotion summaries carried by AGENT_STATE.
 * This vocabulary is intentionally small and exact-match only: it translates
 * an engine summary into a natural Chinese expression without attempting
 * open-ended sentiment inference.
 */

const EMOTION_LABELS = Object.freeze({
  joy: '开心', sadness: '难过', anger: '生气', fear: '害怕', surprise: '惊讶',
  disgust: '厌恶', amusement: '觉得好笑', contentment: '满足', excitement: '兴奋',
  calm: '平静', hope: '期待', love: '喜欢', nervousness: '紧张', pride: '自豪',
  relief: '如释重负', satisfaction: '满意', frustration: '烦躁', gratitude: '感激',
  loneliness: '孤独', boredom: '无聊', guilt: '内疚', shame: '羞耻', horror: '恐惧',
  triumph: '得意', interest: '感兴趣', desire: '渴望', awe: '敬畏',
  embarrassment: '尴尬', sympathy: '同情', confusion: '困惑',
});

const EMOTION_ALIASES = new Map();
for (const [canonical, label] of Object.entries(EMOTION_LABELS)) {
  EMOTION_ALIASES.set(canonical, canonical);
  EMOTION_ALIASES.set(label, canonical);
}
EMOTION_ALIASES.set('高兴', 'joy');
EMOTION_ALIASES.set('快乐', 'joy');
EMOTION_ALIASES.set('喜悦', 'joy');
EMOTION_ALIASES.set('焦虑', 'nervousness');
EMOTION_ALIASES.set('沮丧', 'frustration');
EMOTION_ALIASES.set('寂寞', 'loneliness');
EMOTION_ALIASES.set('愤怒', 'anger');
EMOTION_ALIASES.set('冷静', 'calm');

function canonicalEmotion(value) {
  if (typeof value !== 'string') return null;
  return EMOTION_ALIASES.get(value.trim().toLowerCase()) || null;
}

function formatEmotion(value) {
  const canonical = canonicalEmotion(value);
  return canonical ? EMOTION_LABELS[canonical] : null;
}

module.exports = { canonicalEmotion, formatEmotion };
