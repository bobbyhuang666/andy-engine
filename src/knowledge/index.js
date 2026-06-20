/**
 * src/knowledge/ — 角色局部知识层
 *
 * 管理谁知道什么。与 memory 的区别：knowledge 是事实性的，memory 是主观的。
 */

const KnowledgeStore = require('./KnowledgeStore');

module.exports = {
  KnowledgeStore,
};
