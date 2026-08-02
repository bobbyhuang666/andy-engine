/**
 * Classify only direct questions that the current grounding surfaces can
 * answer deterministically. Everything else remains ordinary conversation.
 */
function isDirectCharacterQuestion(message, text) {
  if (!/(你|您)/.test(text)) return false;
  return /[?？]/.test(message) || /(吗|呢|什么|谁|哪|如何|怎样|怎么样|怎么|是否|是不是|能不能|可不可以|有没有|几|多少)/.test(text);
}

function isDirectQuestion(message, text) {
  return /[?？]/.test(message) || /(吗|呢|什么|谁|哪|如何|怎样|怎么样|怎么|是否|是不是|能不能|可不可以|有没有|几|多少)/.test(text);
}

/**
 * Identify a direct question about another named character without deciding
 * whether the answer is knowable. The caller must answer from allowed facts
 * or return epistemic unknown.
 */
function classifyThirdPartyQuestion(message, agentNames = {}, selfId = '') {
  if (typeof message !== 'string') return null;
  const text = message.replace(/\s+/g, '');
  if (!isDirectQuestion(message, text)) return null;

  const candidates = Object.entries(agentNames || {})
    .filter(([agentId]) => agentId && agentId !== selfId)
    .map(([agentId, displayName]) => ({
      agentId,
      displayName: String(displayName || agentId),
    }))
    .sort((a, b) => Math.max(b.displayName.length, b.agentId.length) - Math.max(a.displayName.length, a.agentId.length));
  const target = candidates.find(({ agentId, displayName }) => text.includes(displayName) || text.includes(agentId));
  const hasUnresolvedThirdParty = /(?:他|她|TA|ta|他们|她们)/.test(text);
  if (!target && !hasUnresolvedThirdParty) return null;

  const forbiddenSurface = /(在想|想什么|内心|感觉|心情|情绪|记得|记忆|回忆|打算|计划|接下来|未来|意图|想法)/.test(text);
  const dimension = forbiddenSurface
    ? 'forbidden'
    : /(在哪|哪里|哪儿|位置|什么地方|去哪)/.test(text)
      ? 'location'
      : /(在做什么|做什么|干什么|忙什么|状态|最近|刚才|发生|情况|怎么样|观察到|看到)/.test(text)
        ? 'recent'
        : null;
  if (!dimension) return null;

  return {
    targetId: target?.agentId || null,
    targetName: target?.displayName || null,
    dimension,
  };
}

function classifyGroundedQuestion(message) {
  if (typeof message !== 'string') return null;
  const text = message.replace(/\s+/g, '');
  // Observation/event questions are often phrased without an explicit second
  // person (e.g. "刚才发生了什么？"). Their vocabulary is narrow enough to
  // classify safely without the pronoun gate used by state questions.
  if (/(观察到什么|看到什么|看到了什么|看见什么|看见了什么|发现什么|发现了什么|周围有什么|环境怎么样)/.test(text)) return 'observation';
  if (/(发生什么|发生了什么|出了什么事|刚才怎么了)/.test(text)) return 'recent_event';
  // These surfaces describe the character, not the user's own statement.
  // Require an explicit second-person question before routing to grounded
  // fallback; otherwise ordinary text can be misclassified by vocabulary
  // such as 朋友, 记得, or 计划.
  if (isDirectCharacterQuestion(message, text)) {
    if (/(认识谁|认识什么人|关系如何|关系怎么样|是什么关系|怎么认识的|关系怎样|朋友吗|谁是你的朋友|朋友是谁|熟人吗)/.test(text)) return 'relationship';
    if (/(记得什么|上次聊了什么|上次说了什么|还记得吗|记忆|记得)/.test(text)) return 'memory';
    // Future intention questions reference the agent's next scheduled activity
    // (LOCAL INTENTION fact derived from the schedule).
    if (/(接下来|打算|计划|要做什么|准备做|准备去|接下来去)/.test(text)) return 'future_intention';
  }
  if (!/(你|您)/.test(text)) return null;
  if (/(感觉|心情|情绪|怎么样|好吗)/.test(text)) return 'emotion';
  if (/(在哪|哪里|哪儿|位置)/.test(text)) return 'location';
  if (/(做什么|干什么|忙什么|在干嘛|正在|状态)/.test(text)) return 'activity';
  return null;
}

module.exports = { classifyGroundedQuestion, classifyThirdPartyQuestion };
