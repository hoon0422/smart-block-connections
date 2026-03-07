---
title: Testing Strategy
category: PRD
status: draft
created: 2026-03-07
---

## 6.1 Test Architecture Overview

```
tests/
├── unit/                          # Vitest — no Obsidian runtime
│   ├── sc-bridge.test.ts
│   ├── block-resolver.test.ts
│   └── formatting.test.ts
├── e2e/                           # Playwright — drives Obsidian Electron
│   ├── fixtures/
│   │   └── test-vault/            # Pre-indexed vault with SC data
│   │       ├── .obsidian/
│   │       │   └── plugins/
│   │       │       ├── smart-connections/   # SC plugin installed
│   │       │       └── sc-block-explorer/   # Our plugin (symlinked at test time)
│   │       ├── .smart-env/                  # Pre-built embeddings
│   │       │   ├── smart_sources.ajson
│   │       │   └── smart_blocks.ajson
│   │       ├── Note Alpha.md                # Known test content
│   │       ├── Note Beta.md
│   │       ├── Folder/
│   │       │   └── Note Gamma.md
│   │       └── No Headings.md               # Edge case: flat note
│   ├── helpers/
│   │   ├── obsidian-app.ts        # Playwright Electron launch helper
│   │   ├── selectors.ts           # DOM selectors for Obsidian UI elements
│   │   └── wait-helpers.ts        # Wait for SC ready, vault indexed, etc.
│   ├── context-menu.spec.ts
│   ├── sidebar-view.spec.ts
│   ├── navigation.spec.ts
│   └── copy-list.spec.ts
├── playwright.config.ts
└── vitest.config.ts
```

## 6.2 Unit Tests (Vitest)

Pure logic tests that run in Node.js with mocked Obsidian/SC objects. An AI agent can write and run these fully autonomously.

```typescript
// tests/unit/block-resolver.test.ts
import { describe, it, expect } from "vitest";
import { BlockResolver } from "../../src/resolvers/block-resolver";

describe("BlockResolver", () => {
  const mockBlocks = {
    items: {
      "note.md#Introduction": {
        key: "note.md#Introduction",
        data: { lines: [0, 15] },
        vec: [0.1, 0.2, 0.3],
        content: "This is the introduction...",
      },
      "note.md#Methods": {
        key: "note.md#Introduction",
        data: { lines: [16, 40] },
        vec: [0.4, 0.5, 0.6],
        content: "We used the following methods...",
      },
    },
  };

  const mockBridge = {
    smartBlocks: mockBlocks,
    smartSources: {
      get: (path: string) => ({
        blocks: mockBlocks.items,
      }),
    },
  };

  it("resolves correct block for cursor on line 10", () => {
    const resolver = new BlockResolver(mockBridge as any);
    const mockEditor = { getCursor: () => ({ line: 10 }) };
    const mockFile = { path: "note.md" };

    const result = resolver.resolve(mockEditor as any, mockFile as any);
    expect(result?.key).toBe("note.md#Introduction");
    expect(result?.vec).toEqual([0.1, 0.2, 0.3]);
  });

  it("resolves correct block for cursor on line 20", () => {
    const resolver = new BlockResolver(mockBridge as any);
    const mockEditor = { getCursor: () => ({ line: 20 }) };
    const mockFile = { path: "note.md" };

    const result = resolver.resolve(mockEditor as any, mockFile as any);
    expect(result?.key).toBe("note.md#Methods");
  });

  it("returns null when cursor is outside all blocks", () => {
    const resolver = new BlockResolver(mockBridge as any);
    const mockEditor = { getCursor: () => ({ line: 999 }) };
    const mockFile = { path: "note.md" };

    const result = resolver.resolve(mockEditor as any, mockFile as any);
    expect(result).toBeNull();
  });

  it("returns null for file with no blocks in DB", () => {
    const resolver = new BlockResolver(mockBridge as any);
    const mockEditor = { getCursor: () => ({ line: 5 }) };
    const mockFile = { path: "unknown.md" };

    const result = resolver.resolve(mockEditor as any, mockFile as any);
    expect(result).toBeNull();
  });
});
```

```typescript
// tests/unit/formatting.test.ts
import { describe, it, expect } from "vitest";
import { formatResultsAsMarkdown } from "../../src/utils/formatting";

describe("formatResultsAsMarkdown", () => {
  it("formats connection list for clipboard", () => {
    const results = [
      { key: "note.md#Intro", score: 0.87, path: "note.md", content: "" },
      { key: "other.md#Summary", score: 0.62, path: "other.md", content: "" },
    ];
    const output = formatResultsAsMarkdown("test.md#Block", results);

    expect(output).toContain("## Connections for test.md#Block");
    expect(output).toContain("[[note.md#Intro]]");
    expect(output).toContain("87.0%");
    expect(output).toContain("[[other.md#Summary]]");
  });

  it("handles empty results", () => {
    const output = formatResultsAsMarkdown("test.md#Block", []);
    expect(output).toContain("No connections found");
  });
});
```

## 6.3 E2E Tests (Playwright + Electron)

### 6.3.1 How Playwright Drives Obsidian

Playwright can launch Electron apps directly using `electron.launch()`. Obsidian is an Electron app, so we point Playwright at the Obsidian binary and pass the test vault as the vault argument.

```typescript
// tests/e2e/helpers/obsidian-app.ts
import {
  _electron as electron,
  ElectronApplication,
  Page,
} from "@playwright/test";
import path from "path";
import fs from "fs-extra";

// Platform-specific Obsidian binary paths
const OBSIDIAN_PATHS = {
  darwin: "/Applications/Obsidian.app/Contents/MacOS/Obsidian",
  linux: "/usr/bin/obsidian", // or AppImage path
  win32: "C:\\Users\\<user>\\AppData\\Local\\Obsidian\\Obsidian.exe",
};

export interface ObsidianTestContext {
  electronApp: ElectronApplication;
  page: Page;
}

/**
 * Launch Obsidian with the test vault.
 *
 * Key considerations:
 * - Obsidian remembers the last vault; we override via CLI arg
 * - We copy the fixture vault to a temp dir to avoid mutation
 * - Our plugin is symlinked into the vault's plugins dir
 */
export async function launchObsidian(
  pluginDistPath: string,
): Promise<ObsidianTestContext> {
  const platform = process.platform as keyof typeof OBSIDIAN_PATHS;
  const obsidianBin = process.env.OBSIDIAN_PATH ?? OBSIDIAN_PATHS[platform];

  // Copy fixture vault to temp directory (isolate test runs)
  const fixtureVault = path.resolve(__dirname, "../fixtures/test-vault");
  const tempVault = path.resolve(__dirname, "../.tmp-vault");
  await fs.remove(tempVault);
  await fs.copy(fixtureVault, tempVault);

  // Symlink the built plugin into the temp vault
  const pluginDest = path.join(
    tempVault,
    ".obsidian",
    "plugins",
    "sc-block-explorer",
  );
  await fs.ensureDir(pluginDest);
  // Copy built main.js, manifest.json, styles.css
  await fs.copy(pluginDistPath, pluginDest);

  const electronApp = await electron.launch({
    executablePath: obsidianBin,
    args: [`--vault=${tempVault}`],
    // Obsidian-specific: disable GPU for headless CI stability
    env: {
      ...process.env,
      ELECTRON_DISABLE_GPU: "1",
    },
    timeout: 30000,
  });

  // Obsidian may open multiple windows; get the main one
  const page = await electronApp.firstWindow();

  return { electronApp, page };
}

export async function closeObsidian(ctx: ObsidianTestContext) {
  await ctx.electronApp.close();
  // Clean up temp vault
  const tempVault = path.resolve(__dirname, "../.tmp-vault");
  await fs.remove(tempVault);
}
```

### 6.3.2 Wait Helpers

Obsidian and SC both initialize asynchronously. Tests need to wait for readiness.

```typescript
// tests/e2e/helpers/wait-helpers.ts
import { Page, expect } from "@playwright/test";

/**
 * Wait for Obsidian to finish loading.
 * The app shows a loading screen, then renders the workspace.
 */
export async function waitForObsidianReady(page: Page, timeout = 30000) {
  // Wait for the workspace container to appear
  await page.waitForSelector(".workspace", { timeout });
  // Give plugins time to initialize
  await page.waitForTimeout(2000);
}

/**
 * Wait for Smart Connections to finish loading.
 * SC shows "Loading smart connections..." then transitions to ready.
 * We check via JS evaluation in the Electron context.
 */
export async function waitForSCReady(page: Page, timeout = 60000) {
  await page.waitForFunction(
    () => {
      const sc = (window as any).app?.plugins?.plugins?.["smart-connections"];
      return sc?.env?.smart_blocks && sc?.env?.smart_sources;
    },
    { timeout },
  );
}

/**
 * Wait for our plugin to be loaded and bridge initialized.
 */
export async function waitForPluginReady(page: Page, timeout = 15000) {
  await page.waitForFunction(
    () => {
      const plugin = (window as any).app?.plugins?.plugins?.[
        "sc-block-explorer"
      ];
      return plugin?.bridge?.isReady === true;
    },
    { timeout },
  );
}

/**
 * Open a specific note in the editor.
 */
export async function openNote(page: Page, filename: string) {
  // Use Obsidian's command palette to open a file
  // Ctrl+O opens the quick switcher
  await page.keyboard.press("Control+o");
  await page.waitForSelector(".prompt-input", { timeout: 5000 });
  await page.fill(".prompt-input", filename);
  await page.waitForTimeout(500); // Let search results populate
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1000); // Let note render
}

/**
 * Place cursor at a specific line in the active editor.
 */
export async function setCursorLine(page: Page, line: number) {
  // Use Obsidian's "Go to line" command: Ctrl+G
  await page.keyboard.press("Control+g");
  await page.waitForSelector(".prompt-input", { timeout: 3000 });
  await page.fill(".prompt-input", String(line + 1)); // Obsidian is 1-indexed
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
}

/**
 * Right-click at the current cursor position in the editor.
 */
export async function rightClickAtCursor(page: Page) {
  // The active line in CM6 has .cm-activeLine
  const activeLine = page.locator(".cm-activeLine").first();
  await activeLine.click({ button: "right" });
  await page.waitForSelector(".menu", { timeout: 3000 });
}
```

### 6.3.3 DOM Selectors

```typescript
// tests/e2e/helpers/selectors.ts
export const SEL = {
  // Obsidian core
  workspace: ".workspace",
  editor: ".cm-editor",
  activeLine: ".cm-activeLine",
  contextMenu: ".menu",
  contextMenuItem: ".menu-item",
  quickSwitcher: ".prompt-input",
  notice: ".notice",
  sidebarRight: ".mod-right-split",

  // Our plugin
  connectionsView: ".scbe-results",
  resultItem: ".scbe-result-item",
  resultTitle: ".scbe-result-title",
  resultScore: ".scbe-score",
  resultSnippet: ".scbe-snippet",
  toggleBtn: ".scbe-toggle",
  copyBtn: ".scbe-copy",
  emptyState: ".scbe-empty-state",
  header: ".scbe-header",
  sourceKey: ".scbe-source-key",
} as const;
```

### 6.3.4 Playwright Config

```typescript
// tests/playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120000, // Obsidian + SC startup can be slow
  retries: 1,
  workers: 1, // Must be serial — single Obsidian instance
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  // Global setup/teardown could build the plugin before tests
  globalSetup: "./e2e/global-setup.ts",
});
```

```typescript
// tests/e2e/global-setup.ts
import { execSync } from "child_process";
import path from "path";

export default async function globalSetup() {
  // Build the plugin before running E2E tests
  const projectRoot = path.resolve(__dirname, "../..");
  execSync("bun run build", { cwd: projectRoot, stdio: "inherit" });
}
```

### 6.3.5 Test Vault Fixture

The test vault is a minimal vault with predictable content so assertions are deterministic.

```
tests/e2e/fixtures/test-vault/
├── .obsidian/
│   ├── app.json                    # Obsidian settings (disable auto-update prompts)
│   ├── community-plugins.json      # ["smart-connections", "sc-block-explorer"]
│   └── plugins/
│       └── smart-connections/      # Full SC plugin release (main.js, manifest.json)
├── .smart-env/
│   ├── settings.json               # SC config (local model, no API keys)
│   ├── smart_sources.ajson         # Pre-computed embeddings for test notes
│   └── smart_blocks.ajson          # Pre-computed block embeddings
├── Note Alpha.md                   # ~5 headings, topic: machine learning
├── Note Beta.md                    # ~3 headings, topic: machine learning (high similarity to Alpha)
├── Note Gamma.md                   # ~3 headings, topic: cooking (low similarity to Alpha)
├── Note Delta.md                   # ~2 headings, topic: ML deployment (medium similarity)
└── No Headings.md                  # Flat note, no headings (edge case)
```

**Preparing the fixture:**

1. Create the test notes manually with controlled content
2. Install SC in a real Obsidian vault with these notes
3. Let SC index everything with the default local model
4. Copy the resulting `.smart-env/` directory into the fixture
5. Check this into the repo (the AJSON files are small for 5 notes)

This only needs to be done once. If you change test notes, re-index and re-copy.

### 6.3.6 E2E Test Specs

```typescript
// tests/e2e/context-menu.spec.ts
import { test, expect } from "@playwright/test";
import {
  launchObsidian,
  closeObsidian,
  ObsidianTestContext,
} from "./helpers/obsidian-app";
import {
  waitForObsidianReady,
  waitForSCReady,
  waitForPluginReady,
  openNote,
  setCursorLine,
  rightClickAtCursor,
} from "./helpers/wait-helpers";
import { SEL } from "./helpers/selectors";
import path from "path";

const PLUGIN_DIST = path.resolve(__dirname, "../../dist");

let ctx: ObsidianTestContext;

test.beforeAll(async () => {
  ctx = await launchObsidian(PLUGIN_DIST);
  await waitForObsidianReady(ctx.page);
  await waitForSCReady(ctx.page);
  await waitForPluginReady(ctx.page);
});

test.afterAll(async () => {
  await closeObsidian(ctx);
});

test.describe("Context Menu", () => {
  test('shows "See relevant connections" in editor context menu', async () => {
    const { page } = ctx;
    await openNote(page, "Note Alpha");
    await setCursorLine(page, 5);
    await rightClickAtCursor(page);

    const menuItems = page.locator(SEL.contextMenuItem);
    const texts = await menuItems.allTextContents();
    expect(texts).toContain("See relevant connections");
  });

  test("does not show menu item if SC is not installed", async () => {
    // This test would need a separate vault without SC
    // Covered by unit tests instead — skip in E2E
    test.skip();
  });

  test("clicking menu item opens sidebar with results", async () => {
    const { page } = ctx;
    await openNote(page, "Note Alpha");
    await setCursorLine(page, 5);
    await rightClickAtCursor(page);

    // Click the menu item
    const menuItem = page.locator(SEL.contextMenuItem, {
      hasText: "See relevant connections",
    });
    await menuItem.click();

    // Sidebar should appear with results
    await page.waitForSelector(SEL.connectionsView, { timeout: 10000 });
    const results = page.locator(SEL.resultItem);
    const count = await results.count();
    expect(count).toBeGreaterThan(0);
  });
});
```

```typescript
// tests/e2e/sidebar-view.spec.ts
import { test, expect } from "@playwright/test";
// ... same imports and setup as above

test.describe("Sidebar View", () => {
  test.beforeEach(async () => {
    const { page } = ctx;
    await openNote(page, "Note Alpha");
    await setCursorLine(page, 5);
    await rightClickAtCursor(page);
    await page
      .locator(SEL.contextMenuItem, {
        hasText: "See relevant connections",
      })
      .click();
    await page.waitForSelector(SEL.connectionsView, { timeout: 10000 });
  });

  test("displays source block info in header", async () => {
    const { page } = ctx;
    const sourceKey = page.locator(SEL.sourceKey);
    await expect(sourceKey).toContainText("Note Alpha");
  });

  test("results are sorted by score descending", async () => {
    const { page } = ctx;
    const scores = page.locator(SEL.resultScore);
    const texts = await scores.allTextContents();
    const values = texts.map((t) => parseFloat(t.replace("%", "")));

    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
    }
  });

  test("Note Beta (same topic) ranks higher than Note Gamma (different topic)", async () => {
    const { page } = ctx;
    const titles = page.locator(SEL.resultTitle);
    const allTitles = await titles.allTextContents();

    const betaIndex = allTitles.findIndex((t) => t.includes("Note Beta"));
    const gammaIndex = allTitles.findIndex((t) => t.includes("Note Gamma"));

    // Beta (ML) should be more relevant to Alpha (ML) than Gamma (cooking)
    if (betaIndex !== -1 && gammaIndex !== -1) {
      expect(betaIndex).toBeLessThan(gammaIndex);
    }
  });

  test("each result shows a snippet preview", async () => {
    const { page } = ctx;
    const snippets = page.locator(SEL.resultSnippet);
    const count = await snippets.count();
    expect(count).toBeGreaterThan(0);

    const firstSnippet = await snippets.first().textContent();
    expect(firstSnippet?.length).toBeGreaterThan(10);
  });

  test("toggle button switches between blocks and sources", async () => {
    const { page } = ctx;
    const toggleBtn = page.locator(SEL.toggleBtn);

    // Initial state: blocks
    await expect(toggleBtn).toContainText("blocks");

    // Click toggle
    await toggleBtn.click();
    await page.waitForTimeout(1000); // Re-query

    await expect(toggleBtn).toContainText("files");
    // Results should have changed (file-level keys, no # fragment)
    const titles = page.locator(SEL.resultTitle);
    const firstTitle = await titles.first().textContent();
    expect(firstTitle).not.toContain("#");
  });
});
```

```typescript
// tests/e2e/navigation.spec.ts
test.describe("Navigation", () => {
  test("clicking a result opens that note", async () => {
    const { page } = ctx;
    // Trigger connections for Note Alpha
    await openNote(page, "Note Alpha");
    await setCursorLine(page, 5);
    await rightClickAtCursor(page);
    await page
      .locator(SEL.contextMenuItem, {
        hasText: "See relevant connections",
      })
      .click();
    await page.waitForSelector(SEL.connectionsView, { timeout: 10000 });

    // Click first result
    const firstResult = page.locator(SEL.resultTitle).first();
    const targetText = await firstResult.textContent();
    await firstResult.click();

    // Verify the editor now shows a different file
    await page.waitForTimeout(1000);
    // Check the active file changed — inspect via workspace state
    const activeFile = await page.evaluate(() => {
      return (window as any).app?.workspace?.getActiveFile()?.basename;
    });
    expect(activeFile).not.toBe("Note Alpha");
  });
});
```

```typescript
// tests/e2e/copy-list.spec.ts
test.describe("Copy List", () => {
  test("copies markdown-formatted connection list to clipboard", async () => {
    const { page } = ctx;
    await openNote(page, "Note Alpha");
    await setCursorLine(page, 5);
    await rightClickAtCursor(page);
    await page
      .locator(SEL.contextMenuItem, {
        hasText: "See relevant connections",
      })
      .click();
    await page.waitForSelector(SEL.connectionsView, { timeout: 10000 });

    // Click copy button
    const copyBtn = page.locator(SEL.copyBtn);
    await copyBtn.click();

    // Read clipboard via Electron's clipboard API
    const clipboardText = await page.evaluate(async () => {
      const { clipboard } = require("electron");
      return clipboard.readText();
    });

    expect(clipboardText).toContain("## Connections for");
    expect(clipboardText).toContain("[[");
    expect(clipboardText).toContain("%");

    // Verify a notice appeared
    const notice = page.locator(SEL.notice);
    await expect(notice).toContainText("Copied");
  });
});
```

## 6.4 Running Tests

```bash
# Unit tests (fast, no Obsidian needed — AI agent can run these)
bunx vitest run tests/unit/

# E2E tests (requires Obsidian installed on the machine)
# Set OBSIDIAN_PATH if non-standard location
export OBSIDIAN_PATH="/Applications/Obsidian.app/Contents/MacOS/Obsidian"
bunx playwright test --config tests/playwright.config.ts

# E2E with debug mode (headed, slow motion for debugging)
bunx playwright test --headed --config tests/playwright.config.ts

# Generate HTML report after test run
bunx playwright show-report
```

## 6.5 CI / Agent Automation Considerations

| Concern                                                | Solution                                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Obsidian binary not on CI                              | Use a self-hosted runner (your dev machine) or a macOS/Linux runner with Obsidian pre-installed            |
| Obsidian license / login prompts                       | Pre-configure `.obsidian/` in the fixture vault to skip onboarding (set `"showReleaseNotes": false`, etc.) |
| SC indexing takes time                                 | Ship pre-indexed `.smart-env/` in the fixture vault — SC skips re-indexing if AJSON timestamps are fresh   |
| Flaky selectors (Obsidian DOM changes across versions) | Pin Obsidian version in fixture; centralize selectors in `selectors.ts`                                    |
| Test isolation                                         | Copy fixture vault to temp dir per run; never mutate the original                                          |
| Clipboard access in headless                           | Electron's `clipboard` module works headless (no system clipboard needed)                                  |
| Parallel execution                                     | Workers must be 1 — Obsidian manages a single vault lock; concurrent instances will conflict               |
| Screenshot/video on failure                            | Playwright captures these automatically with `retain-on-failure` config                                    |

## 6.6 What an AI Agent Can Run Autonomously

| Test Layer                | Agent-Runnable?                   | Notes                                                                         |
| ------------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| Unit tests (Vitest)       | **Yes, fully**                    | No external dependencies, mocked data                                         |
| E2E tests (Playwright)    | **Yes, if Obsidian is installed** | Agent runs `bunx playwright test`, reads results, iterates on failures        |
| E2E test authoring        | **Yes**                           | Agent writes specs, runs them, adjusts selectors based on failure screenshots |
| Fixture vault creation    | **Partially**                     | Agent can create notes; human must run SC once to generate initial embeddings |
| Fixture vault re-indexing | **No**                            | Requires Obsidian + SC running interactively to regenerate AJSON              |
