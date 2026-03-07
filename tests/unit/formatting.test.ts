import { describe, it, expect } from "vitest";
import { formatResultsAsMarkdown } from "../../src/utils/formatting";
import type { ConnectionResult } from "../../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(key: string, score: number): ConnectionResult {
  return { key, path: key.split("#")[0], score, content: "" };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("formatResultsAsMarkdown()", () => {
  it("contains the section heading with the sourceKey", () => {
    const results = [makeResult("note.md#Intro", 0.87)];
    const output = formatResultsAsMarkdown("note.md#Source", results);

    expect(output).toContain("## Connections for note.md#Source");
  });

  it("formats connection scores as percentages with one decimal place", () => {
    const results = [
      makeResult("note.md#Intro", 0.87),
      makeResult("note.md#Methods", 0.62),
    ];
    const output = formatResultsAsMarkdown("note.md#Source", results);

    expect(output).toContain("87.0%");
    expect(output).toContain("62.0%");
  });

  it("formats keys as Obsidian wikilinks", () => {
    const results = [makeResult("note.md#Intro", 0.87)];
    const output = formatResultsAsMarkdown("note.md#Source", results);

    expect(output).toContain("[[note.md#Intro]]");
  });

  it("numbered list starts at 1", () => {
    const results = [
      makeResult("note.md#A", 0.9),
      makeResult("note.md#B", 0.8),
    ];
    const output = formatResultsAsMarkdown("note.md#Source", results);

    expect(output).toMatch(/^1\. /m);
    expect(output).toMatch(/^2\. /m);
  });

  it("handles empty results — output contains 'No connections found'", () => {
    const output = formatResultsAsMarkdown("note.md#Source", []);

    expect(output).toContain("No connections found");
  });

  it("empty results still contain the section heading", () => {
    const output = formatResultsAsMarkdown("note.md#Source", []);

    expect(output).toContain("## Connections for note.md#Source");
  });

  it("formats multiple results with correct wikilinks and scores", () => {
    const results = [
      makeResult("note.md#Intro", 0.87),
      makeResult("note.md#Methods", 0.62),
    ];
    const output = formatResultsAsMarkdown("note.md#Source", results);

    expect(output).toContain("[[note.md#Intro]]");
    expect(output).toContain("[[note.md#Methods]]");
    expect(output).toContain("87.0%");
    expect(output).toContain("62.0%");
  });

  it("each result line follows pattern: N. [[key]] (score%)", () => {
    const results = [makeResult("note.md#Intro", 0.87)];
    const output = formatResultsAsMarkdown("note.md#Source", results);

    expect(output).toContain("1. [[note.md#Intro]] (87.0%)");
  });
});
