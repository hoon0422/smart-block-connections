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

async function triggerConnectionsForAlpha(page: import("@playwright/test").Page) {
  await openNote(page, "Note Alpha");
  await setCursorLine(page, 5);
  await rightClickAtCursor(page);
  await page
    .locator(SEL.contextMenuItem, { hasText: "See relevant connections" })
    .click();
  await page.waitForSelector(SEL.connectionsView, { timeout: 10000 });
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

  test("each result shows a snippet preview", async () => {
    const { page } = ctx;
    await triggerConnectionsForAlpha(page);

    const snippets = page.locator(SEL.resultSnippet);
    const count = await snippets.count();
    expect(count).toBeGreaterThan(0);

    const firstSnippet = await snippets.first().textContent();
    expect(firstSnippet?.length).toBeGreaterThan(10);
  });

  test("toggle button switches between blocks and sources", async () => {
    const { page } = ctx;
    await triggerConnectionsForAlpha(page);

    const toggleBtn = page.locator(SEL.toggleBtn);
    await expect(toggleBtn).toContainText("blocks");

    await toggleBtn.click();
    await page.waitForTimeout(1000);

    await expect(toggleBtn).toContainText("files");
    const titles = page.locator(SEL.resultTitle);
    const firstTitle = await titles.first().textContent();
    expect(firstTitle).not.toContain("#");
  });
});
