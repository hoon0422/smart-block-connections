/**
 * One-time script to launch Obsidian directly on the SOURCE vault,
 * wait for SC to complete embedding, and persist .smart-env data.
 * The temp-vault approach in launchObsidian() loses the data on cleanup.
 *
 * Usage: bunx playwright test tests/e2e/index-vault.spec.ts --config tests/playwright.config.ts --timeout 300000
 */
import { test, expect } from "@playwright/test";
import { chromium } from "@playwright/test";
import { spawn, execSync, ChildProcess } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs-extra";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VAULT_PATH =
  "/Users/Younghoon/projects/smakr-block-connections-test-vaults";
const OBSIDIAN_BIN = "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
const OBSIDIAN_CONFIG_DIR = path.join(
  process.env.HOME ?? "~",
  "Library",
  "Application Support",
  "obsidian"
);
const OBSIDIAN_CONFIG_PATH = path.join(OBSIDIAN_CONFIG_DIR, "obsidian.json");
const PLUGIN_DIST = path.resolve(__dirname, "../../dist");
const REMOTE_DEBUG_PORT = 9222;

let obsidianProcess: ChildProcess;
let originalConfig: string | null = null;

test.describe("Index Vault (Direct)", () => {
  test.setTimeout(300000);

  test.beforeAll(async () => {
    // Refresh our plugin build into the source vault
    const pluginDest = path.join(
      VAULT_PATH,
      ".obsidian",
      "plugins",
      "sc-block-explorer"
    );
    await fs.ensureDir(pluginDest);
    await fs.copy(PLUGIN_DIST, pluginDest);

    // Save and update Obsidian config
    try {
      originalConfig = await fs.readFile(OBSIDIAN_CONFIG_PATH, "utf-8");
    } catch {
      originalConfig = null;
    }

    const vaultId = crypto
      .createHash("md5")
      .update(VAULT_PATH)
      .digest("hex")
      .slice(0, 16);
    const config: any = originalConfig ? JSON.parse(originalConfig) : {};
    if (!config.vaults) config.vaults = {};
    for (const id of Object.keys(config.vaults)) config.vaults[id].open = false;
    config.vaults[vaultId] = { path: VAULT_PATH, ts: Date.now(), open: true };
    await fs.writeFile(OBSIDIAN_CONFIG_PATH, JSON.stringify(config));

    const vaultConfigPath = path.join(OBSIDIAN_CONFIG_DIR, `${vaultId}.json`);
    if (!(await fs.pathExists(vaultConfigPath))) {
      await fs.writeFile(vaultConfigPath, JSON.stringify({}));
    }

    // Kill existing Obsidian
    try {
      execSync("pkill -f Obsidian 2>/dev/null || true");
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));

    // Launch Obsidian directly on source vault
    obsidianProcess = spawn(
      OBSIDIAN_BIN,
      [`--remote-debugging-port=${REMOTE_DEBUG_PORT}`],
      {
        env: { ...process.env, ELECTRON_DISABLE_GPU: "1" },
        stdio: "pipe",
      }
    );
    obsidianProcess.stdout?.on("data", (d) =>
      console.log(`[obsidian] ${d.toString().trim()}`)
    );
    obsidianProcess.stderr?.on("data", (d) =>
      console.log(`[obsidian:err] ${d.toString().trim()}`)
    );
  });

  test.afterAll(async () => {
    try {
      obsidianProcess?.kill("SIGTERM");
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
    try {
      execSync("pkill -f Obsidian 2>/dev/null || true");
    } catch {}
    if (originalConfig)
      await fs.writeFile(OBSIDIAN_CONFIG_PATH, originalConfig);
  });

  test("wait for SC to fully index and embed", async () => {
    // Wait for CDP
    const start = Date.now();
    let wsUrl = "";
    while (Date.now() - start < 30000) {
      try {
        const res = await fetch(
          `http://127.0.0.1:${REMOTE_DEBUG_PORT}/json/version`
        );
        const data = (await res.json()) as any;
        if (data.webSocketDebuggerUrl) {
          wsUrl = data.webSocketDebuggerUrl;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(wsUrl).toBeTruthy();

    const browser = await chromium.connectOverCDP(
      `http://127.0.0.1:${REMOTE_DEBUG_PORT}`
    );
    const page = browser.contexts()[0]?.pages()[0];
    expect(page).toBeTruthy();

    // Wait for workspace
    await page.waitForSelector(".workspace", { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Dismiss "Trust vault author" modal if present
    try {
      const modal = page.locator(".modal-container");
      if ((await modal.count()) > 0) {
        const trustBtn = page.locator(".modal-button-container button").first();
        if ((await trustBtn.count()) > 0) {
          await trustBtn.click({ timeout: 2000 });
          await page.waitForTimeout(2000);
        }
      }
    } catch { /* no trust modal */ }

    // Dismiss any other modals
    const closeBtn = page.locator(".modal-close-button");
    while ((await closeBtn.count()) > 0) {
      await closeBtn.first().click();
      await page.waitForTimeout(300);
    }

    await page.waitForTimeout(3000);

    // Poll SC status
    const maxWait = 240000;
    const pollStart = Date.now();
    let prevEmbedded = 0;
    let stableCount = 0;

    while (Date.now() - pollStart < maxWait) {
      const status = await page.evaluate(() => {
        const sc = (window as any).app?.plugins?.plugins?.["smart-connections"];
        const env = sc?.env ?? sc?.smart_env;
        if (!env) return { sourceCount: 0, blockCount: 0, embeddedCount: 0 };
        const sourceCount = Object.keys(env.smart_sources?.items ?? {}).length;
        const blockCount = Object.keys(env.smart_blocks?.items ?? {}).length;
        let embeddedCount = 0;
        for (const block of Object.values(
          env.smart_blocks?.items ?? {}
        ) as any[]) {
          if (block?.data?.embeddings) {
            const firstEmbed = Object.values(block.data.embeddings)[0] as any;
            if (firstEmbed?.vec) embeddedCount++;
          }
        }
        return { sourceCount, blockCount, embeddedCount };
      });

      console.log(
        `[${Math.round((Date.now() - pollStart) / 1000)}s]`,
        JSON.stringify(status)
      );

      if (status.blockCount > 0 && status.embeddedCount >= status.blockCount) {
        console.log("All blocks embedded!");
        break;
      }

      // Detect plateau (some blocks might be too short to embed)
      if (status.embeddedCount > 0 && status.embeddedCount === prevEmbedded) {
        stableCount++;
        if (stableCount >= 6) {
          // 30 seconds of no change
          console.log(
            `Embedding plateaued at ${status.embeddedCount}/${status.blockCount}. Accepting.`
          );
          break;
        }
      } else {
        stableCount = 0;
      }
      prevEmbedded = status.embeddedCount;

      await page.waitForTimeout(5000);
    }

    // Verify .smart-env was created in source vault
    const smartEnvExists = await fs.pathExists(
      path.join(VAULT_PATH, ".smart-env")
    );
    console.log(".smart-env exists in source vault:", smartEnvExists);

    if (smartEnvExists) {
      const entries: string[] = [];
      const walk = async (dir: string, prefix = "") => {
        const items = await fs.readdir(dir, { withFileTypes: true });
        for (const item of items) {
          const rel = prefix ? `${prefix}/${item.name}` : item.name;
          if (item.isDirectory()) await walk(path.join(dir, item.name), rel);
          else entries.push(rel);
        }
      };
      await walk(path.join(VAULT_PATH, ".smart-env"));
      console.log(".smart-env files:", entries);
    }

    await browser.close();
    expect(smartEnvExists).toBe(true);
  });
});
