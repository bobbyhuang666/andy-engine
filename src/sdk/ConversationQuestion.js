/**
 * Classify only direct questions that the current AGENT_STATE surface can
 * answer deterministically. Everything else remains ordinary conversation.
 */
function classifyGroundedQuestion(message) {
  if (typeof message !== 'string') return null;
  const text = message.replace(/\s+/g, '');
  // Observation/event questions are often phrased without an explicit second
  // person (e.g. "刚才发生了什么？"). Their vocabulary is narrow enough to
  // classify safely without the pronoun gate used by state questions.
  if (/(观察到什么|看到什么|看见什么|发现什么|周围有什么|环境怎么样)/.test(text)) return 'observation';
  if (/(发生什么|发生了什么|出了什么事|刚才怎么了)/.test(text)) return 'recent_event';
  if (!/(你|您)/.test(text)) return null;
  if (/(感觉|心情|情绪|怎么样|好吗)/.test(text)) return 'emotion';
  if (/(在哪|哪里|哪儿|位置)/.test(text)) return 'location';
  if (/(做什么|干什么|忙什么|在干嘛|正在|状态)/.test(text)) return 'activity';
  return null;
}

module.exports = { classifyGroundedQuestion };
