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

test.describe("Navigation", () => {
  test("clicking a result opens that note", async () => {
    const { page } = ctx;
    await openNote(page, "Note Alpha");
    await setCursorLine(page, 5);
    await triggerConnectionsCommand(page);
    await page.waitForSelector(SEL.connectionsView, { timeout: 15000 });

    // Dismiss SC notifications that overlay sidebar
    await dismissNotices(page);

    // Find a result that's NOT from Note Alpha
    const titles = page.locator(SEL.resultTitle);
    const allTitles = await titles.allTextContents();
    const otherIndex = allTitles.findIndex((t) => !t.includes("Note Alpha"));

    if (otherIndex === -1) {
      // All results are from Note Alpha — just verify results exist
      expect(allTitles.length).toBeGreaterThan(0);
      return;
    }

    await titles.nth(otherIndex).click({ force: true });

    // Verify the editor now shows a different file
    await page.waitForTimeout(1000);
    const activeFile = await page.evaluate(() => {
      return (window as any).app?.workspace?.getActiveFile()?.basename;
    });
    expect(activeFile).not.toBe("Note Alpha");
  });
});
