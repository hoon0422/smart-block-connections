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

test.describe("Sidebar View", () => {
  test("displays source block info in header", async () => {
    const { page } = ctx;
    await triggerConnectionsForAlpha(page);

    const sourceKey = page.locator(SEL.sourceKey);
    await expect(sourceKey).toContainText("Note Alpha");
  });

  test("results are sorted by score descending", async () => {
    const { page } = ctx;
    await triggerConnectionsForAlpha(page);

    const scores = page.locator(SEL.resultScore);
    const texts = await scores.allTextContents();
    const values = texts.map((t) => parseFloat(t.replace("%", "")));

    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
    }
  });

  test("Note Beta (same topic) ranks higher than Note Gamma (different topic)", async () => {
    const { page } = ctx;
    await triggerConnectionsForAlpha(page);

    const titles = page.locator(SEL.resultTitle);
    const allTitles = await titles.allTextContents();

    const betaIndex = allTitles.findIndex((t) => t.includes("Note Beta"));
    const gammaIndex = allTitles.findIndex((t) => t.includes("Note Gamma"));

    if (betaIndex !== -1 && gammaIndex !== -1) {
      expect(betaIndex).toBeLessThan(gammaIndex);
    }
  });

  test("results have score and title", async () => {
    const { page } = ctx;
    await triggerConnectionsForAlpha(page);

    // Every result should have a score and title
    const scores = page.locator(SEL.resultScore);
    const titles = page.locator(SEL.resultTitle);
    const scoreCount = await scores.count();
    const titleCount = await titles.count();
    expect(scoreCount).toBeGreaterThan(0);
    expect(scoreCount).toBe(titleCount);
  });

  test("toggle button switches between blocks and sources", async () => {
    const { page } = ctx;
    await triggerConnectionsForAlpha(page);

    // Dismiss SC notifications that overlay sidebar buttons
    await dismissNotices(page);

    const toggleBtn = page.locator(SEL.toggleBtn);
    await expect(toggleBtn).toContainText("blocks");

    await toggleBtn.click({ force: true });
    await page.waitForTimeout(1000);

    await expect(toggleBtn).toContainText("files");
    const titles = page.locator(SEL.resultTitle);
    const firstTitle = await titles.first().textContent();
    expect(firstTitle).not.toContain("#");
  });
});
