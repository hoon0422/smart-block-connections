import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type { ConnectionResult, ResolvedBlock, SCBESettings, FindConnectionsOptions } from "../types";
import { formatResultsAsMarkdown } from "../utils/formatting";

export const VIEW_TYPE_CONNECTIONS = "scbe-connections-view";

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

    // Copy all button
    const copyBtn = controls.createEl("button", { text: "Copy list", cls: "scbe-copy" });
    copyBtn.addEventListener("click", () => this.copyResultsToClipboard());

    // --- Results list ---
    const list = el.createDiv({ cls: "scbe-results" });

    if (this.results.length === 0) {
      list.createEl("div", { text: "No connections found.", cls: "scbe-empty" });
      return;
    }

    for (const result of this.results) {
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
    }
  }

  private navigateToResult(result: ConnectionResult) {
    this.app.workspace.openLinkText(result.key, "", false);
  }

  private copyResultsToClipboard() {
    const text = formatResultsAsMarkdown(
      this.currentBlock?.key ?? "Unknown block",
      this.results
    );
    navigator.clipboard.writeText(text);
    new Notice(`Copied ${this.results.length} connections to clipboard`);
  }

  private renderEmpty() {
    this.contentEl.empty();
    this.contentEl.createEl("div", {
      text: 'Right-click a block and select "See relevant connections".',
      cls: "scbe-empty-state"
    });
  }
}
