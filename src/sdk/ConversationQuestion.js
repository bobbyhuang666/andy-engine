/**
 * Classify only direct questions that the current AGENT_STATE surface can
 * answer deterministically. Everything else remains ordinary conversation.
 */
function classifyGroundedQuestion(message) {
  if (typeof message !== 'string') return null;
  const text = message.replace(/\s+/g, '');
  if (!/(你|您)/.test(text)) return null;
  if (/(感觉|心情|情绪|怎么样|好吗)/.test(text)) return 'emotion';
  if (/(在哪|哪里|哪儿|位置)/.test(text)) return 'location';
  if (/(做什么|干什么|忙什么|在干嘛|正在|状态)/.test(text)) return 'activity';
  return null;
}

module.exports = { classifyGroundedQuestion };
