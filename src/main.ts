import {
  Plugin,
  PluginSettingTab,
  App,
  Setting,
  Notice,
  MarkdownView,
  Editor,
  WorkspaceLeaf,
} from "obsidian";
import type { SCBESettings, ResolvedBlock } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { SCBridgeService } from "./services/sc-bridge";
import { BlockResolver } from "./resolvers/block-resolver";
import { ConnectionsView, VIEW_TYPE_CONNECTIONS } from "./views/connections-view";

export default class SCBlockExplorer extends Plugin {
  bridge!: SCBridgeService;
  resolver!: BlockResolver;
  settings!: SCBESettings;

  async onload() {
    await this.loadSettings();

    this.bridge = new SCBridgeService(this.app);
    this.resolver = new BlockResolver(this.bridge);

    // Register the sidebar view type
    this.registerView(
      VIEW_TYPE_CONNECTIONS,
      (leaf) => new ConnectionsView(leaf, this)
    );

    // Hook into editor context menu
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        if (!this.bridge.isReady) return;

        menu.addItem((item) => {
          item
            .setTitle("See relevant connections")
            .setIcon("link")
            .onClick(async () => {
              if (view instanceof MarkdownView) {
                await this.showConnectionsForCursor(editor, view);
              }
            });
        });
      })
    );

    // Command palette alternative
    this.addCommand({
      id: "show-block-connections",
      name: "See relevant connections",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        await this.showConnectionsForCursor(editor, view);
      },
    });

    // Settings tab
    this.addSettingTab(new SCBESettingTab(this.app, this));

    // Delay bridge init — SC may not be loaded yet. Retry periodically.
    this.app.workspace.onLayoutReady(() => {
      const tryInit = (attempt: number) => {
        if (this.bridge.init()) return;
        if (attempt < 10) {
          setTimeout(() => tryInit(attempt + 1), 3000);
        } else {
          console.warn("SCBE: Smart Connections not found or not ready after retries");
        }
      };
      setTimeout(() => tryInit(1), 3000);
    });
  }

  async showConnectionsForCursor(editor: Editor, view: MarkdownView) {
    if (!this.bridge.isReady) {
      new Notice("Smart Connections is not ready yet.");
      return;
    }

    const file = view.file;
    if (!file) return;

    let resolved: ResolvedBlock | null = null;

    // Step 1: Selection-first priority
    const selection = editor.getSelection();
    const trimmed = selection ? selection.trim() : "";
    if (trimmed) {
      const toEmbed = trimmed.slice(0, 25000);
      let vec: number[];
      try {
        vec = await this.bridge.embedText(toEmbed);
      } catch (e) {
        new Notice("Embedding model unavailable. Cannot find connections.");
        return;
      }
      resolved = {
        key: `${file.path}#selection`,
        vec,
        path: file.path,
        content: trimmed,
        source: "selection",
      };
    } else {
      // Step 2: Fall back to block at cursor
      const block = this.resolver.resolve(editor, file);
      if (!block || !block.vec) {
        new Notice("Could not identify a block at cursor position.");
        return;
      }
      block.source = "block";
      resolved = block;
    }

    // Step 3: Find connections
    const connections = await this.bridge.findConnections(resolved.vec!, {
      resultType: this.settings.resultType,
      limit: this.settings.resultLimit,
      minScore: this.settings.minScore,
    });

    // Step 4: Show in sidebar
    await this.activateConnectionsView(resolved, connections);
  }

  async activateConnectionsView(
    block: ResolvedBlock,
    connections: import("./types").ConnectionResult[]
  ) {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CONNECTIONS)[0];
    if (!leaf) {
      const rightLeaf = this.app.workspace.getRightLeaf(false);
      if (!rightLeaf) return;
      leaf = rightLeaf;
      await leaf.setViewState({
        type: VIEW_TYPE_CONNECTIONS,
        active: true,
      });
    }
    this.app.workspace.revealLeaf(leaf);

    const view = leaf.view as ConnectionsView;
    view.setResults(block, connections);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class SCBESettingTab extends PluginSettingTab {
  plugin: SCBlockExplorer;

  constructor(app: App, plugin: SCBlockExplorer) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Result type")
      .setDesc("Show related blocks or entire files")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("blocks", "Blocks")
          .addOption("sources", "Files")
          .setValue(this.plugin.settings.resultType)
          .onChange(async (value) => {
            this.plugin.settings.resultType = value as "blocks" | "sources";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Max results")
      .setDesc("Maximum number of connections to show (5–50)")
      .addSlider((slider) =>
        slider
          .setLimits(5, 50, 1)
          .setValue(this.plugin.settings.resultLimit)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.resultLimit = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Minimum score")
      .setDesc("Filter out connections below this similarity threshold (0.0–1.0)")
      .addSlider((slider) =>
        slider
          .setLimits(0, 100, 1)
          .setValue(this.plugin.settings.minScore * 100)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.minScore = value / 100;
            await this.plugin.saveSettings();
          })
      );
  }
}
