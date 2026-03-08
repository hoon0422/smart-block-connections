import { Page } from "@playwright/test";

/**
 * Dismiss any modals, trust dialogs, and notices.
 */
export async function dismissModals(page: Page) {
  // Handle "Trust vault author" modal - click the trust/enable plugins button
  const trustBtn = page.locator(".modal-button-container button").first();
  if ((await page.locator(".modal-container").count()) > 0) {
    try {
      await trustBtn.click({ timeout: 1000 });
      await page.waitForTimeout(1000);
    } catch { /* no trust button */ }
  }

  // Close remaining modal dialogs (max 5 attempts to avoid infinite loop)
  for (let i = 0; i < 5; i++) {
    const closeBtn = page.locator(".modal-close-button");
    if ((await closeBtn.count()) === 0) break;
    try {
      await closeBtn.first().click({ timeout: 1000 });
      await page.waitForTimeout(300);
    } catch { break; }
  }
}

/**
 * Wait for Obsidian workspace to finish loading.
 */
export async function waitForObsidianReady(page: Page, timeout = 30000) {
  await page.waitForSelector(".workspace", { timeout });
  await page.waitForTimeout(3000);
  await dismissModals(page);
}

/**
 * Wait for Smart Connections env to be available.
 * Checks that SC plugin loaded and has smart_blocks + smart_sources collections.
 */
export async function waitForSCReady(page: Page, timeout = 15000) {
  await page.waitForFunction(
    () => {
      const sc = (window as any).app?.plugins?.plugins?.["smart-connections"];
      const env = sc?.env ?? sc?.smart_env;
      return !!(env?.smart_blocks && env?.smart_sources);
    },
    { timeout, polling: 1000 }
  );
  await dismissModals(page);
}

/**
 * Wait for our plugin to be loaded and bridge initialized.
 */
export async function waitForPluginReady(page: Page, timeout = 20000) {
  await page.waitForFunction(
    () => {
      const plugin = (window as any).app?.plugins?.plugins?.["sc-block-explorer"];
      return plugin?.bridge?.isReady === true;
    },
    { timeout, polling: 1000 }
  );
}

/**
 * Open a specific note in the editor using Obsidian's API.
 * Forces the note into the active leaf and ensures editor visibility.
 */
export async function openNote(page: Page, filename: string) {
  await page.evaluate(async (name) => {
    const app = (window as any).app;
    const file = app.vault.getFiles().find((f: any) => f.basename === name);
    if (!file) throw new Error(`File not found: ${name}`);

    // Use openLinkText which handles leaf management automatically.
    // Pass false for newLeaf to reuse existing leaf.
    await app.workspace.openLinkText(file.path, "", false);

    // Ensure the active leaf is focused
    const leaf = app.workspace.activeLeaf;
    if (leaf) app.workspace.setActiveLeaf(leaf, { focus: true });
  }, filename);

  await page.waitForTimeout(1500);

  // Verify editor is visible
  await page.waitForSelector(".cm-editor", { state: "visible", timeout: 10000 });
}

/**
 * Place cursor at a specific line using Obsidian's editor API.
 */
export async function setCursorLine(page: Page, line: number) {
  await page.evaluate((lineNum) => {
    const app = (window as any).app;
    const view = app.workspace.activeLeaf?.view;
    if (view?.editor) {
      view.editor.setCursor({ line: lineNum, ch: 0 });
    }
  }, line);
  await page.waitForTimeout(300);
}

/**
 * Dismiss SC notification overlays that block button clicks.
 */
export async function dismissNotices(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll(".notice-container .notice").forEach((n) => {
      (n as HTMLElement).click();
    });
    // Also remove any remaining notice containers
    document.querySelectorAll(".notice-container").forEach((c) => c.remove());
  });
  await page.waitForTimeout(300);
}

/**
 * Wait for SC to have blocks with embeddings loaded.
 * Bridge being ready doesn't mean blocks have loaded their data yet.
 */
export async function waitForSCBlocks(page: Page, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const status = await page.evaluate(() => {
      const sc = (window as any).app?.plugins?.plugins?.["smart-connections"];
      const env = sc?.env ?? sc?.smart_env;
      if (!env?.smart_blocks?.items) return { blockCount: 0, withVec: 0 };
      const blocks = Object.values(env.smart_blocks.items) as any[];
      let withVec = 0;
      for (const b of blocks) {
        if (b?.vec || b?.data?.vec) withVec++;
        else if (b?.data?.embeddings) {
          const firstEmbed = Object.values(b.data.embeddings)[0] as any;
          if (firstEmbed?.vec) withVec++;
        }
      }
      return { blockCount: blocks.length, withVec };
    });
    if (status.blockCount > 0 && status.withVec > 0) return;
    await page.waitForTimeout(1000);
  }
}

/**
 * Trigger "show-block-connections" command via Obsidian's command API.
 * CDP right-clicks don't trigger Obsidian's native context menu in Electron,
 * so we use the command as the reliable way to trigger the full flow.
 */
export async function triggerConnectionsCommand(page: Page) {
  await page.evaluate(() => {
    const app = (window as any).app;
    app.commands.executeCommandById("sc-block-explorer:show-block-connections");
  });
}
