# Graph Report - pixa  (2026-08-26)

## Corpus Check
- Corpus is ~12,045 words - fits in a single context window. You may not need a graph.

## Summary
- 94 nodes · 116 edges · 7 communities
- Extraction: 91% EXTRACTED · 9% INFERRED · 1% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.85)
- Token cost: 56,771 input · 0 output

## Community Hubs (Navigation)
- Game World Data & Dialogue Builders
- Legacy pixa.js (dead code)
- NPC AI Plugin (server)
- Build Tooling & Package Config
- App Component Logic (live)
- Runtime Dependencies
- App Bootstrap & Docs

## God Nodes (most connected - your core abstractions)
1. `App()` - 12 edges
2. `App()` - 8 edges
3. `getDialogueChoices()` - 7 edges
4. `onDown()` - 7 edges
5. `buildSystemPrompt()` - 5 edges
6. `scripts` - 4 edges
7. `buildDialogue()` - 3 edges
8. `startConvo()` - 3 edges
9. `buildChoicesSchema()` - 3 edges
10. `buildChoicesTool()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `pixa (project)` --conceptually_related_to--> `Meadowbrook (app title)`  [AMBIGUOUS]
  README.md → index.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **App Bootstrap Flow** — index_document, index_root, src_main_module [INFERRED 0.75]

## Communities (7 total, 0 thin omitted)

### Community 0 - "Game World Data & Dialogue Builders"
Cohesion: 0.13
Nodes (15): BGM_MODULES, BGM_TRACKS, browseGoodsChoice(), buildDialogue(), FIRST_MEETING_LINES, getDialogueChoices(), initialNPCs, INTERIORS (+7 more)

### Community 1 - "Legacy pixa.js (dead code)"
Cohesion: 0.14
Nodes (10): App(), pickChoice(), startConvo(), buildDialogue(), EKeyListener(), greet(), initialNPCs, MAP (+2 more)

### Community 2 - "NPC AI Plugin (server)"
Cohesion: 0.18
Nodes (14): buildChoicesSchema(), buildChoicesTool(), buildSystemPrompt(), FIRST_MEETING_TOPICS, generateWithAnthropic(), generateWithOllama(), MOOD_POOL, moodFor() (+6 more)

### Community 3 - "Build Tooling & Package Config"
Cohesion: 0.14
Nodes (13): devDependencies, vite, @vitejs/plugin-react, name, private, scripts, build, dev (+5 more)

### Community 4 - "App Component Logic (live)"
Cohesion: 0.19
Nodes (9): App(), buyItem(), onDown(), pickChoice(), showOfflineNoticeOnce(), greet(), pickRandomTrack(), quietStareLine() (+1 more)

### Community 5 - "Runtime Dependencies"
Cohesion: 0.29
Nodes (7): @anthropic-ai/sdk, dependencies, @anthropic-ai/sdk, react, react-dom, react, react-dom

### Community 6 - "App Bootstrap & Docs"
Cohesion: 0.40
Nodes (5): index.html (entry document), Meadowbrook (app title), #root mount element, pixa (project), src/main.jsx (app entry script)

## Ambiguous Edges - Review These
- `pixa (project)` → `Meadowbrook (app title)`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to

## Knowledge Gaps
- **34 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+29 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `pixa (project)` and `Meadowbrook (app title)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `App()` connect `App Component Logic (live)` to `Game World Data & Dialogue Builders`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Runtime Dependencies` to `Build Tooling & Package Config`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `App()` (e.g. with `onDown()` and `onUp()`) actually correct?**
  _`App()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `App()` (e.g. with `onDown()` and `onUp()`) actually correct?**
  _`App()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `onDown()` (e.g. with `App()` and `showOfflineNoticeOnce()`) actually correct?**
  _`onDown()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _34 weakly-connected nodes found - possible documentation gaps or missing edges._