import { App } from "obsidian";
import type { ConnectionResult, FindConnectionsOptions } from "../types";

export class SCBridgeService {
  private env: any;

  constructor(private app: App) {}

  // Get SC plugin reference. Must be called after SC has fully initialized.
  init(): boolean {
    try {
      const scPlugin = (this.app as any).plugins?.plugins?.["smart-connections"];
      if (!scPlugin) {
        console.log("SCBE: smart-connections plugin not found");
        return false;
      }

      if (scPlugin.manifest?.version) {
        console.log("SCBE: smart-connections version", scPlugin.manifest.version);
      }

      this.env = scPlugin.env ?? scPlugin.smart_env;
      if (!this.env) {
        console.log("SCBE: smart-connections env not available yet");
        return false;
      }

      console.log("SCBE: initialized successfully");
      return true;
    } catch (e) {
      console.log("SCBE: init failed", e);
      return false;
    }
  }

  get isReady(): boolean {
    return !!this.env?.smart_blocks;
  }

  get smartBlocks(): any {
    return this.env?.smart_blocks;
  }

  get smartSources(): any {
    return this.env?.smart_sources;
  }

  async findConnections(vec: number[], opts: FindConnectionsOptions): Promise<ConnectionResult[]> {
    try {
      const collection = opts.resultType === "blocks" ? this.smartBlocks : this.smartSources;
      if (!collection) {
        console.log("SCBE: collection not available for resultType", opts.resultType);
        return [];
      }

      const raw = await collection.nearest(vec, { results_count: opts.limit });
      if (!Array.isArray(raw)) {
        console.log("SCBE: nearest() did not return an array");
        return [];
      }

      const mapped: ConnectionResult[] = raw.map((r: any) => ({
        key: r.item?.key ?? r.key ?? "",
        path: r.item?.path ?? r.path ?? "",
        score: r.score ?? r.sim ?? 0,
        content: ((r.item?.content ?? r.content ?? "") as string).slice(0, 300),
      }));

      return mapped.filter((r) => r.score >= opts.minScore);
    } catch (e) {
      console.log("SCBE: findConnections failed", e);
      return [];
    }
  }

  async embedText(text: string): Promise<number[]> {
    // SC stores the embed model on collections (smart_blocks.embed_model)
    // or on the env directly (smart_embed_model). Try both paths.
    const model =
      this.env?.smart_blocks?.embed_model ??
      this.env?.smart_sources?.embed_model ??
      this.env?.smart_embed_model;
    if (!model) {
      throw new Error("SCBE: smart_embed_model not available");
    }

    if (!model.is_loaded) {
      await model.load();
    }

    const result = await model.embed({ embed_input: text });
    const vec = result?.vec ?? result?.[0]?.vec ?? result?.data?.[0]?.vec;
    if (!vec) {
      throw new Error("SCBE: embed result missing vec");
    }
    return vec;
  }
}
