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

test.describe("Copy List", () => {
  test("copies markdown-formatted connection list to clipboard", async () => {
    const { page } = ctx;
    await openNote(page, "Note Alpha");
    await setCursorLine(page, 5);
    await rightClickAtCursor(page);
    await page
      .locator(SEL.contextMenuItem, { hasText: "See relevant connections" })
      .click();
    await page.waitForSelector(SEL.connectionsView, { timeout: 10000 });

    // Click copy button
    const copyBtn = page.locator(SEL.copyBtn);
    await copyBtn.click();

    // Read clipboard via Electron's clipboard API
    const clipboardText = await page.evaluate(async () => {
      const { clipboard } = require("electron");
      return clipboard.readText();
    });

    expect(clipboardText).toContain("## Connections for");
    expect(clipboardText).toContain("[[");
    expect(clipboardText).toContain("%");

    // Verify a notice appeared
    const notice = page.locator(SEL.notice);
    await expect(notice).toContainText("Copied");
  });
});
