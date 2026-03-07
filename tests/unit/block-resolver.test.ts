import { describe, it, expect } from "vitest";
import { BlockResolver } from "../../src/resolvers/block-resolver";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockBlocks = {
  items: {
    "note.md#Introduction": {
      key: "note.md#Introduction",
      data: { lines: [0, 15] },
      vec: [0.1, 0.2, 0.3],
      content: "This is the introduction...",
    },
    "note.md#Methods": {
      key: "note.md#Methods",
      data: { lines: [16, 40] },
      vec: [0.4, 0.5, 0.6],
      content: "We used the following methods...",
    },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEditor(line: number): any {
  return { getCursor: () => ({ line, ch: 0 }) };
}

function makeFile(path: string): any {
  return { path };
}

function makeBridgeWithBlocks(blocks: any, smartSources?: any): any {
  return {
    smartBlocks: blocks,
    smartSources: smartSources ?? null,
  };
}

// ---------------------------------------------------------------------------
// Tests: cursor resolves to correct block
// ---------------------------------------------------------------------------

describe("BlockResolver.resolve() — correct block for cursor position", () => {
  it("resolves 'Introduction' block when cursor is on line 10 (within [0, 15])", () => {
    const bridge = makeBridgeWithBlocks(mockBlocks);
    const resolver = new BlockResolver(bridge);

    const result = resolver.resolve(makeEditor(10), makeFile("note.md"));

    expect(result).not.toBeNull();
    expect(result!.key).toBe("note.md#Introduction");
    expect(result!.lineStart).toBe(0);
    expect(result!.lineEnd).toBe(15);
  });

  it("resolves 'Methods' block when cursor is on line 20 (within [16, 40])", () => {
    const bridge = makeBridgeWithBlocks(mockBlocks);
    const resolver = new BlockResolver(bridge);

    const result = resolver.resolve(makeEditor(20), makeFile("note.md"));

    expect(result).not.toBeNull();
    expect(result!.key).toBe("note.md#Methods");
    expect(result!.lineStart).toBe(16);
    expect(result!.lineEnd).toBe(40);
  });

  it("includes the vec and content in the resolved block", () => {
    const bridge = makeBridgeWithBlocks(mockBlocks);
    const resolver = new BlockResolver(bridge);

    const result = resolver.resolve(makeEditor(0), makeFile("note.md"));

    expect(result!.vec).toEqual([0.1, 0.2, 0.3]);
    expect(result!.content).toBe("This is the introduction...");
  });
});

// ---------------------------------------------------------------------------
// Tests: returns null cases
// ---------------------------------------------------------------------------

describe("BlockResolver.resolve() — returns null", () => {
  it("returns null when cursor is outside all known blocks (line 999)", () => {
    const bridge = makeBridgeWithBlocks(mockBlocks);
    const resolver = new BlockResolver(bridge);

    const result = resolver.resolve(makeEditor(999), makeFile("note.md"));

    expect(result).toBeNull();
  });

  it("returns null when file has no blocks in the DB (unknown.md)", () => {
    const bridge = makeBridgeWithBlocks(mockBlocks);
    const resolver = new BlockResolver(bridge);

    const result = resolver.resolve(makeEditor(5), makeFile("unknown.md"));

    expect(result).toBeNull();
  });

  it("returns null when bridge has no smartBlocks", () => {
    const bridge = makeBridgeWithBlocks(null);
    const resolver = new BlockResolver(bridge);

    const result = resolver.resolve(makeEditor(10), makeFile("note.md"));

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: Option A (source.blocks) vs Option B (smartBlocks.items)
// ---------------------------------------------------------------------------

describe("BlockResolver.resolve() — source strategy", () => {
  it("uses Option A (source.blocks) when available", () => {
    const sourceBlock = {
      key: "note.md#SourceBlock",
      data: { lines: [0, 10] },
      vec: [0.9, 0.8, 0.7],
      content: "From source.blocks",
    };

    const smartSources = {
      get: (path: string) => {
        if (path === "note.md") {
          return { blocks: { "note.md#SourceBlock": sourceBlock } };
        }
        return null;
      },
    };

    const bridge = makeBridgeWithBlocks(mockBlocks, smartSources);
    const resolver = new BlockResolver(bridge);

    const result = resolver.resolve(makeEditor(5), makeFile("note.md"));

    expect(result).not.toBeNull();
    expect(result!.key).toBe("note.md#SourceBlock");
    expect(result!.content).toBe("From source.blocks");
  });

  it("falls back to Option B (smartBlocks.items) when source.blocks is unavailable", () => {
    // smartSources.get returns an object without blocks
    const smartSources = {
      get: (_path: string) => ({ blocks: null }),
    };

    const bridge = makeBridgeWithBlocks(mockBlocks, smartSources);
    const resolver = new BlockResolver(bridge);

    const result = resolver.resolve(makeEditor(10), makeFile("note.md"));

    // Should resolve using smartBlocks.items (Option B)
    expect(result).not.toBeNull();
    expect(result!.key).toBe("note.md#Introduction");
  });

  it("falls back to Option B when smartSources.get returns null", () => {
    const smartSources = {
      get: (_path: string) => null,
    };

    const bridge = makeBridgeWithBlocks(mockBlocks, smartSources);
    const resolver = new BlockResolver(bridge);

    const result = resolver.resolve(makeEditor(20), makeFile("note.md"));

    expect(result).not.toBeNull();
    expect(result!.key).toBe("note.md#Methods");
  });
});
