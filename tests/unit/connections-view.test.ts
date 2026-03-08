import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks for Obsidian ---
const mockNotice = vi.fn();
vi.mock("obsidian", () => ({
  ItemView: class {
    app: any;
    contentEl: any;
    leaf: any;
    constructor(leaf: any) {
      this.leaf = leaf;
      this.app = leaf.app;
      this.contentEl = createMockEl();
    }
    getViewType() { return ""; }
    getDisplayText() { return ""; }
    getIcon() { return ""; }
    onOpen() {}
  },
  WorkspaceLeaf: class {},
  Notice: class { constructor(msg: string) { mockNotice(msg); } },
  Modal: class {
    app: any;
    contentEl: any;
    constructor(app: any) { this.app = app; this.contentEl = createMockEl(); }
    open() {}
    close() {}
  },
  Setting: class {
    constructor() {}
    setName() { return this; }
    addText(cb: any) { cb({ setPlaceholder: () => ({ onChange: () => ({}), inputEl: { addEventListener: () => {}, focus: () => {} } }), onChange: () => ({}), inputEl: { addEventListener: () => {}, focus: () => {} } }); return this; }
    addButton(cb: any) { cb({ setButtonText: () => ({ setCta: () => ({ onClick: () => ({}) }), onClick: () => ({}) }), setCta: () => ({ onClick: () => ({}) }) }); return this; }
  },
}));

function createMockEl(): any {
  const children: any[] = [];
  const el: any = {
    empty() { children.length = 0; },
    createDiv(opts?: any) {
      const child = createMockEl();
      if (opts?.cls) child.className = opts.cls;
      children.push(child);
      return child;
    },
    createEl(tag: string, opts?: any) {
      const child = createMockEl();
      child.tagName = tag;
      if (opts?.text) child.textContent = opts.text;
      if (opts?.cls) child.className = opts.cls;
      if (opts?.href) child.href = opts.href;
      children.push(child);
      return child;
    },
    addEventListener: vi.fn(),
    children,
    className: "",
    tagName: "",
    textContent: "",
    href: "",
    querySelectorAll(sel: string) {
      // Simple recursive query by className
      const results: any[] = [];
      const cls = sel.replace(".", "");
      function search(node: any) {
        if (node.className === cls) results.push(node);
        for (const c of (node.children || [])) search(c);
      }
      search(el);
      return results;
    },
  };
  return el;
}

// Must import AFTER vi.mock
import { ConnectionsView } from "../../src/views/connections-view";
import type { ConnectionResult, ResolvedBlock } from "../../src/types";

function makeResult(key: string, score: number): ConnectionResult {
  return { key, path: key.split("#")[0], score, content: "some preview" };
}

function makeBlock(key: string): ResolvedBlock {
  return { key, vec: [0.1, 0.2], path: key.split("#")[0] };
}

function createView(activeEditor?: any, markdownLeaves?: any[]) {
  const leaf: any = {
    app: {
      workspace: {
        activeEditor: activeEditor ?? null,
        trigger: vi.fn(),
        getLeavesOfType: vi.fn().mockReturnValue(markdownLeaves ?? []),
      },
    },
  };
  const plugin: any = {
    bridge: { findConnections: vi.fn() },
    settings: { resultType: "blocks", resultLimit: 20, minScore: 0 },
    saveSettings: vi.fn(),
  };
  return new ConnectionsView(leaf, plugin);
}

describe("ConnectionsView - Insert button", () => {
  beforeEach(() => {
    mockNotice.mockClear();
  });

  it("renders Insert and Insert with text buttons for each result", () => {
    const view = createView();
    const block = makeBlock("note.md#Intro");
    const results = [makeResult("note.md#A", 0.9), makeResult("note.md#B", 0.8)];

    view.setResults(block, results);

    const insertBtns = (view as any).contentEl.querySelectorAll("scbe-insert");
    expect(insertBtns.length).toBe(2);
    expect(insertBtns[0].textContent).toBe("Insert");

    const insertTextBtns = (view as any).contentEl.querySelectorAll("scbe-insert-text");
    expect(insertTextBtns.length).toBe(2);
    expect(insertTextBtns[0].textContent).toBe("Insert with text");
  });

  it("inserts wikilink at cursor position when editor is available", () => {
    const mockReplaceRange = vi.fn();
    const mockGetCursor = vi.fn().mockReturnValue({ line: 5, ch: 10 });
    const activeEditor = {
      editor: {
        replaceRange: mockReplaceRange,
        getCursor: mockGetCursor,
      },
      file: { basename: "TestNote" },
    };

    const view = createView(activeEditor);
    // Call insertLink directly (accessing private method for testing)
    (view as any).insertLink("note.md#heading");

    expect(mockGetCursor).toHaveBeenCalledWith("to");
    expect(mockReplaceRange).toHaveBeenCalledWith(
      " [[note.md#heading]]",
      { line: 5, ch: 10 }
    );
    expect(mockNotice).toHaveBeenCalledWith(
      expect.stringContaining("Inserted link to note.md#heading")
    );
  });

  it("shows error notice when no active editor", () => {
    const view = createView(null);
    (view as any).insertLink("note.md#heading");

    expect(mockNotice).toHaveBeenCalledWith("No active editor to insert into.");
  });

  it("shows error notice when activeEditor exists but editor is undefined", () => {
    const activeEditor = { file: { basename: "Test" } }; // no .editor property
    const view = createView(activeEditor);
    (view as any).insertLink("note.md#heading");

    expect(mockNotice).toHaveBeenCalledWith("No active editor to insert into.");
  });

  it("falls back to markdown leaf when activeEditor is null", () => {
    const mockReplaceRange = vi.fn();
    const mockGetCursor = vi.fn().mockReturnValue({ line: 3, ch: 0 });
    const markdownLeaf = {
      view: {
        editor: { replaceRange: mockReplaceRange, getCursor: mockGetCursor },
        file: { basename: "FallbackNote" },
      },
    };

    const view = createView(null, [markdownLeaf]);
    (view as any).insertLink("note.md#heading");

    expect(mockReplaceRange).toHaveBeenCalledWith(
      " [[note.md#heading]]",
      { line: 3, ch: 0 }
    );
    expect(mockNotice).toHaveBeenCalledWith(
      expect.stringContaining("FallbackNote")
    );
  });

  it("handles block keys with # subpaths correctly", () => {
    const mockReplaceRange = vi.fn();
    const mockGetCursor = vi.fn().mockReturnValue({ line: 0, ch: 0 });
    const activeEditor = {
      editor: { replaceRange: mockReplaceRange, getCursor: mockGetCursor },
      file: { basename: "TestNote" },
    };

    const view = createView(activeEditor);
    (view as any).insertLink("file.md#Section > Subsection");

    expect(mockReplaceRange).toHaveBeenCalledWith(
      " [[file.md#Section > Subsection]]",
      { line: 0, ch: 0 }
    );
  });
});
