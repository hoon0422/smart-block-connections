import type { Editor, TFile } from "obsidian";
import type { ResolvedBlock } from "../types";

export class BlockResolver {
  constructor(private bridge: any) {}

  resolve(editor: Editor, file: TFile): ResolvedBlock | null {
    const cursorLine = editor.getCursor().line;
    const filePath = file.path;

    let blocks: any[] = [];

    // Option A: get blocks from the source entry
    const source = this.bridge.smartSources?.get?.(filePath);
    if (source?.blocks) {
      try {
        const entries = Object.entries(source.blocks);
        blocks = entries.map(([, block]) => block);
      } catch {
        // fall through to Option B
      }
    }

    // Option B: filter smartBlocks.items by key prefix
    if (blocks.length === 0 && this.bridge.smartBlocks?.items) {
      const items = this.bridge.smartBlocks.items;
      blocks = Object.values(items).filter((block: any) => {
        const key: string = block?.key ?? block?.data?.key ?? "";
        return key.startsWith(filePath);
      });
    }

    if (blocks.length === 0) return null;

    for (const block of blocks) {
      const lines: [number, number] | undefined =
        block?.data?.lines ?? block?.lines;

      if (!lines || lines.length < 2) continue;

      const [lineStart, lineEnd] = lines;

      if (cursorLine >= lineStart && cursorLine <= lineEnd) {
        const key: string = block?.key ?? block?.data?.key ?? "";
        const vec: number[] | null = block?.vec ?? block?.data?.vec ?? null;
        const content: string | undefined =
          block?.content ?? block?.data?.content;

        return {
          key,
          vec,
          path: filePath,
          lineStart,
          lineEnd,
          content,
        };
      }
    }

    return null;
  }
}
