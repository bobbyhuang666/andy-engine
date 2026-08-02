# Domain Schema Reference

Andy Engine supports **domain config** — a declarative way to define a world's regions, states, events, and semantics.

## Quick Example

```javascript
const AndyEngine = require('andy-engine');

// Use built-in tavern preset
const tavernDomain = require('andy-engine/presets/tavern');
const engine = new AndyEngine({ domain: tavernDomain });

// Or create your own
const myDomain = {
  id: 'my-world',
  name: 'My Custom World',
  version: '1.0.0',
  regions: ['广场', '酒馆', '小屋'],
  states: { '休息': { next: ['闲逛'], hours: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23], category: 'rest' }, ... },
  // ... other fields
};
const engine2 = new AndyEngine({ domain: myDomain });
```

---

## Schema Fields

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique domain identifier |
| `name` | `string` | Human-readable name |
| `version` | `string` | Version string |
| `regions` | `string[]` | List of region IDs |
| `states` | `Object` | State definitions (see below) |
| `stateCenters` | `Object` | 4D behavior vectors for each state |

### Spatial System

| Field | Type | Description |
|-------|------|-------------|
| `adjacency` | `[regionA, regionB, distance][]` | Region adjacency list |
| `regionCoords` | `Object` | Region geometry (rect/circle) |
| `placeTypes` | `Object` | Region categories: `{ food, rest, social, work, sleep, explore, outdoor }` |
| `placeMapping` | `Object` | Need → region mapping: `{ hunger, energy, social, comfort, stimulation }` |

### State System

```javascript
states: {
  '状态名': {
    next: ['可转移状态1', '可转移状态2'],
    hours: [0, 1, 2, ...], // Valid hours
    category: 'sleep|morning|active|social|quiet|rest|leisure|home|lateNight|transit|break|deviant|illness'
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `stateCenters` | `Object` | `{ '状态名': [activity, sociality, focus, expressiveness] }` |
| `labelTimePenalties` | `Object` | `{ '状态名': { hours: [...], penalty: 0.5 } }` |
| `activityTargets` | `Object` | Activity → state mapping: `{ '上课': '在上课' }` |

### Needs System

| Field | Type | Description |
|-------|------|-------------|
| `needSatisfactionMap` | `Object` | Need → states/regions mapping |
| `needDriveStates` | `Object` | Need → target states when deficient |
| `needRegionConfig` | `Object` | Need → region by role type |

```javascript
needSatisfactionMap: {
  hunger: {
    states: ['在吃饭', '在做饭'],
    regions: ['餐厅', '食堂'],
  },
  energy: {
    states: ['睡觉', '休息'],
    regions: [],
  },
  // ...
}

needDriveStates: {
  hunger: ['在吃饭'],
  energy: ['休息', '睡觉'],
  // ...
}

needRegionConfig: {
  hunger: { worker: '家', student: '餐厅' },
  energy: { any: '家' },
  // ...
}
```

### Event System

| Field | Type | Description |
|-------|------|-------------|
| `eventTemplates.genericEvents` | `Array` | Events for any time/place |
| `eventTemplates.timeEvents` | `Object` | `{ lateNight, morning, evening }` |
| `eventTemplates.weatherEvents` | `Object` | `{ rain, sunny, cold, hot }` |
| `eventTemplates.regionEvents` | `Object` | `{ '区域名': [...] }` |

```javascript
eventTemplates: {
  genericEvents: [
    { content: '看到一只猫', delta: { interest: 0.03 } },
  ],
  timeEvents: {
    lateNight: [
      { content: '深夜了', delta: { calm: 0.02 } },
    ],
  },
  weatherEvents: {
    rain: [
      { content: '下雨了', delta: { frustration: 0.03 } },
    ],
  },
  regionEvents: {
    '酒馆': [
      { content: '有人在唱歌', delta: { joy: 0.03 } },
    ],
  },
}
```

### Memory System

| Field | Type | Description |
|-------|------|-------------|
| `memoryTemplates.semanticCategories.typeMap` | `Object` | Event type → category |
| `memoryTemplates.semanticCategories.keywordMap` | `Object` | Category → keywords |
| `memoryTemplates.semanticCategories.stateCategoryMap` | `Object` | State category → semantic category |

### Appraisal System

| Field | Type | Description |
|-------|------|-------------|
| `appraisalConfig.needKeywords` | `Object` | Need → content keywords |
| `appraisalConfig.socialStates` | `string[]` | States considered social |
| `appraisalConfig.outdoorPositions` | `string[]` | Outdoor regions |
| `appraisalConfig.scheduledStates` | `string[]` | Scheduled activity states |

### Intrinsic Motivation

| Field | Type | Description |
|-------|------|-------------|
| `intrinsicMotivationConfig.domainRegionMap` | `Object` | Activity → region mapping |
| `intrinsicMotivationConfig.explorationStates` | `string[]` | States for exploration |

### Semantic Profile

Language-specific resources for semantic processing. Each domain defines its own.

| Field | Type | Description |
|-------|------|-------------|
| `semanticProfile.language` | `string` | Language code (e.g. `'zh-CN'`, `'en'`) |
| `semanticProfile.mindWander` | `Object` | Mind wander keywords and templates |
| `semanticProfile.narrativeModifiers` | `Object` | Emotion/need/cognitive phrase labels |
| `semanticProfile.behaviorModifiers` | `Object` | Behavior description labels |
| `semanticProfile.emotionKeywords` | `Object` | Emotion dimension → keyword list |
| `semanticProfile.emotionRegulationKeywords` | `Object` | Regulation strategy keywords |
| `semanticProfile.eventDefaults` | `Object` | Default category and gossip templates |
| `semanticProfile.socialNormKeywords` | `Object` | Positive/negative social norm keywords |
| `semanticProfile.defaultSemanticCategories` | `Object` | Type/keyword/category mappings |

**Merge behavior:** When `mergeSemanticProfile(defaults)` is called, domain values override defaults. Nested objects merge recursively; arrays replace entirely. See `docs/SEMANTIC_PROFILE_RFC.md` for details.

**Example:**

```javascript
semanticProfile: {
  language: 'en',
  emotionKeywords: {
    happy: ['happy', 'glad', 'joyful'],
    sad: ['sad', 'sorrowful', 'melancholy'],
  },
  narrativeModifiers: {
    emotionLabels: {
      sadness: 'feeling down',
      joy: 'in good spirits',
    },
    needPhrases: {
      veryTired: 'exhausted',
      tired: 'a bit tired',
    },
  },
  eventDefaults: {
    defaultSemanticCategory: 'daily life',
    gossipSuffix: 'also mentioned',
    gossipVerb: 'said',
  },
  defaultSemanticCategories: {
    typeMap: {
      social: 'social interaction',
      weather: 'weather',
      general: 'daily life',
    },
    keywordMap: {
      'social interaction': ['chat', 'friend', 'meet'],
    },
    eventMeaningRules: [
      { keywords: ['rest', 'sleep', 'relax'], meaningType: 'rest', weight: 0.3 },
      { keywords: ['work', 'study', 'focus'], meaningType: 'work', weight: 0.3 },
    ],
    stateCategoryMap: {
      active: 'work',
      social: 'social interaction',
      rest: 'rest',
    },
  },
}
```

### Skip Behavior

| Field | Type | Description |
|-------|------|-------------|
| `skipBehavior.skipClass.states` | `string[]` | States when skipping |
| `skipBehavior.skipClass.regions` | `string[]` | Regions when skipping |
| `skipBehavior.skipClass.memories` | `string[]` | Memory templates |

### Narrative Templates

| Field | Type | Description |
|-------|------|-------------|
| `narrativeTemplates.statePositionMap` | `Object` | State → display text |
| `narrativeTemplates.regionMap` | `Object` | Region → display text |
| `narrativeTemplates.observationAction.genericTemplates` | `string[]` | Exact interaction content eligible for state-based observation rendering |
| `narrativeTemplates.observationAction.stateMap` | `Object` | State → domain-owned observation text |
| `narrativeTemplates.observationAction.template` | `string` | Rendering template; supports `{state}` and `{region}` |
| `narrativeTemplates.observationAction.withRegionTemplate` | `string` | Optional rendering template used when the event has a region |
| `narrativeTemplates.thirdPartyKnowledge.unknown` | `string` | Safe epistemic-unknown reply; supports `{target}` |
| `narrativeTemplates.thirdPartyKnowledge.observation` | `string` | Reply for an allowed observation; supports `{target}` and `{action}` |
| `narrativeTemplates.thirdPartyKnowledge.location` | `string` | Reply for an allowed observed location; supports `{target}` and `{location}` |
| `narrativeTemplates.thirdPartyKnowledge.event` | `string` | Reply for an allowed event; supports `{event}` |

### Role Archetypes

```javascript
roleArchetypes: {
  blacksmith: {
    entries: [
      { startHour: 8, endHour: 12, region: '铁匠铺', activity: '工作', days: [0,1,2,3,4,5,6], probability: 0.9, noise: 10 },
      { startHour: 12, endHour: 13, region: '酒馆', activity: '喝酒', days: [0,1,2,3,4,5,6], probability: 0.7, noise: 20 },
    ],
  },
}
```

### Fallback

```javascript
fallback: {
  defaultRegion: '小屋',
  defaultState: '休息',
  unknownState: '闲逛',
  unknownRegion: '广场',
}
```

### Forbidden Terms

```javascript
forbiddenTerms: ['教室', '图书馆', '宿舍', '食堂', '学生', '老师']
```

These terms are replaced in the final output as a last resort. They should not be the primary mechanism for world-agnostic behavior — use domain fields instead.

---

## Minimal Domain Example

```javascript
const minimalDomain = {
  id: 'minimal',
  name: 'Minimal World',
  version: '1.0.0',

  regions: ['广场', '酒馆', '小屋'],
  adjacency: [['小屋', '广场', 1], ['广场', '酒馆', 1]],
  regionCoords: {
    '广场': { shape: 'circle', cx: 200, cy: 150, radius: 50 },
    '酒馆': { shape: 'rect', x: 300, y: 100, w: 80, h: 60 },
    '小屋': { shape: 'rect', x: 50, y: 50, w: 60, h: 40 },
  },

  placeTypes: {
    food: ['酒馆'],
    rest: ['小屋'],
    social: ['酒馆', '广场'],
    work: [],
    sleep: ['小屋'],
    explore: ['广场'],
    outdoor: ['广场'],
  },

  states: {
    '睡觉': { next: ['醒来'], hours: [0,1,2,3,4,5,6,7,8], category: 'sleep' },
    '醒来': { next: ['闲逛', '工作'], hours: [6,7,8,9], category: 'morning' },
    '闲逛': { next: ['喝酒', '工作', '休息'], hours: [8,9,10,11,12,13,14,15,16,17,18,19], category: 'social' },
    '喝酒': { next: ['闲逛', '休息'], hours: [10,11,12,13,14,15,16,17,18,19,20,21,22,23], category: 'social' },
    '工作': { next: ['休息', '闲逛'], hours: [8,9,10,11,12,13,14,15,16,17], category: 'active' },
    '休息': { next: ['闲逛', '睡觉'], hours: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23], category: 'rest' },
  },

  stateCenters: {
    '睡觉': [0.00, 0.00, 0.00, 0.00],
    '醒来': [0.15, 0.05, 0.10, 0.08],
    '闲逛': [0.40, 0.60, 0.15, 0.50],
    '喝酒': [0.30, 0.80, 0.20, 0.70],
    '工作': [0.70, 0.15, 0.75, 0.20],
    '休息': [0.10, 0.10, 0.10, 0.10],
  },

  labelTimePenalties: {},

  needSatisfactionMap: {
    hunger: { states: ['喝酒'], regions: ['酒馆'] },
    energy: { states: ['睡觉', '休息'], regions: [] },
    social: { states: ['喝酒', '闲逛'], regions: ['酒馆', '广场'] },
    comfort: { states: ['休息', '睡觉'], regions: ['小屋'] },
    stimulation: { states: ['闲逛'], regions: ['广场'] },
  },

  needDriveStates: {
    hunger: ['喝酒'],
    energy: ['休息', '睡觉'],
    social: ['喝酒', '闲逛'],
    comfort: ['休息', '睡觉'],
    stimulation: ['闲逛'],
  },

  eventTemplates: {
    genericEvents: [{ content: '看到一只猫', delta: { interest: 0.03 } }],
    timeEvents: {},
    weatherEvents: {},
    regionEvents: {},
  },

  memoryTemplates: {
    semanticCategories: {
      typeMap: { social: '社交', general: '日常' },
      keywordMap: {},
      stateCategoryMap: {},
    },
  },

  narrativeTemplates: {
    statePositionMap: { '睡觉': '在睡觉', '闲逛': '在闲逛', '喝酒': '在喝酒', '工作': '在工作', '休息': '在休息' },
    regionMap: { '小屋': '在小屋里', '广场': '在广场上', '酒馆': '在酒馆里' },
  },

  fallback: {
    defaultRegion: '小屋',
    defaultState: '休息',
    unknownState: '闲逛',
    unknownRegion: '广场',
  },

  forbiddenTerms: [],
};
```

---

## Custom Domain Checklist

- [ ] `id` is unique string
- [ ] `name` is non-empty string
- [ ] `regions` is non-empty array
- [ ] `states` has at least one state
- [ ] `stateCenters` has entries for all states (4D vectors, each 0-1)
- [ ] `fallback` values reference existing regions/states
- [ ] `adjacency` references existing regions
- [ ] `needSatisfactionMap` states/regions exist in domain
- [ ] `needDriveStates` references existing states
- [ ] `eventTemplates` regions exist in domain
- [ ] `eventTemplates` events have `content`
- [ ] `roleArchetypes` entries reference existing regions
- [ ] `forbiddenTerms` is string array (if provided)
- [ ] `states[*].next` references existing states

---

## Validation

```javascript
const { validateDomain } = require('andy-engine/domain');

// Basic validation
const result = validateDomain(domain);
// { valid: boolean, errors: [...], warnings: [...] }

// Strict mode (warnings become errors)
const strict = validateDomain(domain, { strict: true });

// Throw on error
validateDomain(domain, { throwOnError: true });
```

**Error format:**
```javascript
{
  valid: false,
  errors: [
    { path: 'stateCenters.休息', message: '必须是 4 维数组' },
    { path: 'states.休息.next[0]', message: '引用了不存在的状态 "不存在"' }
  ],
  warnings: [
    { path: 'eventTemplates.regionEvents', message: '...' }
  ]
}
```

**Strict mode:** Set `strict: true` to promote warnings to errors. Use for new domains; relax for legacy presets.

---

## Role Archetypes

Role archetypes define schedule presets within a domain:

```javascript
roleArchetypes: {
  blacksmith: {
    entries: [
      {
        startHour: 8,          // Start hour (0-23)
        endHour: 12,           // End hour
        region: '铁匠铺',       // Must be in domain.regions
        activity: '工作',       // Activity label
        days: [0,1,2,3,4,5,6], // Days of week (0=Sunday)
        probability: 0.9,      // Execution probability (0-1)
        noise: 10,             // Time jitter in minutes
      },
    ],
  },
}
```

**Usage:**
```javascript
const engine = new AndyEngine({ domain: myDomain });
const agent = engine.createCharacter({
  id: 'smith',
  name: '铁匠',
  schedule: 'blacksmith', // Uses domain.roleArchetypes.blacksmith
});
```

**Rule:** If `schedule` is a string and exists in `domain.roleArchetypes`, it's used directly. If not found and domain is campus, falls back to legacy presets (`student`, `worker`, etc.). Custom domains should always define their own archetypes.

---

## Design Principles

1. **Core is world-agnostic** — engine code should not contain world-specific strings
2. **Domain provides all semantics** — regions, states, events, narratives come from domain
3. **`forbiddenTerms` is last resort** — not the primary mechanism for world-agnostic behavior
4. **Default is campus** — `new AndyEngine()` uses `presets/campus` for backward compatibility
5. **Custom domains are self-contained** — should not depend on campus preset
6. **Campus preset is just a default** — not the core world model
7. **Validation is mandatory** — custom domains are validated on creation
