# Wave 3 域纯度 — 完成复核报告

> 阶段:A 级内核硬化。Wave 3(P0 域纯度)已完成。本报告记录成果、验证、遗留项。

## 完成的子波次

| 子波次 | 内容 | 状态 |
|--------|------|------|
| 3a | 前置 characterization tests(10 用例锁定 campus 默认/自定义域/存档 round-trip) | ✅ |
| 3b-0 | 4 文件模块级 `getDefaultDomain()` 硬绑定改惰性(行为中性) | ✅ |
| 3b-1 | 11 处构造函数级 `|| getDefaultDomain()` 兜底改为 domain 必传抛错(方案 A) | ✅ |
| 3c | Schedule 4 个 campus 工厂迁出 core 到 preset;resolvePreset string 分支抛错 | ✅ |
| 3d | WorldStateAdapter/compiler/migration 的 domainRef campus 特判泛化为 DEFAULT_DOMAIN_ID 常量 | ✅ |
| 3b-2 | DomainRegistry 顶层 `const campusDomain=require(...)` 改惰性 require | ✅ |

## 终验门控(全过)

```
npm test           → 2052 passed / 2 failed(2 个是 native-loader npm pack EPERM,预存环境问题,非回归)
npm run test:domain → 81 passed
npm run check:boundaries → All passed
npm run perf:check  → All passed
git diff --check    → clean
```

## 域纯度成果(grep 验证)

- `src/agent/schedule/Schedule.js`:`require('...presets/campus/schedules')` 已清零,4 个 `create*Schedule` 工厂已迁出。
- `src/store/world/`:`domainRef !== 'campus'` 字面量特判清零,改用 `DEFAULT_DOMAIN_ID` 常量。
- `src/domain/DomainRegistry.js`:顶层 `const campusDomain = require(...)` 已消除,改惰性 require(ctor 内)。
- core 11 处构造函数 `|| getDefaultDomain()` 兜底已消除,domain 改必传。
- 4 处模块级 `const defaultDomain = getDefaultDomain()` 已改惰性求值。
- campus 默认注入点:入口层 `index.js`(显式 require preset)+ DomainRegistry getDefaultDomain 惰性 require(供独立测试/惰性导出)。

## 遗留项(非 Wave 3 范围,记录为后续)

1. **SDK 层 campus 特判**(Wave 3d 边界外):`src/sdk/Character.js:84,306,343-346`、`src/sdk/Andy.js:159,180-183` 仍有 `domainRef !== 'campus'` 特判与 `|| 'campus'` 默认。AGENTS.md 允许 SDK 入口层向后兼容默认,但 `!== 'campus'` 特判可泛化为 DEFAULT_DOMAIN_ID。属独立后续项。
2. **PhysiologyRuntime 硬编码 campus 词**:`['运动场',...]` outdoor 兜底(Wave 3b-1 worker 发现),core 硬编码具体世界词,违反 domain purity。需改为 domain.placeTypes.outdoor 驱动。后续项。
3. **getDefaultDomain 仍间接耦合 campus**:DomainRegistry.getDefaultDomain() 惰性 require campus,core 仍间接(非顶层)耦合。完全消除需把 4 处惰性调用改为显式 domain 注入,属更大重构(方案 A 的延伸),列 RFC。

## 行为兼容性

- `new AndyEngine()` 无 domain:仍注入 campus(入口层 index.js),行为不变。
- campus 存档:无 config.domain 仍可加载(DEFAULT_DOMAIN_ID 免校验),行为不变。
- 自定义域存档:需 config.domain 且 id 匹配,行为不变。
- Wave 3a characterization 10/10 全绿,证明向后兼容铁律成立。

## 结论

Wave 3 P0 域纯度目标达成:core `src/` 不再硬编码 campus 为「内置世界观」——campus 退化为 preset 实例 + 入口层默认注入。core 构造函数不再隐式依赖 campus 兜底。存档路径的 campus 特权域特判已泛化为常量。3 项遗留属独立后续,不影响 Wave 3 验收。
