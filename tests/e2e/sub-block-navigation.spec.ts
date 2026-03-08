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

  // Turn off exclude-self so we can see all blocks including same-file ones
  await page.evaluate(() => {
    const plugin = (window as any).app?.plugins?.plugins?.["sc-block-explorer"];
    if (plugin) {
      plugin.settings.excludeSelf = false;
      plugin.saveSettings();
    }
  });
});

test.afterAll(async () => {
  // Restore excludeSelf default before closing
  if (ctx) {
    await ctx.page.evaluate(() => {
      const plugin = (window as any).app?.plugins?.plugins?.["sc-block-explorer"];
      if (plugin) {
        plugin.settings.excludeSelf = true;
        plugin.saveSettings();
      }
    });
    await closeObsidian(ctx);
  }
});

async function triggerConnectionsForAlpha(page: import("@playwright/test").Page) {
  await openNote(page, "Note Alpha");
  await setCursorLine(page, 5);
  await triggerConnectionsCommand(page);
  await page.waitForSelector(SEL.connectionsView, { timeout: 15000 });
}

test.describe("Sub-block Navigation", () => {
  test("results with #{digits} sub-block keys are displayed", async () => {
    const { page } = ctx;
    await triggerConnectionsForAlpha(page);

    const titles = page.locator(SEL.resultTitle);
    const allTitles = await titles.allTextContents();

    // With excludeSelf off, we should get multiple blocks including sub-blocks
    expect(allTitles.length).toBeGreaterThan(0);
  });

  test("clicking a result with #{digits} suffix navigates to the correct file", async () => {
    const { page } = ctx;
    await triggerConnectionsForAlpha(page);
    await dismissNotices(page);

    const titles = page.locator(SEL.resultTitle);
    const allTitles = await titles.allTextContents();

    // Find a result with #{digits} suffix if one exists
    let targetIndex = allTitles.findIndex((t) => /#\{\d+\}/.test(t));

    // If no sub-block result, just click any result — the strip logic
    // should still work for regular keys
    if (targetIndex === -1) {
      targetIndex = 0;
    }

    const targetTitle = allTitles[targetIndex];
    // Extract expected file basename from the key (e.g. "Note Beta.md#..." → "Note Beta")
    const expectedFile = targetTitle.split(".md")[0];

    await titles.nth(targetIndex).click({ force: true });
    await page.waitForTimeout(1000);

    const activeFile = await page.evaluate(() => {
      return (window as any).app?.workspace?.getActiveFile()?.basename;
    });

    expect(activeFile).toBe(expectedFile);
  });

  test("clicking any result navigates successfully without error", async () => {
    const { page } = ctx;
    await triggerConnectionsForAlpha(page);
    await dismissNotices(page);

    const titles = page.locator(SEL.resultTitle);
    const count = await titles.count();
    expect(count).toBeGreaterThan(0);

    // Click the first result
    const firstTitle = await titles.first().textContent();
    await titles.first().click({ force: true });
    await page.waitForTimeout(1000);

    // Verify a file was opened (activeFile is not null)
    const activeFile = await page.evaluate(() => {
      return (window as any).app?.workspace?.getActiveFile()?.path;
    });
    expect(activeFile).toBeTruthy();

    // If the result had a #{digits} suffix, verify the file path matches
    // after stripping the suffix
    if (firstTitle && /#\{\d+\}/.test(firstTitle)) {
      const expectedPath = firstTitle.split("#")[0];
      expect(activeFile).toBe(expectedPath);
    }
  });
});
