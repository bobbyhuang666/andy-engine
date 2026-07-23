# Integration Beta Public API Usage Inventory

> **Status:** P2 read-only inventory
> **Source baseline:** `b0b5116`
> **Rule:** an exported class is not automatically an approved Host write path

## Conclusion

Of the ten Reference Slice capabilities:

- fully reachable through stable public APIs: packed installation, domain and
  character configuration, explicit simulation advance, and fresh-process
  persistence;
- reachable with incomplete evidence or experimental adapters: natural
  multi-agent evolution, state consequence observation, dual-family provider
  calls, validate-before-exposure, and exports-only execution;
- not currently available as one public capability: evaluation-bundle
  construction.

Confirmed gap seeds are A1 effect/trace observability, A2 live agent handles, A3
absence of narrow movement/event-intent commands, and A4 absence of an
evaluation-bundle builder.

## Package exports

`package.json#exports` defines ten CommonJS paths with type declarations:

| Subpath | Status | Host use |
|---|---|---|
| `andy-engine` | stable | engine construction, characters, time, observation, grounding |
| `andy-engine/sdk` | mixed | controlled use of experimental LLM/prompt adapters |
| `andy-engine/domain` | stable | domain validation |
| `andy-engine/domain/validate` | stable | optional standalone validation |
| `andy-engine/domain/registry` | stable | optional registry access |
| `andy-engine/facts` | stable | enums/formatting only; not a Host write path |
| `andy-engine/store` | stable | Stable World Envelope and fresh-process restore |
| `andy-engine/config/defaults` | stable | diagnostics only; not required by the slice |
| `andy-engine/presets/campus` | stable | secondary diagnostic domain |
| `andy-engine/presets/tavern` | stable | primary seven-day domain |

The root package exports the class directly:

```js
const AndyEngine = require('andy-engine');
```

## Root facade usage

| API | Host use | Constraint |
|---|---|---|
| `new AndyEngine(config)` | required | pass domain, seed, start time, and explicit `enableFacts: true` |
| `createCharacter(config)` | required | create 3–10 scenario characters |
| `addAgent()` / `addAgents()` | optional | prefer `createCharacter()` |
| `getAgent()` / `getAllAgents()` | prohibited for evidence reads | live objects create A2 mutation risk |
| `getNarrative()` | optional | engine template narrative is not real-LLM final output |
| `getWorldContext()` | required | public context input |
| `getGroundingPackage()` | required | bounded epistemic input |
| `checkConsistency()` | required | synchronous pre-exposure validation |
| `tick()` | required for diagnostics | bounded single step |
| `runTicks()` / `advanceTo()` | required | explicit catch-up |
| `snapshot()` | required | preferred diagnostic projection |
| `getStats()` | required | basic runtime counters |
| `onTick()` | optional | callback remains read-only |
| `setWeather()` | optional | currently the only explicit world-facing setter |
| `getSocialGraph()` | prohibited for Host mutation | returns a live graph |
| `toJSON()` / `fromJSON()` | avoid | legacy compatibility; use Stable World Envelope |

## SDK usage

Stable `Character`, `Andy`, and `create()` are convenience surfaces but do not
provide the scheduling, persistence, and evidence controls required by the
Reference Slice.

The Host may use experimental `LLMAdapter` and `NarrativeBuilder` only behind
`IB_PROVIDER_ADAPTER_BOUNDARY.md`. `LLMAdapter` transport retries are disabled
for evidence runs so the Host ledger owns every attempt. `AutoTick` is not used
because it is not a background worker. `ConversationLog` is not canonical
evidence.

`Character.chatStream()` buffers the complete candidate before validation; it
must not be advertised as true token streaming.

## Store usage

The packed Host uses:

```js
const {
  toWorldState,
  fromWorldState,
  validateWorldState,
  createStore,
} = require('andy-engine/store');
```

Fresh-process restoration must call:

```js
const engine = fromWorldState(state, { domain }, AndyEngine);
```

The runtime requires the third `AndyEngine` constructor argument. The legacy
TypeScript signature keeps it optional for compatibility, so the Host contract
must state the runtime precondition explicitly and test the three-argument call.

The Host treats `runtimeSnapshot` as opaque and does not parse internal
characters, relationships, events, facts, or knowledge from it.

## Domain and facts usage

The Host validates the existing frozen tavern and campus presets through
`andy-engine/domain`. Host-specific scenario metadata is separate from domain
configuration and cannot schedule expected outcomes into world state.

Although `andy-engine/facts` exports factories and owner classes, the Host must
not instantiate `WorldFactStore`, `KnowledgeStore`, `FactEmitter`, or
`CanonEventPipeline` for a running world. Doing so would create a parallel fact
authority. The supported grounding path is `getGroundingPackage()` plus
`checkConsistency()`.

## Vertical-slice reachability

| # | Capability | Reachability | Public path / gap |
|---:|---|---|---|
| 1 | Install packed artifact | full | package exports and packed-consumer gates |
| 2 | Configure domain and 3–10 characters | full | presets, domain validation, constructor, `createCharacter()` |
| 3 | Run seven simulated days | full | `runTicks()`, `advanceTo()`, `getStats()` |
| 4 | Natural action and CanonEvent production | partial | evolution works; external event-intent command is A3 |
| 5 | Observe memory/relationship/location/future consequences | partial | snapshot diff and phase counts; commit receipt is A1 |
| 6 | Fresh-process save/resume | full with required constructor | public store facade |
| 7 | Two pinned provider/model families | experimental | Host envelope around `LLMAdapter` |
| 8 | Expose only grounded final narrative | partial | grounding/checker stable; provider and disposition Host-owned |
| 9 | Evaluation bundle and blinded review | missing | A4, primarily Host-owned tooling |
| 10 | Public-API-only evidence or honest gap | partial | scan design plus A1–A4 ledger |

## Gap seeds

### A1 — Effect and trace observability

Five runtime `EffectCommitter.commit()` call sites exist. Three capture results
and inspect internal errors; two fallback paths discard the result. The public
tick result exposes phase summaries, not applied/skipped/error receipts or a
stable action → event → effect → knowledge → grounding join.

This is an observability gap, not evidence that writeback is absent.

### A2 — Live object exposure

`getAgent()`, `getAllAgents()`, and `getSocialGraph()` expose live objects.
Reference Host acceptance code uses `snapshot()` and other documented
projections instead of mutating or retaining these objects.

### A3 — World commands

No stable narrow command expresses character movement or an externally
initiated world-event intent. The Host cannot substitute direct position
assignment, dispatcher access, fact factories, or direct effect commit.

### A4 — Evaluation bundle

No public API or package script builds a blinded evaluation bundle. The first
implementation should be Host-owned and consume manifests, public projections,
grounding results, and the private artifact policy. It is not automatically an
Engine Core API gap.

## Contract drifts discovered during inventory

| Drift | Current truth | P2 handling |
|---|---|---|
| `fromWorldState` constructor optionality | legacy `.d.ts` permits omission; runtime rejects it | documented compatibility limitation; Host passes and tests it explicitly |
| Stable envelope version prose | implementation/tests pin `ENVELOPE_VERSION` to `0.1.0` | public serialization documentation corrected in P2 |
| config/defaults export list | runtime and types export seven symbols, while the contract listed only `ANDY_DEFAULTS` | public contract documentation corrected in P2 |

These are contract-maintenance findings. The two documentation drifts were
corrected in P2; the legacy optional type is documented without changing the
public declaration. None authorizes new exports or persistence semantics.

## Recommended Host imports

```js
const AndyEngine = require('andy-engine');
const { validateDomain } = require('andy-engine/domain');
const {
  toWorldState,
  fromWorldState,
  validateWorldState,
  createStore,
} = require('andy-engine/store');
const {
  LLMAdapter,
  NarrativeBuilder,
} = require('andy-engine/sdk');
const tavern = require('andy-engine/presets/tavern');
const campus = require('andy-engine/presets/campus');
```

Other exported paths remain in the scanner allowlist but are not consumed
without a documented Host need.
