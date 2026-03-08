import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const notices: string[] = [];
(global as any).Notice = class {
  constructor(msg: string) {
    notices.push(msg);
  }
};

function makeEditor(selection: string): any {
  return {
    getSelection: () => selection,
    getCursor: () => ({ line: 5, ch: 0 }),
  };
}

function makeView(filePath: string): any {
  return { file: { path: filePath } };
}

function makeBridge(opts: {
  embedResult?: number[];
  embedError?: Error;
  isReady?: boolean;
}): any {
  return {
    isReady: opts.isReady ?? true,
    embedText: opts.embedError
      ? async () => {
          throw opts.embedError;
        }
      : async () => opts.embedResult ?? [0.1, 0.2, 0.3],
    findConnections: async () => [],
  };
}

function makeResolver(result: any): any {
  return { resolve: () => result };
}

// ---------------------------------------------------------------------------
// Logic under test — mirrors showConnectionsForCursor() decision logic
// ---------------------------------------------------------------------------

async function resolveInput(
  editor: { getSelection: () => string },
  file: { path: string },
  bridge: { embedText: (t: string) => Promise<number[]> },
  resolver: { resolve: (e: any, f: any) => any }
): Promise<{ resolved: any; error?: string }> {
  const selection = editor.getSelection();
  const trimmed = selection ? selection.trim() : "";

  if (trimmed) {
    const toEmbed = trimmed.slice(0, 25000);
    try {
      const vec = await bridge.embedText(toEmbed);
      return {
        resolved: {
          key: `${file.path}#selection`,
          vec,
          path: file.path,
          content: trimmed,
          source: "selection",
        },
      };
    } catch {
      return {
        resolved: null,
        error: "Embedding model unavailable. Cannot find connections.",
      };
    }
  }

  const block = resolver.resolve(editor, file);
  if (!block || !block.vec) {
    return {
      resolved: null,
      error: "Could not identify a block at cursor position.",
    };
  }
  block.source = "block";
  return { resolved: block };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("showConnectionsForCursor() — selection-first priority logic", () => {
  it("uses selection when text is selected, source is 'selection'", async () => {
    const editor = makeEditor("hello world");
    const file = makeView("notes/test.md").file;
    const bridge = makeBridge({ embedResult: [0.1, 0.2, 0.3] });
    const resolver = makeResolver(null);

    const { resolved, error } = await resolveInput(editor, file, bridge, resolver);

    expect(error).toBeUndefined();
    expect(resolved).not.toBeNull();
    expect(resolved.source).toBe("selection");
    expect(resolved.key).toBe("notes/test.md#selection");
    expect(resolved.content).toBe("hello world");
    expect(resolved.vec).toEqual([0.1, 0.2, 0.3]);
  });

  it("falls back to block resolver when no selection is present", async () => {
    const editor = makeEditor("");
    const file = makeView("notes/test.md").file;
    const bridge = makeBridge({});
    const block = {
      key: "notes/test.md#Intro",
      vec: [0.4, 0.5, 0.6],
      path: "notes/test.md",
      content: "Introduction text",
    };
    const resolver = makeResolver(block);

    const { resolved, error } = await resolveInput(editor, file, bridge, resolver);

    expect(error).toBeUndefined();
    expect(resolved).not.toBeNull();
    expect(resolved.source).toBe("block");
    expect(resolved.key).toBe("notes/test.md#Intro");
  });

  it("treats whitespace-only selection as empty and falls back to block resolver", async () => {
    const editor = makeEditor("   \n\t  ");
    const file = makeView("notes/test.md").file;
    const bridge = makeBridge({});
    const block = {
      key: "notes/test.md#Methods",
      vec: [0.7, 0.8, 0.9],
      path: "notes/test.md",
      content: "Methods text",
    };
    const resolver = makeResolver(block);

    const { resolved, error } = await resolveInput(editor, file, bridge, resolver);

    expect(error).toBeUndefined();
    expect(resolved).not.toBeNull();
    expect(resolved.source).toBe("block");
    expect(resolved.key).toBe("notes/test.md#Methods");
  });

  it("truncates selection longer than 25000 chars before embedding", async () => {
    const longSelection = "a".repeat(30000);
    let capturedText = "";
    const editor = makeEditor(longSelection);
    const file = makeView("notes/test.md").file;
    const bridge = {
      embedText: async (t: string) => {
        capturedText = t;
        return [0.1, 0.2, 0.3];
      },
      findConnections: async () => [],
      isReady: true,
    };
    const resolver = makeResolver(null);

    const { resolved } = await resolveInput(editor, file, bridge, resolver);

    expect(capturedText.length).toBe(25000);
    expect(resolved).not.toBeNull();
    expect(resolved.source).toBe("selection");
    expect(resolved.content.length).toBe(30000); // content stores the full trimmed text
  });

  it("returns error message when embedText throws", async () => {
    const editor = makeEditor("some selected text");
    const file = makeView("notes/test.md").file;
    const bridge = makeBridge({ embedError: new Error("model unavailable") });
    const resolver = makeResolver(null);

    const { resolved, error } = await resolveInput(editor, file, bridge, resolver);

    expect(resolved).toBeNull();
    expect(error).toBe("Embedding model unavailable. Cannot find connections.");
  });

  it("returns error message when no selection and no block found at cursor", async () => {
    const editor = makeEditor("");
    const file = makeView("notes/test.md").file;
    const bridge = makeBridge({});
    const resolver = makeResolver(null); // resolver returns null

    const { resolved, error } = await resolveInput(editor, file, bridge, resolver);

    expect(resolved).toBeNull();
    expect(error).toBe("Could not identify a block at cursor position.");
  });
});
