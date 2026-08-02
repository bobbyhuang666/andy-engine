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
  if (/(观察到什么|看到什么|看到了什么|看见什么|看见了什么|发现什么|发现了什么|周围有什么|环境怎么样)/.test(text)) return 'observation';
  if (/(发生什么|发生了什么|出了什么事|刚才怎么了)/.test(text)) return 'recent_event';
  // Relationship questions reference the agent's own relationships (which are
  // public-scope RELATIONSHIP facts in the grounding). They use 你/您 but the
  // vocabulary is narrow enough to classify before the pronoun gate.
  if (/(认识谁|认识什么人|认识什么人吗|认识谁吗|关系如何|关系怎么样|是什么关系|怎么认识的|关系怎样|朋友吗|朋友|熟人)/.test(text)) return 'relationship';
  // Memory questions reference the agent's own LOCAL MEMORY facts.
  if (/(记得什么|记得什么吗|上次聊了什么|上次说了什么|还记得吗|记忆|记得)/.test(text)) return 'memory';
  // Future intention questions reference the agent's next scheduled activity
  // (LOCAL INTENTION fact derived from the schedule).
  if (/(接下来|打算|计划|接下来打算|接下来计划|要做什么|准备做|准备去|接下来去)/.test(text)) return 'future_intention';
  if (!/(你|您)/.test(text)) return null;
  if (/(感觉|心情|情绪|怎么样|好吗)/.test(text)) return 'emotion';
  if (/(在哪|哪里|哪儿|位置)/.test(text)) return 'location';
  if (/(做什么|干什么|忙什么|在干嘛|正在|状态)/.test(text)) return 'activity';
  return null;
}

module.exports = { classifyGroundedQuestion };
