import type { App, Editor, TFile, WorkspaceLeaf } from "obsidian";

/**
 * A single connection result from the Smart Connections nearest() search.
 * Field names use our normalized form; SCBridgeService maps SC's internal
 * property names (which may vary across versions) to these.
 */
export interface ConnectionResult {
  key: string;
  path: string;
  score: number;
  content: string;
}

/**
 * A resolved block at the editor's cursor position, with its
 * pre-computed embedding vector (if available).
 */
export interface ResolvedBlock {
  key: string;
  vec: number[] | null;
  path: string;
  lineStart?: number;
  lineEnd?: number;
  content?: string;
  source?: "selection" | "block";
}

/**
 * Plugin settings persisted to data.json.
 */
export interface SCBESettings {
  resultType: "blocks" | "sources";
  resultLimit: number;
  minScore: number;
}

export const DEFAULT_SETTINGS: SCBESettings = {
  resultType: "blocks",
  resultLimit: 20,
  minScore: 0.0,
};

/**
 * Options passed to SCBridgeService.findConnections().
 */
export interface FindConnectionsOptions {
  resultType: "blocks" | "sources";
  limit: number;
  minScore: number;
}
