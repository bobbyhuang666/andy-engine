/**
 * AndyWorld — 向后兼容层
 *
 * Phase 9: 核心编排逻辑已移至 src/runtime/AndyWorld.js。
 * 本文件保持向后兼容，导出同名类 AndyWorld。
 *
 * 所有 require('./core/World') 的代码无需修改。
 */

const AndyWorld = require('../src/runtime/AndyWorld');

module.exports = AndyWorld;
