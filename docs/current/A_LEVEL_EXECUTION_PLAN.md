# Andy Engine A-Level Execution Plan

## 当前状态
- v2.0.1 release blockers 已修复
- BasicAffectFrame seam 已有真实语义差异测试
- Release gate / smoke / no-SQLite / CI 已基本成立
- 但 A-level blockers 仍未完全修复

## 目标
把 Andy Engine 从 "v2.0.1 alpha 可发布" 推进到真正的 A-level credible persistent agent engine。

## A-level 标准
证明以下闭环：
1. 一个角色只知道自己应该知道的事
2. 一个事件产生的后果能追溯到状态、记忆、关系、事实和叙事
3. 角色离线期间世界继续变化，再次交互时能基于真实事件回应
4. LLM / Narrative 不发明未发生事实
5. Agent.js 是正式 facade，不是未完成迁移残留
6. public docs 和真实能力一致

---

## Phase A1 — Alice/Bob Epistemic Boundary 完整证明

### 目标
证明 Alice 在 cafeteria 吃饭这件事真实发生、真实影响 Alice、真实进入 Alice 的记忆/事件链，但 Bob 在 library 不会错误知道这件事。

### 文件
- `tests/e2e/alice-bob-epistemic-boundary.test.js`

### hunger 语义
- 数值越高代表越满足（0.8 = 满足，<0.3 = 饥饿）
- eating 后 hunger 应该增加或保持

### 断言要求
**Alice 侧：**
1. hunger 朝正确方向改善（>= 0.5）
2. memory 中出现 eating 相关内容
3. narrative 可引用 eating

**Bob 侧：**
1. memory 不得出现 Alice eating
2. narrative 不得引用 Alice eating
3. facts 不得包含 Alice private eating event

**CanonEvent 侧：**
1. eating event 存在
2. participants 只包含 Alice
3. location 是 cafeteria
4. timestamp 存在

### 禁止
- 禁止只写 expect(x).toBeDefined()
- 禁止硬编码 narrative 文本
- 禁止 skip

---

## Phase A2 — Cause → Effect → Memory → Narrative 同事件贯穿证明

### 目标
证明 Alice helps Bob 事件贯穿 CanonEvent、EffectResult、Relationship、Memory 和 Narrative grounding。

### 文件
- `tests/e2e/cause-effect-memory-narrative.test.js`

### 断言要求
**CanonEvent：**
1. help event 存在
2. participants 包含 Alice 和 Bob
3. timestamp 存在
4. eventId 存在

**EffectResult / Relationship：**
1. relationship strength 增加
2. relationship history 包含 help event

**Memory：**
1. Alice memory 包含 help event
2. Bob memory 包含 being helped

**Narrative / Grounding：**
1. grounding 包含 help event
2. narrative 不得引用未发生事件

---

## Phase A3 — Longitudinal Life Demo 真实性审计与补强

### 目标
确认 longitudinal demo 由真实 engine tick 驱动。

### 文件
- `tests/e2e/longitudinal-life-real-engine.test.js`

### 断言要求
1. simTime 增加约 24 小时
2. offline events count > 0
3. 至少一个 event 写入 memory
4. 至少一个 event 改变 relationship 或 emotion
5. narrative grounding 引用 offline event

---

## Phase A4 — Agent.js Facade Finalization

### 目标
把 Agent.js 正式定性为 public compatibility facade。

### 文件
- `agent/Agent.js`
- `docs/current/PUBLIC_API_CONTRACT.md`
- `tests/architecture/agent-facade-contract.test.js`

### 必须做
1. 删除 "Deletion condition" 临时注释
2. 明确写入 compatibility facade 规则
3. PUBLIC_API_CONTRACT 说明 status
4. 新增 architecture test

---

## Phase A5 — Documentation Truth Pass

### 目标
确保对外文档不夸大项目能力。

### 文件
- `README.md`

### 必须删除
- production-ready
- full deterministic replay
- A-level complete

### 推荐说法
- foundation-stage persistent agent runtime
- alpha release
- production use requires careful validation

---

## Phase A6 — External Trial Readiness

### 目标
为外部试用者准备最小可运行路径。

### 文件
- `examples/minimal-persistent-character/`

---

## 执行顺序
A1 → A2 → A3 → A4 → A5 → A6

## 验收矩阵
```bash
npm test
npm run typecheck
npm run check:boundaries
npm run smoke:pack
npm run release:gate
git diff --check
```
