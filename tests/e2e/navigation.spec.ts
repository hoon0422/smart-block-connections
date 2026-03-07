import { test, expect } from "@playwright/test";
import {
  launchObsidian,
  closeObsidian,
  ObsidianTestContext,
} from "./helpers/obsidian-app";
import {
  waitForObsidianReady,
  waitForSCReady,
  waitForPluginReady,
  openNote,
  setCursorLine,
  rightClickAtCursor,
} from "./helpers/wait-helpers";
import { SEL } from "./helpers/selectors";
import path from "path";

const PLUGIN_DIST = path.resolve(__dirname, "../../dist");

let ctx: ObsidianTestContext;

test.beforeAll(async () => {
  ctx = await launchObsidian(PLUGIN_DIST);
  await waitForObsidianReady(ctx.page);
  await waitForSCReady(ctx.page);
  await waitForPluginReady(ctx.page);
});

test.afterAll(async () => {
  if (ctx) await closeObsidian(ctx);
});

test.describe("Navigation", () => {
  test("clicking a result opens that note", async () => {
    const { page } = ctx;
    await openNote(page, "Note Alpha");
    await setCursorLine(page, 5);
    await rightClickAtCursor(page);
    await page
      .locator(SEL.contextMenuItem, { hasText: "See relevant connections" })
      .click();
    await page.waitForSelector(SEL.connectionsView, { timeout: 10000 });

    // Click first result
    const firstResult = page.locator(SEL.resultTitle).first();
    await firstResult.click();

    // Verify the editor now shows a different file
    await page.waitForTimeout(1000);
    const activeFile = await page.evaluate(() => {
      return (window as any).app?.workspace?.getActiveFile()?.basename;
    });
    expect(activeFile).not.toBe("Note Alpha");
  });
});
