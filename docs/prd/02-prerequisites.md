---
title: Prerequisites & Dependencies
category: PRD
status: draft
created: 2026-03-07
---

## Runtime Dependencies

- **Smart Connections plugin** must be installed and have completed initial indexing
- Obsidian v1.1.0+ (for CM6 and `registerEditorExtension` support)

## Development Dependencies

- Node.js 18+
- TypeScript
- `obsidian` type definitions (`bun add obsidian --save-dev`)
- esbuild (for bundling)
- No direct dependency on `jsbrains` modules — we access them at runtime through the SC plugin instance

## Testing Dependencies

- `@playwright/test` — E2E tests driving Obsidian's Electron shell
- `vitest` — unit tests for pure logic (bridge, resolver, formatting)
- A **test vault** with Smart Connections pre-indexed (fixture, checked into repo)

## Key Obsidian APIs

| API                                                             | Purpose                               |
| --------------------------------------------------------------- | ------------------------------------- |
| `Plugin`                                                        | Lifecycle (onload/onunload)           |
| `this.app.plugins.plugins["smart-connections"]`                 | Access Smart Environment              |
| `this.registerEvent(this.app.workspace.on('editor-menu', ...))` | Context menu hook                     |
| `ItemView`                                                      | Custom sidebar panel                  |
| `this.app.workspace.revealLeaf()`                               | Open/focus sidebar                    |
| `MarkdownView` / `Editor`                                       | Get cursor position and block content |
