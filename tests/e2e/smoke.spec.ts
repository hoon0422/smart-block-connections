import { test, expect } from "@playwright/test";
import {
  launchObsidian,
  closeObsidian,
  ObsidianTestContext,
} from "./helpers/obsidian-app";
import { waitForObsidianReady, openNote } from "./helpers/wait-helpers";
import { SEL } from "./helpers/selectors";
import { PLUGIN_DIST } from "./helpers/paths";

let ctx: ObsidianTestContext;

test.describe("Smoke Test", () => {
  test.beforeAll(async () => {
    ctx = await launchObsidian(PLUGIN_DIST);
  });

  test.afterAll(async () => {
    if (ctx) await closeObsidian(ctx);
  });

  test("Obsidian launches and shows workspace", async () => {
    const { page } = ctx;
    await waitForObsidianReady(page);

    await page.screenshot({ path: "tests/e2e/screenshots/smoke-ready.png" });

    const workspace = page.locator(SEL.workspace);
    await expect(workspace).toBeVisible();

    // Check plugins loaded
    const pluginInfo = await page.evaluate(() => {
      const app = (window as any).app;
      if (!app) return "No app object";
      const plugins = app.plugins?.plugins;
      return {
        pluginNames: Object.keys(plugins ?? {}),
        hasSC: !!plugins?.["smart-connections"],
        hasOurs: !!plugins?.["sc-block-explorer"],
      };
    });
    console.log("Plugin info:", JSON.stringify(pluginInfo, null, 2));
    expect(pluginInfo).toHaveProperty("hasSC", true);
    expect(pluginInfo).toHaveProperty("hasOurs", true);
  });

  test("can open a note in the editor", async () => {
    const { page } = ctx;
    await openNote(page, "Note Alpha");

    await page.screenshot({ path: "tests/e2e/screenshots/smoke-editor.png" });

    const editor = page.locator(SEL.editor);
    await expect(editor).toBeVisible();

    const activeFile = await page.evaluate(() => {
      return (window as any).app?.workspace?.getActiveFile()?.basename;
    });
    expect(activeFile).toBe("Note Alpha");
  });

  test("SC environment status", async () => {
    const { page } = ctx;
    const scInfo = await page.evaluate(() => {
      const sc = (window as any).app?.plugins?.plugins?.["smart-connections"];
      const env = sc?.env ?? sc?.smart_env;
      if (!env) return { status: "no env" };
      return {
        status: "ok",
        hasSmartBlocks: !!env.smart_blocks,
        hasSmartSources: !!env.smart_sources,
        blockCount: Object.keys(env.smart_blocks?.items ?? {}).length,
        sourceCount: Object.keys(env.smart_sources?.items ?? {}).length,
        hasEmbedModel: !!env.smart_embed_model,
      };
    });
    console.log("SC env info:", JSON.stringify(scInfo, null, 2));
  });
});
