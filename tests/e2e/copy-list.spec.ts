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

test.describe("Copy List", () => {
  test("copies markdown-formatted connection list to clipboard", async () => {
    const { page } = ctx;
    await openNote(page, "Note Alpha");
    await setCursorLine(page, 5);
    await triggerConnectionsCommand(page);
    await page.waitForSelector(SEL.connectionsView, { timeout: 15000 });

    // Dismiss SC notifications that overlay the sidebar
    await dismissNotices(page);

    // Click copy button
    const copyBtn = page.locator(SEL.copyBtn);
    await copyBtn.click({ force: true });

    // Read clipboard via navigator.clipboard API
    const clipboardText = await page.evaluate(async () => {
      return await navigator.clipboard.readText();
    });

    expect(clipboardText).toContain("## Connections for");
    expect(clipboardText).toContain("[[");
    expect(clipboardText).toContain("%");
  });
});
