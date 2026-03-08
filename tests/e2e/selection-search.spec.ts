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

  // Inject a mock embed model if one doesn't exist in the test vault's SC env.
  // This returns the vec of the first block with an embedding, so nearest()
  // will return real results from the pre-indexed vault.
  await page.evaluate(() => {
    const sc = (window as any).app?.plugins?.plugins?.["smart-connections"];
    const env = sc?.env ?? sc?.smart_env;
    if (env && !env.smart_embed_model) {
      // Grab a real vec from an existing block to use as mock embed output
      let sampleVec: number[] | null = null;
      if (env.smart_blocks?.items) {
        for (const block of Object.values(env.smart_blocks.items) as any[]) {
          const vec = block?.vec ?? block?.data?.vec;
          if (vec && Array.isArray(vec) && vec.length > 0) {
            sampleVec = vec;
            break;
          }
        }
      }
      if (sampleVec) {
        const mockVec = sampleVec;
        env.smart_embed_model = {
          embed: async (_opts: any) => [{ vec: mockVec }],
        };
      }
    }
  });
});

test.afterAll(async () => {
  if (ctx) await closeObsidian(ctx);
});

test.describe("Selection Search", () => {
  test("selection-based search shows 'Selected:' in header", async () => {
    const { page } = ctx;

    await openNote(page, "Note Alpha");
    await dismissNotices(page);

    // Use CM6 dispatch to reliably select text in Live Preview mode.
    // editor.setSelection is unreliable because properties widget offsets lines.
    const selected = await page.evaluate(() => {
      const app = (window as any).app;
      const view = app.workspace.activeLeaf?.view;
      if (!view?.editor) return null;
      const cm = (view.editor as any).cm;
      if (!cm) return null;

      const doc = cm.state.doc.toString();
      const idx = doc.indexOf("Machine learning");
      if (idx === -1) return null;

      const end = Math.min(idx + 60, doc.length);
      cm.dispatch({ selection: { anchor: idx, head: end } });

      return view.editor.getSelection();
    });

    expect(selected).toBeTruthy();

    await triggerConnectionsCommand(page);
    await page.waitForSelector(SEL.connectionsView, { timeout: 15000 });

    await expect(page.locator(SEL.sourceKey)).toContainText("Selected:");
  });

  test("no selection falls back to block key in header", async () => {
    const { page } = ctx;

    await openNote(page, "Note Alpha");
    await dismissNotices(page);

    // Clear any selection and place cursor
    await page.evaluate(() => {
      const app = (window as any).app;
      const view = app.workspace.activeLeaf?.view;
      if (view?.editor) {
        view.editor.setCursor({ line: 5, ch: 0 });
      }
    });
    await page.waitForTimeout(300);

    await triggerConnectionsCommand(page);
    await page.waitForSelector(SEL.connectionsView, { timeout: 15000 });

    await expect(page.locator(SEL.sourceKey)).toContainText("Note Alpha");
  });
});
