import { test, expect } from "@playwright/test";
import {
  launchObsidian,
  closeObsidian,
  ObsidianTestContext,
} from "./helpers/obsidian-app";
import { PLUGIN_DIST } from "./helpers/paths";

let ctx: ObsidianTestContext;

test.describe("Debug", () => {
  test.setTimeout(60000);

  test.beforeAll(async () => {
    ctx = await launchObsidian(PLUGIN_DIST);
  });

  test.afterAll(async () => {
    if (ctx) await closeObsidian(ctx);
  });

  test("check plugin state step by step", async () => {
    const { page } = ctx;

    console.log("[1] Waiting for workspace...");
    await page.waitForSelector(".workspace", { timeout: 15000 });
    console.log("[1] Workspace found");

    console.log("[2] Checking SC plugin...");
    const scState = await page.evaluate(() => {
      const sc = (window as any).app?.plugins?.plugins?.["smart-connections"];
      if (!sc) return "SC plugin not found";
      const env = sc.env ?? sc.smart_env;
      return {
        hasEnv: !!env,
        hasSmartBlocks: !!env?.smart_blocks,
        hasSmartSources: !!env?.smart_sources,
      };
    });
    console.log("[2] SC state:", JSON.stringify(scState));

    console.log("[3] Checking our plugin...");
    const ourState = await page.evaluate(() => {
      const plugin = (window as any).app?.plugins?.plugins?.["sc-block-explorer"];
      if (!plugin) return "Plugin not found";
      return {
        hasBridge: !!plugin.bridge,
        bridgeIsReady: plugin.bridge?.isReady,
        bridgeEnv: !!plugin.bridge?.env,
      };
    });
    console.log("[3] Our plugin state:", JSON.stringify(ourState));

    // Wait a bit and re-check (bridge init has 3s delay + retries)
    console.log("[4] Waiting 10s for bridge init...");
    await page.waitForTimeout(10000);

    const ourState2 = await page.evaluate(() => {
      const plugin = (window as any).app?.plugins?.plugins?.["sc-block-explorer"];
      if (!plugin) return "Plugin not found";
      return {
        hasBridge: !!plugin.bridge,
        bridgeIsReady: plugin.bridge?.isReady,
        bridgeEnv: !!plugin.bridge?.env,
      };
    });
    console.log("[4] Our plugin state after wait:", JSON.stringify(ourState2));

    // Check console for SCBE logs
    const logs = await page.evaluate(() => {
      return (window as any).__scbeLogs ?? "no logs captured";
    });
    console.log("[5] SCBE logs:", logs);
  });
});
