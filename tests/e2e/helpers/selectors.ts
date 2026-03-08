export const SEL = {
  // Obsidian core
  workspace: ".workspace",
  editor: ".cm-editor",
  activeLine: ".cm-activeLine",
  contextMenu: ".menu",
  contextMenuItem: ".menu-item",
  quickSwitcher: ".prompt-input",
  notice: ".notice",
  sidebarRight: ".mod-right-split",

  // Our plugin
  connectionsView: ".scbe-results",
  resultItem: ".scbe-result-item",
  resultTitle: ".scbe-result-title",
  resultScore: ".scbe-score",
  resultSnippet: ".scbe-snippet",
  toggleBtn: ".scbe-toggle",
  copyBtn: ".scbe-copy",
  insertBtn: ".scbe-insert",
  insertTextBtn: ".scbe-insert-text",
  emptyState: ".scbe-empty-state",
  header: ".scbe-header",
  sourceKey: ".scbe-source-key",
} as const;
