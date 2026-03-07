# Smart Connections Block Explorer

## Project Overview

A personal Obsidian plugin that enables users to right-click any block (heading, paragraph, list) in the editor to instantly see semantically related blocks or files from their vault. This functionality is powered by the **Smart Connections** embedding database.

### Core Features

- **Context Menu Integration:** "See relevant connections" option on block right-click.
- **Sidebar Results:** A ranked list of results (blocks or files) with titles, scores, and preview snippets.
- **Navigation & Preview:** Navigate to results, hover-preview with Cmd/Ctrl, or copy the entire results list as Markdown.

### Main Technologies

- **Language:** TypeScript
- **Runtime Environment:** Node.js 18+ / Bun
- **Main APIs:** Obsidian v1.1.0+, Smart Connections Plugin
- **Build Tool:** esbuild
- **Testing Tools:** Vitest (Unit), Playwright (E2E via Electron)

---

## Building and Running

### Commands

- **Install Dependencies:** `bun install`
- **Build Plugin:** `bun run build`
- **Unit Tests:** `bunx vitest run`
- **E2E Tests:** `bunx playwright test --config tests/playwright.config.ts`

### Initial Setup (TODO)

- Ensure the **Smart Connections** plugin is installed and fully indexed in your test vault.
- Configure `OBSIDIAN_PATH` environment variable for E2E tests if Obsidian is in a non-standard location.

---

## Architecture

The plugin follows a modular structure:

- **SCBridgeService:** Singleton that manages access to the Smart Connections plugin's environment (`smart_env`, `smart_blocks`, `smart_sources`).
- **BlockResolver:** Maps the current editor cursor position to a `SmartBlock` entity.
- **ConnectionsView:** A custom Obsidian `ItemView` that renders the connection results in a sidebar leaf.
- **main.ts:** Plugin entry point responsible for lifecycle management and UI registration.

---

## Development Conventions

### Code Structure

- `src/services/`: Core logic for external plugin bridges.
- `src/resolvers/`: Logic for mapping editor state to database entities.
- `src/views/`: UI components (ItemViews).
- `tests/unit/`: Pure logic tests using Vitest (no Obsidian runtime required).
- `tests/e2e/`: Full integration tests using Playwright to drive the Obsidian Electron application.

### Key Practices

- **Mocking for Unit Tests:** Mock Obsidian and Smart Connections objects in `vitest`.
- **E2E Strategy:** Utilize a pre-indexed fixture vault with known content to ensure deterministic testing.
- **Bridge Init:** Access Smart Connections asynchronously during plugin load via `this.app.plugins.plugins["smart-connections"]` after the layout is ready.
