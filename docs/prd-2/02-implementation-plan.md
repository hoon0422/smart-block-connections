---
title: "PRD-2: Implementation Plan"
category: PRD
status: draft
created: 2026-03-07
---

## Changes Required

### Phase 1: Core Logic Change (`src/main.ts`)

Modify `showConnectionsForCursor()` to prioritize selection over block resolution:

```
Current priority: Block vec → Selection embed (fallback)
New priority:     Selection embed → Block vec (fallback) → Error
```

**Concrete steps:**

1. Check `editor.getSelection()` first
2. If selection exists → embed it via `bridge.embedText(selection)` → search
3. If no selection → fall back to current block-based logic (`resolver.resolve()`)
4. Show the source label as the selection text (truncated) instead of the block key

### Phase 2: View Updates (`src/views/connections-view.ts`)

1. Update the header to distinguish between selection-based and block-based results
   - Selection: show truncated selection text (e.g., `"the quick brown fox..."`)
   - Block: show block key (current behavior)
2. `ResolvedBlock` already supports `content` field — use it for display

### Phase 3: Type Adjustments (`src/types.ts`)

1. Add an optional `source` field to `ResolvedBlock` to indicate origin:
   - `"selection"` — embedded from user selection
   - `"block"` — resolved from pre-computed block vec

### Phase 4: Tests

1. **Unit tests** — update `block-resolver` tests, add `main.ts` logic tests for selection priority
2. **E2E tests** — add a test that selects text, triggers the command, and verifies results appear

---

## Files to Modify

| File | Change |
|---|---|
| `src/main.ts` | Reorder logic in `showConnectionsForCursor()` |
| `src/types.ts` | Add `source?: "selection" \| "block"` to `ResolvedBlock` |
| `src/views/connections-view.ts` | Update header display for selection-based results |
| `tests/unit/main.test.ts` | Update/add tests for new priority order |
| `tests/e2e/` | Add selection-based search E2E test |

## Scope

- **No new dependencies**
- **No API changes** to `SCBridgeService`
- **Backward compatible** — block-based search still works when nothing is selected
- **Estimated size:** ~50 lines changed across 3 source files + tests

## Risks

| Risk | Mitigation |
|---|---|
| Embedding latency on large selections | SC's embed model handles this in <100ms for typical selections. Could add a loading indicator if needed. |
| Empty or whitespace-only selections | Check `selection.trim()` before embedding; fall back to block logic |
| Very long selections exceeding model token limit | Truncate to a reasonable length (e.g., 1000 chars) before embedding |
