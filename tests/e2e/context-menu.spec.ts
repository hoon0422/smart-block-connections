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

test.describe("Context Menu", () => {
  test('shows "See relevant connections" in editor context menu', async () => {
    const { page } = ctx;
    await openNote(page, "Note Alpha");
    await setCursorLine(page, 5);
    await rightClickAtCursor(page);

    const menuItems = page.locator(SEL.contextMenuItem);
    const texts = await menuItems.allTextContents();
    expect(texts).toContain("See relevant connections");
  });

  test("clicking menu item opens sidebar with results", async () => {
    const { page } = ctx;
    await openNote(page, "Note Alpha");
    await setCursorLine(page, 5);
    await rightClickAtCursor(page);

    const menuItem = page.locator(SEL.contextMenuItem, {
      hasText: "See relevant connections",
    });
    await menuItem.click();

    await page.waitForSelector(SEL.connectionsView, { timeout: 10000 });
    const results = page.locator(SEL.resultItem);
    const count = await results.count();
    expect(count).toBeGreaterThan(0);
  });
});
