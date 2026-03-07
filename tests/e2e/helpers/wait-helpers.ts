import { Page } from "@playwright/test";

/**
 * Wait for Obsidian workspace to finish loading.
 */
export async function waitForObsidianReady(page: Page, timeout = 30000) {
  await page.waitForSelector(".workspace", { timeout });
  await page.waitForTimeout(2000);
}

/**
 * Wait for Smart Connections to finish loading.
 */
export async function waitForSCReady(page: Page, timeout = 60000) {
  await page.waitForFunction(
    () => {
      const sc = (window as any).app?.plugins?.plugins?.["smart-connections"];
      return sc?.env?.smart_blocks && sc?.env?.smart_sources;
    },
    { timeout }
  );
}

/**
 * Wait for our plugin to be loaded and bridge initialized.
 */
export async function waitForPluginReady(page: Page, timeout = 15000) {
  await page.waitForFunction(
    () => {
      const plugin = (window as any).app?.plugins?.plugins?.[
        "sc-block-explorer"
      ];
      return plugin?.bridge?.isReady === true;
    },
    { timeout }
  );
}

/**
 * Open a specific note in the editor using the quick switcher.
 */
export async function openNote(page: Page, filename: string) {
  await page.keyboard.press("Control+o");
  await page.waitForSelector(".prompt-input", { timeout: 5000 });
  await page.fill(".prompt-input", filename);
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1000);
}

/**
 * Place cursor at a specific line in the active editor.
 */
export async function setCursorLine(page: Page, line: number) {
  await page.keyboard.press("Control+g");
  await page.waitForSelector(".prompt-input", { timeout: 3000 });
  await page.fill(".prompt-input", String(line + 1)); // Obsidian is 1-indexed
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
}

/**
 * Right-click at the current cursor position in the editor.
 */
export async function rightClickAtCursor(page: Page) {
  const activeLine = page.locator(".cm-activeLine").first();
  await activeLine.click({ button: "right" });
  await page.waitForSelector(".menu", { timeout: 3000 });
}
