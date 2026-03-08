# Smart Block Connections

An Obsidian plugin that lets you right-click any block (heading, paragraph, list) in the editor to instantly see semantically related blocks or files from your vault, powered by the [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) embedding database.

## Features

- **Context menu integration** — "See relevant connections" appears on right-click in the editor
- **Selection-based search** — Select any text to find connections based on that specific selection, not just the enclosing block
- **Command palette** — Also available as "See relevant connections"
- **Sidebar results** — Ranked list with similarity scores and preview snippets
- **Toggle view** — Switch between block-level and file-level results
- **Navigate** — Click any result to open that note
- **Hover preview** — Hold Cmd/Ctrl and hover a result for Obsidian's page preview
- **Copy list** — Copy all connections as markdown (`[[wikilinks]]` with scores)
- **Settings** — Configure result type, max results (5–50), and minimum similarity threshold

## Prerequisites

- **Obsidian** v1.1.0+
- **Smart Connections** plugin installed and fully indexed

## Installation

### Manual install

1. Build the plugin (see [Development](#development)) or download the latest release
2. Copy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` to your vault at:
   ```
   <vault>/.obsidian/plugins/sc-block-explorer/
   ```
3. Enable "Smart Block Connections" in Settings → Community plugins

### Symlink for development

```bash
ln -sf /path/to/smart-block-connections/dist \
  /path/to/vault/.obsidian/plugins/sc-block-explorer
```

## Usage

1. Open any note in the editor
2. **Select text** you want to find connections for, or place your cursor in a block
3. Right-click → **"See relevant connections"** (or use the command palette)
4. The sidebar panel opens with ranked results
5. Click a result to navigate, or use the copy/toggle buttons

**How search works:**
- **With selection** — The selected text is embedded on-the-fly and used to search. This gives precise results based on exactly what you highlighted.
- **Without selection** — Falls back to the block at cursor position, using its pre-computed embedding from Smart Connections.

## Development

```bash
# Install dependencies
bun install

# Build plugin
bun run build

# Run unit tests
bunx vitest run

# Run E2E tests (requires Obsidian installed)
bunx playwright test tests/e2e/context-menu.spec.ts tests/e2e/sidebar-view.spec.ts \
  tests/e2e/navigation.spec.ts tests/e2e/copy-list.spec.ts tests/e2e/smoke.spec.ts \
  tests/e2e/selection-search.spec.ts --config tests/playwright.config.ts
```

### Architecture

```
src/
├── main.ts                  # Plugin entry, lifecycle, context menu, command
├── types.ts                 # Shared types and default settings
├── services/
│   └── sc-bridge.ts         # Bridge to Smart Connections environment
├── resolvers/
│   └── block-resolver.ts    # Maps cursor position → SmartBlock entity
├── utils/
│   └── formatting.ts        # Markdown formatting for copy
└── views/
    └── connections-view.ts  # Sidebar ItemView for results
```

### E2E Testing

E2E tests drive a real Obsidian instance via CDP (Chrome DevTools Protocol) with Playwright. See `docs/prd/06-testing-strategy.md` for details on the approach and known limitations.

## License

MIT
