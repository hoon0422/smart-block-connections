import { ItemView, WorkspaceLeaf, Notice, Modal, Setting } from "obsidian";
import type { Editor } from "obsidian";
import type { ConnectionResult, ResolvedBlock, SCBESettings, FindConnectionsOptions } from "../types";
import { formatResultsAsMarkdown } from "../utils/formatting";

export const VIEW_TYPE_CONNECTIONS = "scbe-connections-view";

/** Strip SC's sub-block index suffix like `#{1}`, `#{2}` from a block key. */
function stripSubBlockSuffix(key: string): string {
  return key.replace(/#\{\d+\}$/, "");
}

// Minimal plugin interface for isolated development
interface SCBlockExplorerPlugin {
  bridge: { findConnections(vec: number[], opts: FindConnectionsOptions): Promise<ConnectionResult[]> };
  settings: SCBESettings;
  saveSettings(): Promise<void>;
}

export class ConnectionsView extends ItemView {
  private plugin: SCBlockExplorerPlugin;
  private currentBlock: ResolvedBlock | null = null;
  private results: ConnectionResult[] = [];

  constructor(leaf: WorkspaceLeaf, plugin: SCBlockExplorerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_CONNECTIONS; }
  getDisplayText(): string { return "Block Connections"; }
  getIcon(): string { return "link"; }

  async onOpen() { this.renderEmpty(); }

  setResults(block: ResolvedBlock, results: ConnectionResult[]) {
    this.currentBlock = block;
    this.results = results;
    this.render();
  }

  private getFilteredResults(): ConnectionResult[] {
    let results = this.results;

    if (this.plugin.settings.excludeSelf && this.currentBlock) {
      const blockPath = this.currentBlock.path;
      results = results.filter((r) => {
        // Exclude the exact same block
        if (r.key === this.currentBlock!.key) return false;
        // Exclude results from the parent file (check both path and key prefix)
        if (r.path === blockPath) return false;
        if (r.key.startsWith(blockPath + "#")) return false;
        return true;
      });
    }

    return results;
  }

  private render() {
    const el = this.contentEl;
    el.empty();

    // --- Header ---
    const header = el.createDiv({ cls: "scbe-header" });
    header.createEl("h4", { text: "Connections for:", cls: "scbe-title" });
    header.createEl("div", {
      text: (() => {
        if (this.currentBlock?.source === "selection") {
          const content = this.currentBlock?.content ?? "";
          return content.length > 80 ? `Selected: ${content.slice(0, 80)}...` : `Selected: ${content}`;
        }
        return this.currentBlock?.key ?? "Unknown block";
      })(),
      cls: "scbe-source-key"
    });

    // --- Controls row ---
    const controls = el.createDiv({ cls: "scbe-controls" });

    // Toggle: blocks vs sources
    const toggleBtn = controls.createEl("button", {
      text: this.plugin.settings.resultType === "blocks" ? "Showing blocks" : "Showing files",
      cls: "scbe-toggle"
    });
    toggleBtn.addEventListener("click", async () => {
      this.plugin.settings.resultType =
        this.plugin.settings.resultType === "blocks" ? "sources" : "blocks";
      await this.plugin.saveSettings();
      if (this.currentBlock?.vec) {
        const newResults = await this.plugin.bridge.findConnections(
          this.currentBlock.vec,
          {
            resultType: this.plugin.settings.resultType,
            limit: this.plugin.settings.resultLimit,
            minScore: this.plugin.settings.minScore,
          }
        );
        this.setResults(this.currentBlock, newResults);
      }
    });

    // Exclude-self toggle
    const excludeBtn = controls.createEl("button", {
      text: this.plugin.settings.excludeSelf ? "Self excluded" : "Self included",
      cls: `scbe-toggle${this.plugin.settings.excludeSelf ? " is-active" : ""}`
    });
    excludeBtn.addEventListener("click", async () => {
      this.plugin.settings.excludeSelf = !this.plugin.settings.excludeSelf;
      await this.plugin.saveSettings();
      this.render();
    });

    // Copy all button
    const copyBtn = controls.createEl("button", { text: "Copy list", cls: "scbe-copy" });
    copyBtn.addEventListener("click", () => this.copyResultsToClipboard());

    // --- Results list ---
    const list = el.createDiv({ cls: "scbe-results" });
    const filtered = this.getFilteredResults();

    if (filtered.length === 0) {
      list.createEl("div", { text: "No connections found.", cls: "scbe-empty" });
      return;
    }

    for (const result of filtered) {
      const item = list.createDiv({ cls: "scbe-result-item" });

      // Score badge
      item.createEl("span", {
        text: `${(result.score * 100).toFixed(1)}%`,
        cls: "scbe-score"
      });

      // Title (clickable → navigate)
      const title = item.createEl("a", {
        text: result.key,
        cls: "scbe-result-title",
        href: "#"
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
          text: result.content.slice(0, 200) + (result.content.length > 200 ? "\u2026" : ""),
          cls: "scbe-snippet"
        });
      }

      // Insert buttons
      const actions = item.createDiv({ cls: "scbe-result-actions" });
      const insertBtn = actions.createEl("button", {
        text: "Insert",
        cls: "scbe-insert"
      });
      insertBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.insertLink(stripSubBlockSuffix(result.key));
      });
      const insertWithTextBtn = actions.createEl("button", {
        text: "Insert with text",
        cls: "scbe-insert-text"
      });
      insertWithTextBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.insertLinkWithText(stripSubBlockSuffix(result.key));
      });
    }
  }

  private getEditor(): { editor: Editor; fileName: string } | null {
    // activeEditor may be null when sidebar has focus, so also check
    // the most recent markdown leaf as a fallback
    let editor = this.app.workspace.activeEditor?.editor;
    let fileName = (this.app.workspace.activeEditor as any)?.file?.basename;

    if (!editor) {
      const leaves = this.app.workspace.getLeavesOfType("markdown");
      for (const leaf of leaves) {
        const view = leaf.view as any;
        if (view?.editor) {
          editor = view.editor;
          fileName = view.file?.basename;
          break;
        }
      }
    }

    if (!editor) return null;
    return { editor, fileName: fileName ?? "current note" };
  }

  private insertLink(key: string) {
    const result = this.getEditor();
    if (!result) {
      new Notice("No active editor to insert into.");
      return;
    }
    const { editor, fileName } = result;
    const pos = editor.getCursor("to");
    editor.replaceRange(` [[${key}]]`, pos);
    new Notice(`Inserted link to ${key} in ${fileName}`);
  }

  private insertLinkWithText(key: string) {
    const result = this.getEditor();
    if (!result) {
      new Notice("No active editor to insert into.");
      return;
    }
    new InsertLinkModal(this.app, key, (displayText) => {
      const { editor, fileName } = result;
      const pos = editor.getCursor("to");
      editor.replaceRange(` [[${key}|${displayText}]]`, pos);
      new Notice(`Inserted link to ${key} in ${fileName}`);
    }).open();
  }

  private navigateToResult(result: ConnectionResult) {
    this.app.workspace.openLinkText(stripSubBlockSuffix(result.key), "", false);
  }

  private copyResultsToClipboard() {
    const filtered = this.getFilteredResults();
    const text = formatResultsAsMarkdown(
      this.currentBlock?.key ?? "Unknown block",
      filtered
    );
    navigator.clipboard.writeText(text);
    new Notice(`Copied ${filtered.length} connections to clipboard`);
  }

  private renderEmpty() {
    this.contentEl.empty();
    this.contentEl.createEl("div", {
      text: 'Right-click a block and select "See relevant connections".',
      cls: "scbe-empty-state"
    });
  }
}

class InsertLinkModal extends Modal {
  private key: string;
  private onSubmit: (displayText: string) => void;

  constructor(app: any, key: string, onSubmit: (displayText: string) => void) {
    super(app);
    this.key = key;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Insert link with display text" });
    contentEl.createEl("p", {
      text: `Link: ${this.key}`,
      cls: "scbe-modal-link"
    });

    let inputValue = "";
    new Setting(contentEl)
      .setName("Display text")
      .addText((text) => {
        text.setPlaceholder("Enter display text...");
        text.onChange((value) => { inputValue = value; });
        // Submit on Enter
        text.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (inputValue.trim()) {
              this.onSubmit(inputValue.trim());
              this.close();
            }
          }
        });
        // Auto-focus the input
        setTimeout(() => text.inputEl.focus(), 50);
      });

    new Setting(contentEl)
      .addButton((btn) => {
        btn.setButtonText("Insert")
          .setCta()
          .onClick(() => {
            if (inputValue.trim()) {
              this.onSubmit(inputValue.trim());
              this.close();
            }
          });
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}
