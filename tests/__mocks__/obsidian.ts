// Minimal stub for the obsidian package used in unit tests.
// Real mocks are provided via vi.mock("obsidian", ...) in individual test files.
export class ItemView {
  app: any;
  contentEl: any;
  leaf: any;
  constructor(leaf: any) {
    this.leaf = leaf;
  }
  getViewType() { return ""; }
  getDisplayText() { return ""; }
  getIcon() { return ""; }
  onOpen() {}
}
export class WorkspaceLeaf {}
export class Notice {
  constructor(public message: string) {}
}
export class Modal {
  app: any;
  contentEl: any;
  constructor(app: any) { this.app = app; }
  open() {}
  close() {}
}
export class Setting {
  constructor(_el?: any) {}
  setName() { return this; }
  addText(_cb: any) { return this; }
  addButton(_cb: any) { return this; }
}
