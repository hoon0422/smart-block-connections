---
title: Testing Strategy
category: PRD
status: implemented
created: 2026-03-07
updated: 2026-03-07
---

## 6.1 Test Architecture Overview

```
tests/
├── unit/                          # Vitest — no Obsidian runtime
│   ├── block-resolver.test.ts
│   └── formatting.test.ts
├── e2e/                           # Playwright — drives Obsidian via CDP
│   ├── helpers/
│   │   ├── obsidian-app.ts        # CDP launch/teardown (spawn + connectOverCDP)
│   │   ├── selectors.ts           # DOM selectors for Obsidian UI elements
│   │   ├── wait-helpers.ts        # Wait helpers, command triggers, notice dismissal
│   │   └── paths.ts               # Shared PLUGIN_DIST path
│   ├── context-menu.spec.ts       # Menu registration + command flow (2 tests)
│   ├── sidebar-view.spec.ts       # Header, scores, ranking, toggle (5 tests)
│   ├── navigation.spec.ts         # Click result → opens note (1 test)
│   ├── copy-list.spec.ts          # Copy markdown to clipboard (1 test)
│   ├── smoke.spec.ts              # Workspace, editor, SC env (3 tests)
│   ├── index-vault.spec.ts        # One-time SC indexing utility
│   └── debug.spec.ts              # Diagnostic utility
├── playwright.config.ts
└── vitest.config.ts
```

**Test vault** is stored externally at `/Users/Younghoon/projects/smakr-block-connections-test-vaults` with pre-built `.smart-env/` embeddings. Each E2E run copies it to a temp directory for isolation.

## 6.2 Unit Tests (Vitest)

Pure logic tests with mocked Obsidian/SC objects. No runtime dependencies.

- `block-resolver.test.ts` — Cursor-to-block resolution, line range matching, edge cases
- `formatting.test.ts` — Markdown output for clipboard copy

```bash
bunx vitest run
```

## 6.3 E2E Tests (Playwright + CDP)

### 6.3.1 How Playwright Drives Obsidian

> **Key discovery:** Playwright's `electron.launch()` does NOT work with Obsidian's packaged Electron binary. It times out because Obsidian doesn't expose `BrowserWindow` the way Playwright expects.

**Working approach:** Spawn Obsidian with `--remote-debugging-port=9222` and connect via `chromium.connectOverCDP()`.

```typescript
// tests/e2e/helpers/obsidian-app.ts (simplified)
const obsidianProcess = spawn(obsidianBin, [`--remote-debugging-port=9222`], {
  env: { ...process.env, ELECTRON_DISABLE_GPU: "1" },
  stdio: "pipe",
});

// Wait for CDP endpoint, then connect
const browser = await chromium.connectOverCDP(`http://127.0.0.1:9222`);
const page = browser.contexts()[0]?.pages()[0];
```

The helper also:
- Copies the source vault to a temp directory
- Registers the vault in Obsidian's config (`~/Library/Application Support/obsidian/obsidian.json`)
- Refreshes the plugin build into the vault
- Dismisses the "Trust vault author" modal
- Kills any existing Obsidian process before launch
- Restores original Obsidian config on teardown

### 6.3.2 Wait Helpers & Known Limitations

Several Obsidian/Electron behaviors require workarounds:

| Issue | Workaround |
|---|---|
| **CDP right-click doesn't trigger context menu** | Test menu registration via `workspace.trigger("editor-menu", mockMenu)`. Test full flow via `app.commands.executeCommandById()`. |
| **Keyboard shortcuts don't work** (Cmd+O, Cmd+G) | Use Obsidian API: `app.workspace.openLinkText()`, `view.editor.setCursor()` |
| **SC notifications overlay sidebar buttons** | `dismissNotices()` removes `.notice-container` via DOM. Also use `force: true` on clicks. |
| **Bridge ready ≠ blocks loaded** | `waitForSCBlocks()` polls `smart_blocks.items` for vec data |
| **Trust modal blocks plugin loading** | Auto-dismissed in `launchObsidian()` helper |
| **`waitForFunction` has CDP timeout issues** | Use manual polling loops instead |

Key helpers in `wait-helpers.ts`:

```typescript
dismissModals(page)              // Close trust/other modals
dismissNotices(page)             // Remove SC notification overlays
waitForSCBlocks(page)            // Wait for blocks to have embeddings
openNote(page, "Note Alpha")     // Open via Obsidian API
setCursorLine(page, 5)           // Set cursor via editor API
triggerConnectionsCommand(page)  // Execute command via API
```

### 6.3.3 beforeAll Pattern

Every spec file follows this pattern:

```typescript
test.beforeAll(async () => {
  ctx = await launchObsidian(PLUGIN_DIST);
  const { page } = ctx;

  // Wait for workspace
  await page.waitForSelector(".workspace", { timeout: 15000 });

  // Poll for bridge readiness (manual loop, not waitForFunction)
  const start = Date.now();
  while (Date.now() - start < 30000) {
    const ready = await page.evaluate(() => {
      const plugin = (window as any).app?.plugins?.plugins?.["sc-block-explorer"];
      return plugin?.bridge?.isReady === true;
    });
    if (ready) break;
    await page.waitForTimeout(1000);
  }

  // Wait for SC blocks to have embeddings
  await waitForSCBlocks(page);
});
```

### 6.3.4 E2E Test Specs (12 tests total)

**context-menu.spec.ts** (2 tests)
- Registers "See relevant connections" in `editor-menu` event (via mock menu)
- Command opens sidebar with results (via `executeCommandById`)

**sidebar-view.spec.ts** (5 tests)
- Displays source block info in header
- Results sorted by score descending
- Note Beta (same topic) ranks higher than Note Gamma (different topic)
- Results have score and title
- Toggle button switches between blocks and sources

**navigation.spec.ts** (1 test)
- Clicking a result from a different note opens that note

**copy-list.spec.ts** (1 test)
- Copies markdown-formatted connection list to clipboard

**smoke.spec.ts** (3 tests)
- Obsidian launches and shows workspace
- Can open a note in the editor
- SC environment status (sources loaded)

### 6.3.5 Test Vault

The test vault lives at `/Users/Younghoon/projects/smakr-block-connections-test-vaults` with:
- 5 notes: Note Alpha (ML), Note Beta (ML), Note Gamma (cooking), Note Delta (ML deployment), Release Notes
- Pre-indexed `.smart-env/` with embeddings (31 blocks, 17 embedded via `TaylorAI/bge-micro-v2`)
- SC plugin installed with `data.json` config

**Re-indexing** (only needed if test notes change):
```bash
bunx playwright test tests/e2e/index-vault.spec.ts --config tests/playwright.config.ts --timeout 300000
```

## 6.4 Running Tests

```bash
# Unit tests (fast, no Obsidian needed)
bunx vitest run

# E2E tests (requires Obsidian installed)
bunx playwright test tests/e2e/context-menu.spec.ts tests/e2e/sidebar-view.spec.ts tests/e2e/navigation.spec.ts tests/e2e/copy-list.spec.ts tests/e2e/smoke.spec.ts --config tests/playwright.config.ts

# Build plugin first (E2E tests auto-build via esbuild.config.mjs)
bun run build
```

## 6.5 CI / Agent Automation Considerations

| Concern | Solution |
|---|---|
| Obsidian binary not on CI | Use a self-hosted runner (dev machine) or macOS runner with Obsidian pre-installed |
| Obsidian trust modal | Auto-dismissed by `launchObsidian()` helper |
| SC indexing takes time | Ship pre-indexed vault — SC loads existing `.smart-env/` data |
| CDP right-click limitation | Test via Obsidian's command API and workspace events instead |
| SC notifications block clicks | `dismissNotices()` + `force: true` on button clicks |
| Flaky selectors | Centralized in `selectors.ts` |
| Test isolation | Copy vault to temp dir per run; never mutate the original |
| Clipboard access | `navigator.clipboard` works in Electron context |
| Parallel execution | Workers must be 1 — single Obsidian instance at a time |
| Screenshot on failure | Playwright captures automatically with `only-on-failure` config |

## 6.6 What an AI Agent Can Run Autonomously

| Test Layer | Agent-Runnable? | Notes |
|---|---|---|
| Unit tests (Vitest) | **Yes, fully** | No external dependencies, mocked data |
| E2E tests (Playwright) | **Yes, if Obsidian is installed** | Agent runs `bunx playwright test`, reads results, iterates on failures |
| E2E test authoring | **Yes** | Agent writes specs, runs them, adjusts based on failure screenshots |
| Fixture vault creation | **Partially** | Agent can create notes; indexing requires `index-vault.spec.ts` |
| Fixture vault re-indexing | **Yes, via script** | `index-vault.spec.ts` launches Obsidian and waits for SC to embed |
