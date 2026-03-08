import { chromium, Browser, Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs-extra";
import crypto from "crypto";
import { execSync, spawn, ChildProcess } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OBSIDIAN_PATHS: Record<string, string> = {
  darwin: "/Applications/Obsidian.app/Contents/MacOS/Obsidian",
  linux: "/usr/bin/obsidian",
  win32: "C:\\Users\\Public\\Obsidian\\Obsidian.exe",
};

const OBSIDIAN_CONFIG_DIR = path.join(
  process.env.HOME ?? "~",
  "Library",
  "Application Support",
  "obsidian"
);

const OBSIDIAN_CONFIG_PATH = path.join(OBSIDIAN_CONFIG_DIR, "obsidian.json");

const REMOTE_DEBUG_PORT = 9222;

/** Path to the pre-configured test vault with SC + our plugin installed */
const TEST_VAULT_PATH =
  process.env.TEST_VAULT_PATH ??
  "/Users/Younghoon/projects/smakr-block-connections-test-vaults";

export interface ObsidianTestContext {
  browser: Browser;
  page: Page;
  obsidianProcess: ChildProcess;
  tempVault: string;
  originalObsidianConfig: string | null;
}

/**
 * Register a vault in Obsidian's global config so it opens directly
 * instead of showing the vault picker.
 */
async function registerVaultInObsidian(
  vaultPath: string
): Promise<string | null> {
  let originalConfig: string | null = null;

  try {
    originalConfig = await fs.readFile(OBSIDIAN_CONFIG_PATH, "utf-8");
  } catch {
    originalConfig = null;
  }

  // Generate a deterministic vault ID from the path
  const vaultId = crypto
    .createHash("md5")
    .update(vaultPath)
    .digest("hex")
    .slice(0, 16);

  const config: any = originalConfig ? JSON.parse(originalConfig) : {};
  if (!config.vaults) config.vaults = {};

  // Mark all existing vaults as closed
  for (const id of Object.keys(config.vaults)) {
    config.vaults[id].open = false;
  }

  // Register our test vault as the only open one
  config.vaults[vaultId] = {
    path: vaultPath,
    ts: Date.now(),
    open: true,
  };

  // Also create the per-vault config file Obsidian expects
  const vaultConfigPath = path.join(OBSIDIAN_CONFIG_DIR, `${vaultId}.json`);
  if (!(await fs.pathExists(vaultConfigPath))) {
    await fs.writeFile(vaultConfigPath, JSON.stringify({}));
  }

  await fs.ensureDir(path.dirname(OBSIDIAN_CONFIG_PATH));
  await fs.writeFile(OBSIDIAN_CONFIG_PATH, JSON.stringify(config));

  return originalConfig;
}

/**
 * Restore Obsidian's config to its original state.
 */
async function restoreObsidianConfig(originalConfig: string | null) {
  if (originalConfig !== null) {
    await fs.writeFile(OBSIDIAN_CONFIG_PATH, originalConfig);
  }
}

/**
 * Kill any running Obsidian processes.
 */
function killObsidian() {
  try {
    execSync("pkill -f Obsidian 2>/dev/null || true");
  } catch {
    // Ignore
  }
}

/**
 * Wait for CDP endpoint to become available.
 */
async function waitForCDP(
  port: number,
  timeoutMs = 30000
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const data = (await res.json()) as { webSocketDebuggerUrl?: string };
      if (data.webSocketDebuggerUrl) {
        return data.webSocketDebuggerUrl;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`CDP endpoint not available after ${timeoutMs}ms`);
}

/**
 * Launch Obsidian with the test vault using CDP connection.
 * Copies the pre-configured vault to a temp dir for isolation,
 * registers it in Obsidian's config, then launches with remote debugging.
 */
export async function launchObsidian(
  pluginDistPath: string
): Promise<ObsidianTestContext> {
  const platform = process.platform;
  const obsidianBin =
    process.env.OBSIDIAN_PATH ??
    OBSIDIAN_PATHS[platform] ??
    OBSIDIAN_PATHS.darwin;

  // Copy vault to temp directory for test isolation
  const tempVault = path.resolve(__dirname, "../.tmp-vault");
  await fs.remove(tempVault);
  await fs.copy(TEST_VAULT_PATH, tempVault);

  // Refresh our built plugin in the temp vault
  const pluginDest = path.join(
    tempVault,
    ".obsidian",
    "plugins",
    "sc-block-explorer"
  );
  await fs.ensureDir(pluginDest);
  await fs.copy(pluginDistPath, pluginDest);

  // Register the temp vault in Obsidian's config
  const originalObsidianConfig = await registerVaultInObsidian(tempVault);

  // Kill any existing Obsidian instances
  killObsidian();
  await new Promise((r) => setTimeout(r, 2000));

  // Launch Obsidian with remote debugging enabled
  const obsidianProcess = spawn(
    obsidianBin,
    [`--remote-debugging-port=${REMOTE_DEBUG_PORT}`],
    {
      env: {
        ...process.env,
        ELECTRON_DISABLE_GPU: "1",
      },
      stdio: "pipe",
      detached: false,
    }
  );

  // Log output for debugging
  obsidianProcess.stdout?.on("data", (data) => {
    console.log(`[obsidian] ${data.toString().trim()}`);
  });
  obsidianProcess.stderr?.on("data", (data) => {
    console.log(`[obsidian:err] ${data.toString().trim()}`);
  });

  // Wait for CDP endpoint
  const wsUrl = await waitForCDP(REMOTE_DEBUG_PORT, 30000);
  console.log(`[test] CDP connected: ${wsUrl}`);

  // Connect via CDP
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${REMOTE_DEBUG_PORT}`);

  // Get the first page (Obsidian main window)
  const contexts = browser.contexts();
  let page: Page;

  if (contexts.length > 0 && contexts[0].pages().length > 0) {
    page = contexts[0].pages()[0];
  } else {
    // Wait for a page to appear
    const context = contexts[0] ?? (await browser.newContext());
    page = await context.waitForEvent("page", { timeout: 30000 });
  }

  // Wait for initial load and dismiss "Trust vault author" modal if present
  await page.waitForTimeout(2000);
  try {
    const modal = page.locator(".modal-container");
    if ((await modal.count()) > 0) {
      // Click the first button (Trust author / enable plugins)
      const trustBtn = page.locator(".modal-button-container button").first();
      if ((await trustBtn.count()) > 0) {
        await trustBtn.click({ timeout: 2000 });
        await page.waitForTimeout(2000);
      }
    }
  } catch {
    // No trust modal - continue
  }

  return {
    browser,
    page,
    obsidianProcess,
    tempVault,
    originalObsidianConfig,
  };
}

export async function closeObsidian(ctx: ObsidianTestContext) {
  try {
    await ctx.browser.close();
  } catch {
    // Ignore
  }

  // Kill the Obsidian process
  try {
    ctx.obsidianProcess.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1000));
    if (!ctx.obsidianProcess.killed) {
      ctx.obsidianProcess.kill("SIGKILL");
    }
  } catch {
    // Ignore
  }

  // Also pkill to be sure
  killObsidian();

  // Restore original Obsidian config
  await restoreObsidianConfig(ctx.originalObsidianConfig);

  // Clean up temp vault
  await fs.remove(ctx.tempVault).catch(() => {});
}
