---
title: "PRD-2: Selection-Based Semantic Search"
category: PRD
status: draft
created: 2026-03-07
---

## Summary

Change the search logic so that when a user selects text and triggers "See relevant connections", the plugin embeds the **selected text itself** (not the enclosing block) and uses that vector to find semantically related blocks or files.

## Current Behavior

1. User selects text, right-clicks, selects "See relevant connections"
2. Plugin resolves the **block** containing the cursor (via `BlockResolver`)
3. Uses the block's **pre-computed embedding vector** to search
4. Falls back to selection-based embedding only if block has no vec

## Desired Behavior

1. User selects text, right-clicks, selects "See relevant connections"
2. Plugin takes the **selected text** directly
3. Embeds the selection on-the-fly via `SCBridgeService.embedText()`
4. Uses the resulting vector to find related blocks or files
5. If no text is selected, falls back to the current block-based logic

## Why

- Users often care about a specific phrase or paragraph, not the entire block
- Selection-based search gives more precise, contextually relevant results
- Enables cross-cutting queries (e.g., select a sentence that spans topics)

## Feasibility

**Confirmed feasible.** All required APIs already exist:

| Capability | API | Status |
|---|---|---|
| Embed arbitrary text | `SCBridgeService.embedText(text)` | Exists (uses `smart_embed_model.embed()`) |
| Nearest-neighbor search from any vector | `SCBridgeService.findConnections(vec, opts)` | Exists (uses `collection.nearest()`) |
| Get editor selection | `editor.getSelection()` | Obsidian built-in |

The current fallback path in `main.ts:90-108` already implements this exact flow — we just need to make it the **primary** path when text is selected.
