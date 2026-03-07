---
title: Detailed Implementation Plan
category: PRD
status: draft
created: 2026-03-07
---

## Phase 1: Project Scaffold & SC Bridge

**Goal:** Plugin loads, detects Smart Connections, and gets a reference to the Smart Environment.

### 4.1.1 Scaffold

```
sc-block-explorer/
├── src/
│   ├── main.ts
│   ├── types.ts
│   ├── services/
│   │   └── sc-bridge.ts
│   ├── resolvers/
│   │   └── block-resolver.ts
│   ├── utils/
│   │   └── formatting.ts
│   └── views/
│       └── connections-view.ts
├── tests/
│   ├── unit/
│   │   ├── sc-bridge.test.ts
│   │   ├── block-resolver.test.ts
│   │   └── formatting.test.ts
│   ├── e2e/
│   │   ├── fixtures/
│   │   │   └── test-vault/          # Pre-indexed vault (checked in)
│   │   ├── helpers/
│   │   │   ├── obsidian-app.ts
│   │   │   ├── selectors.ts
│   │   │   └── wait-helpers.ts
│   │   ├── context-menu.spec.ts
│   │   ├── sidebar-view.spec.ts
│   │   ├── navigation.spec.ts
│   │   ├── copy-list.spec.ts
│   │   └── global-setup.ts
│   ├── playwright.config.ts
│   └── vitest.config.ts
├── styles.css
├── manifest.json
├── package.json
├── tsconfig.json
└── esbuild.config.mjs
```

### 4.1.2 SC Bridge Service (`sc-bridge.ts`)

Core logic for accessing the Smart Environment:

```typescript
// Pseudocode — actual property names need verification at runtime
export class SCBridgeService {
  private env: any; // SmartEnv instance

  constructor(private app: App) {}

  /**
   * Attempt to get SC plugin reference.
   * Must be called after SC has fully initialized.
   */
  init(): boolean {
    const scPlugin = this.app.plugins.plugins["smart-connections"];
    if (!scPlugin) return false;

    // SC v4 exposes the environment on the plugin instance
    // Exact property name needs runtime inspection:
    //   scPlugin.env, scPlugin.smart_env, or scPlugin.brain
    this.env = scPlugin.env ?? scPlugin.smart_env;
    return !!this.env;
  }

  get isReady(): boolean {
    return !!this.env?.smart_blocks;
  }

  get smartBlocks(): any {
    return this.env?.smart_blocks;
  }

  get smartSources(): any {
    return this.env?.smart_sources;
  }

  /**
   * Find nearest connections for a given block's embedding vector.
   */
  async findConnections(
    vec: number[],
    opts: { resultType: "blocks" | "sources"; limit: number },
  ): Promise<ConnectionResult[]> {
    const collection =
      opts.resultType === "blocks" ? this.smartBlocks : this.smartSources;

    // SmartEntities.nearest() — brute-force cosine similarity
    const results = collection.nearest(vec, {
      results_count: opts.limit,
    });

    return results.map((r: any) => ({
      key: r.item?.key ?? r.key,
      path: r.item?.path ?? r.path,
      score: r.score ?? r.sim,
      content: r.item?.content?.slice(0, 300) ?? "",
    }));
  }

  /**
   * Embed arbitrary text (for when block isn't in the DB yet).
   * Uses SC's loaded embedding model.
   */
  async embedText(text: string): Promise<number[]> {
    const model = this.env?.smart_embed_model;
    if (!model) throw new Error("Embed model not loaded");
    const result = await model.embed({ input: [text] });
    return result[0]?.vec ?? result.data?.[0]?.vec;
  }
}
```

**Discovery task:** Before coding, inspect SC's runtime object to confirm exact property names:

```javascript
// Run in Obsidian dev console (Ctrl+Shift+I)
const sc = app.plugins.plugins["smart-connections"];
console.log(Object.keys(sc));
console.log(Object.keys(sc.env));
console.log(Object.keys(sc.env.smart_blocks));
console.log(typeof sc.env.smart_blocks.nearest);
// Also check what nearest() returns
```

---

## Phase 2: Block Resolution

**Goal:** Given the user's cursor position, find the corresponding SmartBlock entity (and its embedding vector).

### 4.2.1 Block Resolver (`block-resolver.ts`)

Smart Connections defines blocks by **headings**. A block key typically looks like:
`path/to/note.md#Heading Name` or `path/to/note.md#{line_start}:{line_end}`

```typescript
export class BlockResolver {
  constructor(private bridge: SCBridgeService) {}

  /**
   * Resolve the SmartBlock at the editor's current cursor position.
   *
   * Strategy:
   * 1. Get the active file path
   * 2. Get cursor line number
   * 3. Search smartBlocks for blocks belonging to this file
   * 4. Find the block whose line range contains the cursor
   * 5. Return the block's vec (embedding vector)
   */
  resolve(editor: Editor, file: TFile): ResolvedBlock | null {
    const cursorLine = editor.getCursor().line;
    const filePath = file.path;
    const blocks = this.bridge.smartBlocks;

    // SmartBlocks are keyed by path — iterate to find matching file
    // Block keys follow pattern: "filepath#heading" or "filepath#{start}:{end}"
    const fileBlocks: any[] = [];

    // Option A: If SC exposes a method to get blocks by source
    const source = this.bridge.smartSources?.get(filePath);
    if (source?.blocks) {
      for (const [key, block] of Object.entries(source.blocks)) {
        fileBlocks.push(block);
      }
    }

    // Option B: Filter from full collection (fallback)
    if (fileBlocks.length === 0) {
      for (const [key, block] of Object.entries(blocks.items ?? {})) {
        if (key.startsWith(filePath)) {
          fileBlocks.push(block);
        }
      }
    }

    // Find which block contains the cursor line
    // SmartBlock stores line range in data (e.g., block.data.lines or similar)
    let match = null;
    for (const block of fileBlocks) {
      const lines = block.data?.lines ?? block.lines;
      if (!lines) continue;
      const [start, end] = lines;
      if (cursorLine >= start && cursorLine <= end) {
        match = block;
        break;
      }
    }

    if (!match) return null;

    return {
      key: match.key,
      vec: match.vec, // pre-computed embedding
      path: filePath,
      lineStart: match.data?.lines?.[0],
      lineEnd: match.data?.lines?.[1],
      content: match.content,
    };
  }
}
```

**Fallback:** If the block has no embedding yet (new content), use `bridge.embedText(selectedText)` to generate a vector on the fly.

---

## Phase 3: Context Menu Integration

**Goal:** Add "See relevant connections" to the right-click editor menu.

### 4.3.1 Registration in `main.ts`

```typescript
export default class SCBlockExplorer extends Plugin {
  bridge: SCBridgeService;
  resolver: BlockResolver;
  settings: SCBESettings;

  async onload() {
    await this.loadSettings();

    this.bridge = new SCBridgeService(this.app);
    this.resolver = new BlockResolver(this.bridge);

    // Register the sidebar view type
    this.registerView(
      VIEW_TYPE_CONNECTIONS,
      (leaf) => new ConnectionsView(leaf, this),
    );

    // Hook into editor context menu
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        if (!this.bridge.isReady) return;

        menu.addItem((item) => {
          item
            .setTitle("See relevant connections")
            .setIcon("link")
            .onClick(async () => {
              await this.showConnectionsForCursor(editor, view);
            });
        });
      }),
    );

    // Command palette alternative
    this.addCommand({
      id: "show-block-connections",
      name: "See relevant connections for current block",
      editorCallback: async (editor, view) => {
        await this.showConnectionsForCursor(editor, view);
      },
    });

    // Delay bridge init — SC may not be loaded yet
    this.app.workspace.onLayoutReady(() => {
      // Retry with delay since SC initializes async
      setTimeout(() => {
        if (!this.bridge.init()) {
          console.warn("SCBE: Smart Connections not found or not ready");
        }
      }, 3000);
    });
  }

  async showConnectionsForCursor(editor: Editor, view: MarkdownView) {
    if (!this.bridge.isReady) {
      new Notice("Smart Connections is not ready yet.");
      return;
    }

    const file = view.file;
    if (!file) return;

    // Step 1: Resolve block
    let resolved = this.resolver.resolve(editor, file);

    // Step 2: Fallback to selected text if block not found
    if (!resolved || !resolved.vec) {
      const selection = editor.getSelection();
      if (!selection) {
        new Notice("Could not identify a block at cursor position.");
        return;
      }
      const vec = await this.bridge.embedText(selection);
      resolved = {
        key: `${file.path}#selection`,
        vec,
        path: file.path,
        content: selection,
      };
    }

    // Step 3: Find connections
    const connections = await this.bridge.findConnections(resolved.vec, {
      resultType: this.settings.resultType,
      limit: this.settings.resultLimit,
    });

    // Step 4: Show in sidebar
    await this.activateConnectionsView(resolved, connections);
  }

  async activateConnectionsView(
    block: ResolvedBlock,
    connections: ConnectionResult[],
  ) {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CONNECTIONS)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({
        type: VIEW_TYPE_CONNECTIONS,
        active: true,
      });
    }
    this.app.workspace.revealLeaf(leaf);

    const view = leaf.view as ConnectionsView;
    view.setResults(block, connections);
  }
}
```

---

## Phase 4: Sidebar Results View

**Goal:** Render connection results in a sidebar panel with preview, navigate, and copy functionality.

### 4.4.1 ConnectionsView (`connections-view.ts`)

```typescript
export const VIEW_TYPE_CONNECTIONS = "scbe-connections-view";

export class ConnectionsView extends ItemView {
  private plugin: SCBlockExplorer;
  private currentBlock: ResolvedBlock | null = null;
  private results: ConnectionResult[] = [];
  private containerEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf, plugin: SCBlockExplorer) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_CONNECTIONS;
  }
  getDisplayText(): string {
    return "Block Connections";
  }
  getIcon(): string {
    return "link";
  }

  async onOpen() {
    this.containerEl = this.contentEl;
    this.renderEmpty();
  }

  setResults(block: ResolvedBlock, results: ConnectionResult[]) {
    this.currentBlock = block;
    this.results = results;
    this.render();
  }

  private render() {
    const el = this.containerEl;
    el.empty();

    // --- Header ---
    const header = el.createDiv({ cls: "scbe-header" });

    // Source block info
    header.createEl("h4", {
      text: `Connections for:`,
      cls: "scbe-title",
    });
    header.createEl("div", {
      text: this.currentBlock?.key ?? "Unknown block",
      cls: "scbe-source-key",
    });

    // --- Controls row ---
    const controls = el.createDiv({ cls: "scbe-controls" });

    // Toggle: blocks vs sources
    const toggleBtn = controls.createEl("button", {
      text:
        this.plugin.settings.resultType === "blocks"
          ? "📄 Showing blocks"
          : "📁 Showing files",
      cls: "scbe-toggle",
    });
    toggleBtn.addEventListener("click", async () => {
      this.plugin.settings.resultType =
        this.plugin.settings.resultType === "blocks" ? "sources" : "blocks";
      await this.plugin.saveSettings();
      // Re-query
      if (this.currentBlock?.vec) {
        const newResults = await this.plugin.bridge.findConnections(
          this.currentBlock.vec,
          {
            resultType: this.plugin.settings.resultType,
            limit: this.plugin.settings.resultLimit,
          },
        );
        this.setResults(this.currentBlock, newResults);
      }
    });

    // Copy all button
    const copyBtn = controls.createEl("button", {
      text: "📋 Copy list",
      cls: "scbe-copy",
    });
    copyBtn.addEventListener("click", () => {
      this.copyResultsToClipboard();
    });

    // --- Results list ---
    const list = el.createDiv({ cls: "scbe-results" });

    if (this.results.length === 0) {
      list.createEl("div", {
        text: "No connections found.",
        cls: "scbe-empty",
      });
      return;
    }

    for (const result of this.results) {
      const item = list.createDiv({ cls: "scbe-result-item" });

      // Score badge
      const score = item.createEl("span", {
        text: `${(result.score * 100).toFixed(1)}%`,
        cls: "scbe-score",
      });

      // Title (clickable → navigate)
      const title = item.createEl("a", {
        text: result.key,
        cls: "scbe-result-title",
        href: "#",
      });
      title.addEventListener("click", (e) => {
        e.preventDefault();
        this.navigateToResult(result);
      });

      // Hover preview (Cmd/Ctrl + hover)
      title.addEventListener("mouseover", (e) => {
        if (e.ctrlKey || e.metaKey) {
          this.app.workspace.trigger("hover-link", {
            event: e,
            source: VIEW_TYPE_CONNECTIONS,
            hoverParent: this,
            targetEl: title,
            linktext: result.path,
          });
        }
      });

      // Snippet preview
      if (result.content) {
        item.createEl("div", {
          text: result.content.slice(0, 200) + "…",
          cls: "scbe-snippet",
        });
      }
    }
  }

  private navigateToResult(result: ConnectionResult) {
    // Open the file, optionally scroll to block line
    const [filePath, blockRef] = result.key.split("#");
    this.app.workspace.openLinkText(
      result.key,
      "", // source path (empty = root)
      false, // new leaf
    );
  }

  private copyResultsToClipboard() {
    const lines = this.results.map((r, i) => {
      const score = (r.score * 100).toFixed(1);
      return `${i + 1}. [[${r.key}]] (${score}%)`;
    });

    const header = `## Connections for ${this.currentBlock?.key}\n`;
    const text = header + lines.join("\n");

    navigator.clipboard.writeText(text);
    new Notice(`Copied ${this.results.length} connections to clipboard`);
  }

  private renderEmpty() {
    this.containerEl.empty();
    this.containerEl.createEl("div", {
      text: 'Right-click a block and select "See relevant connections".',
      cls: "scbe-empty-state",
    });
  }
}
```

---

## Phase 5: Settings

**Goal:** Minimal settings for result type, limit, and threshold.

```typescript
// types.ts
export interface SCBESettings {
  resultType: "blocks" | "sources";
  resultLimit: number;
  minScore: number; // cosine similarity threshold (0.0 - 1.0)
}

export const DEFAULT_SETTINGS: SCBESettings = {
  resultType: "blocks",
  resultLimit: 20,
  minScore: 0.0,
};
```

Settings tab registration in `main.ts`:

```typescript
this.addSettingTab(new SCBESettingTab(this.app, this));
```

Three settings controls:

- **Result type**: Dropdown (blocks / sources)
- **Max results**: Slider (5–50)
- **Minimum score**: Slider (0.0–1.0) — filter out low-relevance results
