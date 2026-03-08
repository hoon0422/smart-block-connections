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

async function triggerConnectionsForAlpha(page: import("@playwright/test").Page) {
  await openNote(page, "Note Alpha");
  await setCursorLine(page, 5);
  await triggerConnectionsCommand(page);
  await page.waitForSelector(SEL.connectionsView, { timeout: 15000 });
}

test.describe("Exclude Self Filter", () => {
  test("exclude-self toggle is visible and defaults to 'Self excluded'", async () => {
    const { page } = ctx;
    await triggerConnectionsForAlpha(page);
    await dismissNotices(page);

    // The exclude-self toggle should exist in the controls
    const toggleBtns = page.locator(`${SEL.toggleBtn}`);
    const count = await toggleBtns.count();
    // There should be at least 2 toggle buttons: blocks/files and exclude-self
    expect(count).toBeGreaterThanOrEqual(2);

    // Find the exclude-self toggle by text
    const excludeBtn = page.locator(`${SEL.toggleBtn}`, { hasText: "Self excluded" });
    await expect(excludeBtn).toBeVisible();
  });

  test("results do not include blocks from the same file when exclude-self is on", async () => {
    const { page } = ctx;
    await triggerConnectionsForAlpha(page);

    const titles = page.locator(SEL.resultTitle);
    const allTitles = await titles.allTextContents();

    // None of the results should be from "Note Alpha" (the current file)
    for (const title of allTitles) {
      expect(title).not.toContain("Note Alpha");
    }
  });

  test("toggling exclude-self off shows results from the same file", async () => {
    const { page } = ctx;
    await triggerConnectionsForAlpha(page);
    await dismissNotices(page);

    // Get initial result count (with self excluded)
    const initialTitles = await page.locator(SEL.resultTitle).allTextContents();
    const initialCount = initialTitles.length;

    // Click the exclude-self toggle to turn it off
    const excludeBtn = page.locator(`${SEL.toggleBtn}`, { hasText: "Self excluded" });
    await excludeBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Button text should change
    const includedBtn = page.locator(`${SEL.toggleBtn}`, { hasText: "Self included" });
    await expect(includedBtn).toBeVisible();

    // Result count should be >= initial (same-file results now included)
    const newTitles = await page.locator(SEL.resultTitle).allTextContents();
    expect(newTitles.length).toBeGreaterThanOrEqual(initialCount);

    // Toggle back on for subsequent tests
    await includedBtn.click({ force: true });
    await page.waitForTimeout(500);
  });
});
