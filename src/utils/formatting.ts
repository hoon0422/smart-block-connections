import type { ConnectionResult } from "../types";

export function formatResultsAsMarkdown(
  sourceKey: string,
  results: ConnectionResult[]
): string {
  if (results.length === 0) {
    return `## Connections for ${sourceKey}\n\nNo connections found.`;
  }

  const lines = [`## Connections for ${sourceKey}\n`];

  results.forEach((result, index) => {
    const score = (result.score * 100).toFixed(1);
    lines.push(`${index + 1}. [[${result.key}]] (${score}%)`);
  });

  return lines.join("\n");
}
