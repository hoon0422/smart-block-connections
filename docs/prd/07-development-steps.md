---
title: Development Steps (Task Checklist)
category: PRD
status: draft
created: 2026-03-07
---

## Step 0: Runtime Exploration (30 min)

- [ ] Open Obsidian dev console with SC installed
- [ ] Map out `sc.env` object shape — find `smart_blocks`, `smart_sources`
- [ ] Confirm `nearest()` method signature and return type
- [ ] Find how blocks store line ranges (`.data.lines`, `.lines`, `.line_start`/`.line_end`)
- [ ] Find how blocks store their embedding vector (`.vec`, `.data.vec`)
- [ ] Test `smart_embed_model.embed()` for ad-hoc text embedding
- [ ] Document all findings in a `RUNTIME_NOTES.md`

## Step 1: Scaffold (20 min)

- [ ] `bun init`, install `obsidian` types, esbuild config
- [ ] Create `manifest.json` (id: `sc-block-explorer`, minAppVersion: `1.1.0`)
- [ ] Bare `Plugin` subclass that logs "loaded" on enable
- [ ] Symlink into `.obsidian/plugins/` for hot reload

## Step 2: SC Bridge (1 hr)

- [ ] Implement `SCBridgeService` with runtime-verified property names
- [ ] Add `init()` with retry logic (SC loads async)
- [ ] Expose `findConnections()` and `embedText()`
- [ ] Unit test: bridge.isReady returns true when SC is active

## Step 3: Block Resolver (1 hr)

- [ ] Implement `BlockResolver.resolve(editor, file)`
- [ ] Handle edge cases: cursor outside any block, file not yet embedded
- [ ] Fallback: embed selected text on-the-fly if block has no vec
- [ ] Test with various note structures (multiple headings, no headings, nested)

## Step 4: Context Menu (30 min)

- [ ] Register `editor-menu` event handler
- [ ] Wire up to `showConnectionsForCursor()`
- [ ] Add command palette alternative
- [ ] Test: right-click → menu item appears → connections found

## Step 5: Sidebar View (2 hr)

- [ ] Implement `ConnectionsView` extending `ItemView`
- [ ] Render results with score, title, snippet
- [ ] Click-to-navigate with `openLinkText()`
- [ ] Ctrl/Cmd hover preview via `hover-link` event
- [ ] Blocks/sources toggle button
- [ ] Copy-list button (markdown format)
- [ ] Empty state messaging

## Step 6: Settings (30 min)

- [ ] Settings interface + defaults
- [ ] Settings tab UI (result type, limit, min score)
- [ ] Wire settings into bridge.findConnections() calls

## Step 7: Polish & Edge Cases (1 hr)

- [ ] Handle SC not installed (show notice with install instructions)
- [ ] Handle SC still indexing (show progress or "not ready" state)
- [ ] Handle file not yet embedded
- [ ] Performance: debounce if user rapidly right-clicks
- [ ] Test on mobile (if applicable)

## Step 8: Testing (2–3 hr)

- [ ] Set up Vitest config, write unit tests for BlockResolver
- [ ] Write unit tests for formatting / clipboard output
- [ ] Write unit tests for SCBridgeService with mocked env
- [ ] Create test vault fixture (5 notes with controlled content)
- [ ] Run SC once on fixture vault to generate `.smart-env/` AJSON files
- [ ] Check fixture vault into repo (including `.smart-env/`)
- [ ] Set up Playwright config for Electron
- [ ] Implement `obsidian-app.ts` launcher helper
- [ ] Implement `wait-helpers.ts` (waitForObsidianReady, waitForSCReady, waitForPluginReady)
- [ ] Implement `selectors.ts` (centralized DOM selectors)
- [ ] Write E2E: context menu appears and triggers sidebar
- [ ] Write E2E: sidebar shows sorted results with scores
- [ ] Write E2E: clicking result navigates to the note
- [ ] Write E2E: toggle between blocks/sources works
- [ ] Write E2E: copy button writes markdown to clipboard
- [ ] Configure `OBSIDIAN_PATH` env var for local machine
- [ ] Run full suite: `bunx vitest run && bunx playwright test`
- [ ] (Optional) Set up a script for AI agent to run tests headlessly
