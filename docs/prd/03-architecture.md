---
title: Architecture
category: PRD
status: draft
created: 2026-03-07
---

```
┌──────────────────────────────────────────────────┐
│                  Obsidian Runtime                 │
├──────────────────────────────────────────────────┤
│                                                  │
│  Smart Connections Plugin (already running)       │
│  ├── env.smart_sources  (SmartSources collection)│
│  ├── env.smart_blocks   (SmartBlocks collection) │
│  └── env.smart_embed_model (embedding model)     │
│           ▲                                      │
│           │ runtime reference                    │
│           │                                      │
│  SC Block Explorer Plugin (this plugin)          │
│  ├── main.ts           (Plugin class)            │
│  ├── SCBridgeService   (wraps SC access)         │
│  ├── BlockResolver     (cursor → block entity)   │
│  ├── ConnectionsView   (sidebar ItemView)        │
│  └── types.ts          (interfaces)              │
│                                                  │
└──────────────────────────────────────────────────┘
```

## Module Breakdown

| Module            | Responsibility                                                                        |
| ----------------- | ------------------------------------------------------------------------------------- |
| `main.ts`         | Plugin lifecycle, registers context menu handler, manages sidebar view                |
| `SCBridgeService` | Singleton that holds reference to SC's `smart_env`, exposes typed `findConnections()` |
| `BlockResolver`   | Given an `Editor` + cursor position, resolves which `SmartBlock` entity this maps to  |
| `ConnectionsView` | `ItemView` subclass rendering the results list in the sidebar                         |
| `types.ts`        | TypeScript interfaces for connection results, settings, etc.                          |
