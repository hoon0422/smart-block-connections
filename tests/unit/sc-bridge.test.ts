import { describe, it, expect, vi, beforeEach } from "vitest";
import { SCBridgeService } from "../../src/services/sc-bridge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp(scPlugin?: any): any {
  return {
    plugins: {
      plugins: scPlugin ? { "smart-connections": scPlugin } : {},
    },
  };
}

function makeEnv(overrides: Partial<{ smart_blocks: any; smart_sources: any; smart_embed_model: any }> = {}): any {
  return {
    smart_blocks: overrides.smart_blocks ?? { items: {} },
    smart_sources: overrides.smart_sources ?? { items: {} },
    smart_embed_model: overrides.smart_embed_model ?? null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isReady
// ---------------------------------------------------------------------------

describe("SCBridgeService.isReady", () => {
  it("returns false before init is called", () => {
    const service = new SCBridgeService(makeApp());
    expect(service.isReady).toBe(false);
  });

  it("returns false after failed init (no SC plugin)", () => {
    const service = new SCBridgeService(makeApp());
    service.init();
    expect(service.isReady).toBe(false);
  });

  it("returns true after successful init with smart_blocks present", () => {
    const env = makeEnv();
    const app = makeApp({ env });
    const service = new SCBridgeService(app);
    service.init();
    expect(service.isReady).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// init()
// ---------------------------------------------------------------------------

describe("SCBridgeService.init()", () => {
  it("returns false when smart-connections plugin is not present", () => {
    const service = new SCBridgeService(makeApp());
    expect(service.init()).toBe(false);
  });

  it("returns false when SC plugin has no env", () => {
    const app = makeApp({ manifest: { version: "1.0.0" } }); // plugin without env
    const service = new SCBridgeService(app);
    expect(service.init()).toBe(false);
  });

  it("returns true when SC plugin exposes env with smart_blocks", () => {
    const env = makeEnv();
    const app = makeApp({ env });
    const service = new SCBridgeService(app);
    expect(service.init()).toBe(true);
  });

  it("also accepts smart_env property on SC plugin", () => {
    const env = makeEnv();
    const app = makeApp({ smart_env: env });
    const service = new SCBridgeService(app);
    expect(service.init()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// findConnections()
// ---------------------------------------------------------------------------

describe("SCBridgeService.findConnections()", () => {
  const vec = [0.1, 0.2, 0.3];

  function makeBridge(nearestResult: any[]): SCBridgeService {
    const nearest = vi.fn().mockResolvedValue(nearestResult);
    const env = makeEnv({
      smart_blocks: { nearest },
      smart_sources: { nearest },
    });
    const app = makeApp({ env });
    const service = new SCBridgeService(app);
    service.init();
    return service;
  }

  it("calls nearest() with the provided vec and results_count", async () => {
    const nearest = vi.fn().mockResolvedValue([]);
    const env = makeEnv({ smart_blocks: { nearest } });
    const app = makeApp({ env });
    const service = new SCBridgeService(app);
    service.init();

    await service.findConnections(vec, { resultType: "blocks", limit: 10, minScore: 0 });

    expect(nearest).toHaveBeenCalledWith(vec, { results_count: 10 });
  });

  it("maps raw nearest results to ConnectionResult[]", async () => {
    const raw = [
      { item: { key: "note.md#Intro", path: "note.md", content: "Hello world" }, score: 0.87 },
      { item: { key: "note.md#Methods", path: "note.md", content: "We used..." }, score: 0.62 },
    ];
    const bridge = makeBridge(raw);

    const results = await bridge.findConnections(vec, { resultType: "blocks", limit: 5, minScore: 0 });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ key: "note.md#Intro", path: "note.md", score: 0.87 });
    expect(results[1]).toMatchObject({ key: "note.md#Methods", score: 0.62 });
  });

  it("filters out results below minScore threshold", async () => {
    const raw = [
      { item: { key: "note.md#Intro", path: "note.md", content: "" }, score: 0.87 },
      { item: { key: "note.md#Old", path: "note.md", content: "" }, score: 0.30 },
    ];
    const bridge = makeBridge(raw);

    const results = await bridge.findConnections(vec, { resultType: "blocks", limit: 10, minScore: 0.5 });

    expect(results).toHaveLength(1);
    expect(results[0].key).toBe("note.md#Intro");
  });

  it("returns empty array when collection (smartBlocks) is missing", async () => {
    const env = makeEnv({ smart_blocks: undefined as any });
    const app = makeApp({ env });
    const service = new SCBridgeService(app);
    service.init();

    const results = await service.findConnections(vec, { resultType: "blocks", limit: 5, minScore: 0 });

    expect(results).toEqual([]);
  });

  it("uses smartSources collection when resultType is 'sources'", async () => {
    const nearest = vi.fn().mockResolvedValue([]);
    const env = makeEnv({ smart_sources: { nearest } });
    const app = makeApp({ env });
    const service = new SCBridgeService(app);
    service.init();

    await service.findConnections(vec, { resultType: "sources", limit: 5, minScore: 0 });

    expect(nearest).toHaveBeenCalled();
  });

  it("truncates content to 300 characters", async () => {
    const longContent = "a".repeat(500);
    const raw = [{ item: { key: "note.md#A", path: "note.md", content: longContent }, score: 0.9 }];
    const bridge = makeBridge(raw);

    const results = await bridge.findConnections(vec, { resultType: "blocks", limit: 5, minScore: 0 });

    expect(results[0].content.length).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// embedText()
// ---------------------------------------------------------------------------

describe("SCBridgeService.embedText()", () => {
  it("delegates to embed model and returns the vec", async () => {
    const expectedVec = [0.1, 0.2, 0.3];
    const embed = vi.fn().mockResolvedValue([{ vec: expectedVec }]);
    const env = makeEnv({ smart_embed_model: { embed } });
    const app = makeApp({ env });
    const service = new SCBridgeService(app);
    service.init();

    const result = await service.embedText("hello world");

    expect(embed).toHaveBeenCalledWith({ input: ["hello world"] });
    expect(result).toEqual(expectedVec);
  });

  it("also handles embed result in data[0].vec shape", async () => {
    const expectedVec = [0.4, 0.5, 0.6];
    const embed = vi.fn().mockResolvedValue({ data: [{ vec: expectedVec }] });
    const env = makeEnv({ smart_embed_model: { embed } });
    const app = makeApp({ env });
    const service = new SCBridgeService(app);
    service.init();

    const result = await service.embedText("test");

    expect(result).toEqual(expectedVec);
  });

  it("throws when smart_embed_model is not available", async () => {
    const env = makeEnv({ smart_embed_model: null });
    const app = makeApp({ env });
    const service = new SCBridgeService(app);
    service.init();

    await expect(service.embedText("hello")).rejects.toThrow("smart_embed_model not available");
  });
});
