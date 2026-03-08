import { test, expect } from "@playwright/test";
import {
  launchObsidian,
  closeObsidian,
  ObsidianTestContext,
} from "./helpers/obsidian-app";
import { openNote, setCursorLine, waitForSCBlocks } from "./helpers/wait-helpers";
import { SEL } from "./helpers/selectors";
import { PLUGIN_DIST } from "./helpers/paths";

let ctx: ObsidianTestContext;

test.beforeAll(async () => {
  ctx = await launchObsidian(PLUGIN_DIST);
  const { page } = ctx;

  console.log("[beforeAll] Waiting for workspace...");
  await page.waitForSelector(".workspace", { timeout: 15000 });
  console.log("[beforeAll] Workspace found. Waiting for bridge...");

  const start = Date.now();
  while (Date.now() - start < 30000) {
    const ready = await page.evaluate(() => {
      const plugin = (window as any).app?.plugins?.plugins?.["sc-block-explorer"];
      return plugin?.bridge?.isReady === true;
    });
    if (ready) break;
    await page.waitForTimeout(1000);
  }
  console.log("[beforeAll] Bridge ready. Waiting for SC blocks...");
  await waitForSCBlocks(page);
  console.log("[beforeAll] SC blocks loaded, proceeding");
});

test.afterAll(async () => {
  if (ctx) await closeObsidian(ctx);
});

test.describe("Context Menu", () => {
  test('registers "See relevant connections" in editor-menu event', async () => {
    const { page } = ctx;
    await openNote(page, "Note Alpha");
    await setCursorLine(page, 5);

    // Programmatically trigger editor-menu and capture registered items
    const menuItems = await page.evaluate(() => {
      const app = (window as any).app;
      const view = app.workspace.activeLeaf?.view;
      if (!view?.editor) throw new Error("No active editor view");

      // Create a mock menu to capture items added by plugins
      const items: string[] = [];
      const mockMenu = {
        addItem: (cb: (item: any) => void) => {
          const mockItem = {
            _title: "",
            _icon: "",
            _onClick: null as any,
            setTitle(t: string) { this._title = t; return this; },
            setIcon(i: string) { this._icon = i; return this; },
            onClick(fn: any) { this._onClick = fn; return this; },
          };
          cb(mockItem);
          items.push(mockItem._title);
          return mockMenu;
        },
        addSeparator: () => mockMenu,
      };

      // Trigger the editor-menu event
      app.workspace.trigger("editor-menu", mockMenu, view.editor, view);
      return items;
    });

    console.log("[test] Menu items:", menuItems);
    expect(menuItems).toContain("See relevant connections");
  });

  test("command opens sidebar with results", async () => {
    const { page } = ctx;
    await openNote(page, "Note Alpha");
    await setCursorLine(page, 5);

    // Execute via command palette API
    await page.evaluate(() => {
      const app = (window as any).app;
      app.commands.executeCommandById("sc-block-explorer:show-block-connections");
    });

    // Wait for sidebar to appear with results
    await page.waitForSelector(SEL.connectionsView, { timeout: 15000 });
    const results = page.locator(SEL.resultItem);
    const count = await results.count();
    console.log("[test] Result count:", count);
    expect(count).toBeGreaterThan(0);
  });
});
