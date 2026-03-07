---
title: Risks & Mitigations
category: PRD
status: draft
created: 2026-03-07
---

| Risk                                                 | Impact                    | Mitigation                                                                                                    |
| ---------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| SC's internal API changes across versions            | Bridge breaks silently    | Version-check SC on init; log warnings for unexpected shapes; wrap in try/catch                               |
| `nearest()` is slow on large vaults (50k+ blocks)    | UI freezes on right-click | Run in `requestIdleCallback` or Web Worker; show loading spinner                                              |
| Block line-range mapping is inaccurate after editing | Wrong block resolved      | Re-resolve after each edit; fall back to selected text embedding                                              |
| SC not fully loaded when plugin inits                | Bridge returns null       | Retry with exponential backoff on `workspace.onLayoutReady`                                                   |
| Embedding model not loaded (Ollama offline)          | `embedText()` fails       | Catch error; show notice "Embedding model unavailable"                                                        |
| Obsidian DOM structure changes across versions       | E2E selectors break       | Centralize in `selectors.ts`; pin Obsidian version in fixture; use Playwright screenshots on failure to debug |
| Playwright Electron launch flaky on different OS     | Tests don't run on CI     | Default to local self-hosted runner; document `OBSIDIAN_PATH` setup per platform                              |
| Obsidian vault lock prevents parallel test runs      | Workers conflict          | Force `workers: 1` in Playwright config; copy fixture to temp dir per run                                     |
