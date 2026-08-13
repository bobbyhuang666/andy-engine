# Integration Beta Artifact Verification Manifest (W0)

> RFC: [`POST_V2_0_1_RELIABILITY_OPTIMIZATION_RFC.md`](./POST_V2_0_1_RELIABILITY_OPTIMIZATION_RFC.md) §5.W0
> 生成器: `scripts/reference-host-verify.js` (`npm run reference-host:verify`)
> 关系: 本 manifest 是 [`IB_RUN_MANIFEST_SCHEMA.md`](./IB_RUN_MANIFEST_SCHEMA.md) 的前置
> artifact 绑定证据，不是完整 run/segment/evidence manifest。
> 状态: Draft

## 目的

`reference-host:verify` 每次运行输出一份 machine-readable manifest，作为
"外部宿主消费当前 HEAD 打包产物" 的证据。manifest 可作为 CI artifact，
**不提交到 Git**（仓库只保留本 schema 与稳定 fixture）。

## Schema (schemaVersion 1.0.0)

```json
{
  "schemaVersion": "1.0.0",
  "engineCommit": "<git sha, 40 hex>",
  "engineVersion": "<semver, 来自 package.json>",
  "workingTreeDirty": "<bool，git status --porcelain 非空>",
  "artifactIntegrity": "sha512-<npm pack integrity>",
  "artifactShasum": "<npm pack shasum, 40 hex>",
  "artifactFile": "andy-engine-<version>.tgz",
  "nodeVersion": "v<major>.<minor>.<patch>",
  "hostSuite": {
    "passed": "<int>",
    "failed": "<int>",
    "skipped": "<int>",
    "guardPassed": "<bool>"
  },
  "generatedAt": "<ISO 8601 UTC>",
  "status": "pass | fail",
  "errors": ["<只在 status=fail 时出现>"]
}
```

## 字段语义

| 字段 | 来源 | 作用 |
| --- | --- | --- |
| `engineCommit` | `git rev-parse HEAD` | 绑定被测 commit；CI 用 `--require-commit` 校验等于当前 HEAD |
| `engineVersion` | `package.json#version` | 被测包版本 |
| `workingTreeDirty` | `git status --porcelain` | `npm pack` 会包含未提交变更；脏树时 commit↔artifact 绑定弱化。CI 环境下脏树直接 `fail`，本地仅告警（提交前迭代允许） |
| `artifactIntegrity` | `npm pack --json` `.integrity` | sha512 完整性，可跨机器复验 |
| `artifactShasum` | `npm pack --json` `.shasum` | sha1 摘要（npm registry 兼容） |
| `hostSuite` | temp host 跑 `no-internal-access` + `evaluation-bundle` | 证明公开 API 消费通过 |
| `status` | 全部检查通过 = `pass` | fail-closed：任一检查失败即 `fail` 并列 `errors` |

## CI 用法

```bash
# 普通验证（输出 manifest 到 stdout）
npm run reference-host:verify

# 绑定到指定 commit（负向测试 / 释放绑定）
node scripts/reference-host-verify.js --require-commit <sha>

# 落盘 manifest 供后续步骤读取
node scripts/reference-host-verify.js --write-manifest reference-host-manifest.json
```

## fail-closed 规则

以下任一条件使 `status = fail`：

- `npm pack` 失败。
- CI 环境下工作区脏（`workingTreeDirty = true`）——artifact 无法归因到 `engineCommit`。
- temp host `npm install` 失败。
- host 解析的 `andy-engine` 版本 !== `engineVersion`（测到旧包）。
- host 解析路径不在 temp host 的 `node_modules` 内（测到源码而非 artifact）。
- `no-internal-access` guard 非 0 退出。
- `evaluation-bundle` suite 有 failed。
- `--require-commit` 给定且 !== `engineCommit`。
