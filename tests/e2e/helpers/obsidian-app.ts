import {
  _electron as electron,
  ElectronApplication,
  Page,
} from "@playwright/test";
import path from "path";
import fs from "fs-extra";

const OBSIDIAN_PATHS: Record<string, string> = {
  darwin: "/Applications/Obsidian.app/Contents/MacOS/Obsidian",
  linux: "/usr/bin/obsidian",
  win32: "C:\\Users\\Public\\Obsidian\\Obsidian.exe",
};

export interface ObsidianTestContext {
  electronApp: ElectronApplication;
  page: Page;
}

/**
 * Launch Obsidian with the test vault.
 * Copies fixture vault to temp dir for test isolation.
 * Symlinks the built plugin into the vault's plugins directory.
 */
export async function launchObsidian(
  pluginDistPath: string
): Promise<ObsidianTestContext> {
  const platform = process.platform;
  const obsidianBin = process.env.OBSIDIAN_PATH ?? OBSIDIAN_PATHS[platform] ?? OBSIDIAN_PATHS.darwin;

  // Copy fixture vault to temp directory (isolate test runs)
  const fixtureVault = path.resolve(__dirname, "../fixtures/test-vault");
  const tempVault = path.resolve(__dirname, "../.tmp-vault");
  await fs.remove(tempVault);
  await fs.copy(fixtureVault, tempVault);

  // Copy the built plugin into the temp vault
  const pluginDest = path.join(
    tempVault,
    ".obsidian",
    "plugins",
    "sc-block-explorer"
  );
  await fs.ensureDir(pluginDest);
  await fs.copy(pluginDistPath, pluginDest);

  const electronApp = await electron.launch({
    executablePath: obsidianBin,
    args: [`--vault=${tempVault}`],
    env: {
      ...process.env,
      ELECTRON_DISABLE_GPU: "1",
    },
    timeout: 30000,
  });

  const page = await electronApp.firstWindow();

  return { electronApp, page };
}

export async function closeObsidian(ctx: ObsidianTestContext) {
  await ctx.electronApp.close();
  const tempVault = path.resolve(__dirname, "../.tmp-vault");
  await fs.remove(tempVault);
}
