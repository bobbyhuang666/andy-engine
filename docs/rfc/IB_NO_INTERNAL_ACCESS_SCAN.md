# Integration Beta No-Internal-Access Scan

> **Status:** P2 scan design
> **Target:** future `reference-host/` workspace

## Purpose

The scan prevents Reference Host evidence from succeeding by importing or
mutating engine internals. It complements packed-tarball execution; neither
control replaces the other.

## Required checks

The scanner recursively inspects Host JavaScript, TypeScript, configuration,
and test source. It fails on:

### Import escapes

- relative paths that leave `reference-host/`;
- paths containing `/src/`, `/agent/Agent`, or other non-exported modules;
- direct filesystem loading of the engine repository;
- `require.resolve()` or dynamic import used to bypass package exports.

### Runtime backdoors

- `engine.world` and equivalent subsystem traversal;
- direct access to `regions`, `eventDispatcher`, `effectCommitter`,
  `factStore`, `knowledgeStore`, or internal RNG/context objects;
- direct construction of internal runtime, canon, knowledge, or effect owners.

### Direct mutations

- assignment to agent position, needs, emotion, memory, facts, knowledge, or
  relationship internals;
- calls such as `memory.addExperience()` or direct
  `relationship.recordInteraction()` when used to produce acceptance evidence;
- direct event dispatch or direct effect commit from Host code.

The scanner must distinguish test assertions and immutable reads from mutation
attempts. Ambiguous findings fail closed and require review.

## Allowlist

Only imports matching `package.json#exports` are allowed. The allowlist is read
from the packed package metadata rather than duplicated as a permanent hard
coded list.

Generated artifacts, dependencies, coverage output, and ignored private paths
are excluded from source scanning, but their package manifests remain subject
to dependency review.

## Integration

The future implementation adds:

```text
npm run check:reference-host
```

and invokes it from `check:boundaries` when `reference-host/` exists. P2 defines
the behavior but does not add the script before the workspace exists.

The check runs against:

1. the actual Host source;
2. positive fixtures using allowed package exports;
3. negative fixtures covering every rule family;
4. selected existing demos as detector characterization.

## Detector acceptance

At minimum, the detector must flag the known internal access in:

- `examples/longitudinal-life-demo/demo.js`;
- `examples/minimal-persistent-character/quickstart.js`.

Those examples are detector fixtures only. Their violations are not copied into
the Host and do not become Beta evidence.

False negatives on `engine.world`, relative `src/` imports, internal
construction, or direct state mutation block W1. False positives must be fixed
with syntax-aware classification or a narrow documented allowlist, never a
directory-wide disable.

## Evidence output

The scan emits:

- package identity and exports allowlist hash;
- files scanned and excluded;
- rule ID, file, line, and matched construct;
- exit status and scanner version.

It must not print credentials, prompts, raw model output, or private evaluation
content.
