import { test, expect } from "@playwright/test";
import {
  launchObsidian,
  closeObsidian,
  ObsidianTestContext,
} from "./helpers/obsidian-app";
import {
  openNote,
  setCursorLine,
  triggerConnectionsCommand,
  waitForSCBlocks,
  dismissNotices,
} from "./helpers/wait-helpers";
import { SEL } from "./helpers/selectors";
import { PLUGIN_DIST } from "./helpers/paths";

let ctx: ObsidianTestContext;

test.beforeAll(async () => {
  ctx = await launchObsidian(PLUGIN_DIST);
  const { page } = ctx;

  await page.waitForSelector(".workspace", { timeout: 15000 });

  const start = Date.now();
  while (Date.now() - start < 30000) {
    const ready = await page.evaluate(() => {
      const plugin = (window as any).app?.plugins?.plugins?.["sc-block-explorer"];
      return plugin?.bridge?.isReady === true;
    });
    if (ready) break;
    await page.waitForTimeout(1000);
  }

  await waitForSCBlocks(page);
});

test.afterAll(async () => {
  if (ctx) await closeObsidian(ctx);
});

test.describe("Insert Link", () => {
  test("inserts wikilink into active editor when Insert button is clicked", async () => {
    const { page } = ctx;
    await openNote(page, "Note Alpha");
    await page.waitForTimeout(500);

    // Switch to editing (source) mode via the view's setState API
    await page.evaluate(async () => {
      const app = (window as any).app;
      const leaf = app.workspace.activeLeaf;
      if (leaf) {
        // setViewState is the leaf-level API that forces view mode
        await leaf.setViewState({
          type: "markdown",
          state: { file: leaf.view.file?.path, mode: "source", source: true },
        });
      }
    });
    await page.waitForTimeout(1500);

    // Verify editor is now available
    const hasEditor = await page.evaluate(() => {
      const app = (window as any).app;
      return !!app.workspace.activeLeaf?.view?.editor;
    });
    expect(hasEditor).toBe(true);

    await setCursorLine(page, 5);

    // Get editor content before insert
    const contentBefore = await page.evaluate(() => {
      const app = (window as any).app;
      return app.workspace.activeLeaf?.view?.editor?.getValue() ?? "";
    });
    expect(contentBefore.length).toBeGreaterThan(0);

    // Trigger connections and wait for sidebar
    await triggerConnectionsCommand(page);
    await page.waitForSelector(SEL.connectionsView, { timeout: 15000 });

    // Dismiss SC notifications that overlay the sidebar
    await dismissNotices(page);

    // Re-focus the markdown editor leaf so activeEditor is set
    await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("markdown");
      if (leaves.length > 0) {
        app.workspace.setActiveLeaf(leaves[0], { focus: true });
      }
    });
    await page.waitForTimeout(500);

    // Verify activeEditor is available before clicking Insert
    const hasActiveEditor = await page.evaluate(() => {
      const app = (window as any).app;
      return !!app.workspace.activeEditor?.editor;
    });

    // Click the first Insert button
    const insertBtn = page.locator(SEL.insertBtn).first();
    await insertBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Verify the editor content now contains a wikilink
    // Use getLeavesOfType since clicking sidebar button changed activeLeaf
    const contentAfter = await page.evaluate(() => {
      const app = (window as any).app;
      const leaves = app.workspace.getLeavesOfType("markdown");
      return leaves[0]?.view?.editor?.getValue() ?? "";
    });

    expect(contentAfter).toContain("[[");
    expect(contentAfter.length).toBeGreaterThan(contentBefore.length);
  });
});
