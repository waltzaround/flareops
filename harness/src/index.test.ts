vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));
vi.mock("./budget", () => ({
  Budget: class {}, ControlError: class extends Error {}, MODEL: "@cf/model/test",
  limitsSchema: { parse: (x: unknown) => x },
  budget: () => ({ acquire: async () => true, release: vi.fn(), reserve: async () => true, settle: vi.fn(), usage: async () => ({ inputTokens: 0, outputTokens: 0, estimatedMicrousd: 0, reservedMicrousd: 0 }) }),
}));
vi.mock("isomorphic-git", () => ({ listServerRefs: vi.fn() }));
vi.mock("isomorphic-git/http/web", () => ({ default: {} }));
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@cloudflare/computer", () => ({ WorkspaceProxy: class {} }));
vi.mock("@cloudflare/computer/tools", () => ({ createAITools: () => ({}) }));
vi.mock("workers-ai-provider", () => ({ createWorkersAI: () => () => ({}) }));
vi.mock("ai", () => ({
  generateText: vi.fn(),
  stepCountIs: () => ({}),
  tool: (x: unknown) => x,
}));
vi.mock("./computer", () => ({
  Computer: class {
    ctx: any;
    env: any;
    ws: any;
    shutdown = vi.fn();
    constructor(ctx: any, env: any) {
      this.ctx = ctx;
      this.env = env;
      this.ws = {};
    }
  },
}));
vi.mock("./repositories", () => ({
  createRepository: vi.fn(),
  credentials: vi.fn(),
  push: vi.fn(),
  refs: vi.fn(),
}));
import worker, { Project, Agent } from "./index";
import type { Env } from "./env";
import { createRepository, push, refs } from "./repositories";
function state() {
  const values = new Map();
  return {
    id: { toString: () => "object" },
    storage: {
      get: async (k: string) => structuredClone(values.get(k)),
      put: async (k: string | object, value?: unknown) => {
        if (typeof k === "string") values.set(k, structuredClone(value));
        else
          Object.entries(k).forEach(([a, b]) =>
            values.set(a, structuredClone(b)),
          );
      },
      delete: async (k: string) => values.delete(k),
      setAlarm: vi.fn(),
    },
    blockConcurrencyWhile: async (fn: () => unknown) => fn(),
  } as any;
}
beforeEach(() => vi.clearAllMocks());
describe("authenticated routing", () => {
  const env = {
    ACCOUNT_ID: "a".repeat(32),
    HARNESS_TOKEN: "secret",
    PROJECTS: { get: vi.fn(), idFromName: vi.fn() },
  } as unknown as Env;
  it("rejects missing credentials and another account before touching storage", async () => {
    expect(
      (await worker.fetch(new Request("https://backend/health"), env)).status,
    ).toBe(401);
    expect(
      (
        await worker.fetch(
          new Request("https://backend/health", {
            headers: {
              Authorization: "Bearer secret",
              "X-FlareOps-Account": "other",
            },
          }),
          env,
        )
      ).status,
    ).toBe(403);
    expect(env.PROJECTS.get).not.toHaveBeenCalled();
  });
});
describe("durable project state", () => {
  const env = {
    MODEL: "@cf/model/test",
    AGENTS: { idFromName: (s: string) => s, get: () => ({ cancel: vi.fn() }) },
  } as unknown as Env;
  it("deduplicates retries and refuses overlapping runs", async () => {
    const p = new Project(state(), env);
    const id = crypto.randomUUID();
    const input = {
      requestId: id,
      provider: "cloudflare" as const,
      repository: "artifacts" as const,
      prompt: "Build an app",
    };
    await p.start(input, crypto.randomUUID());
    expect((await p.start(input, crypto.randomUUID())).id).toBe(id);
    await expect(
      p.start(
        { ...input, requestId: crypto.randomUUID() },
        crypto.randomUUID(),
      ),
    ).rejects.toThrow();
    await p.cancel();
    expect((await p.status())?.status).toBe("cancelled");
  });
  it("refuses merging when main moved after review", async () => {
    const ctx = state();
    const p = new Project(ctx, env);
    await ctx.storage.put("run", {
      id: "run",
      status: "review",
      reviewHead: "approved",
      base: "original",
      repo: { defaultBranch: "main" },
    });
    vi.mocked(refs).mockResolvedValue({ "refs/heads/main": "new-main" });
    await expect(p.approve("approved")).rejects.toThrow("Main branch changed");
    expect(push).not.toHaveBeenCalled();
  });
  it("records cancellation durably for an idle agent", async () => {
    const ctx = state();
    const a = new Agent(ctx, env);
    await ctx.storage.put("job", { result: { status: "running" } });
    await a.cancel();
    expect((await a.status())?.status).toBe("cancelled");
    expect(await ctx.storage.get("cancelled")).toBe(true);
  });
});

describe("agent execution checkpoint", () => {
  it("persists a completed model turn and only publishes the assigned agent branch", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValue({
      response: { messages: [{ role: "assistant", content: "Implemented" }] },
      toolCalls: [],
      text: "Implemented",
      totalUsage: { totalTokens: 42 },
    } as any);
    const ctx = state();
    const repo = {
      host: "artifacts",
      remote:
        "https://account.artifacts.cloudflare.net/git/default/project.git",
      name: "project",
      defaultBranch: "main",
    };
    const a = new Agent(ctx, { AI: {} } as Env);
    (a as any).ws = {
      git: {
        add: vi.fn(),
        diff: vi.fn().mockResolvedValue("changed"),
        commit: vi.fn(),
      },
    };
    await ctx.storage.put("job", {
      repo,
      base: "base",
      branch: "agents/run/0",
      prompt: "Build",
      model: "@cf/test/model",
      assignment: "Implement",
      initialized: true,
      started: Date.now(),
      messages: [],
      result: {
        status: "running",
        branch: "agents/run/0",
        steps: 0,
        tokens: 0,
      },
    });
    await a.alarm();
    expect(await a.status()).toMatchObject({
      status: "complete",
      steps: 1,
      tokens: 42,
    });
    expect((a as any).shutdown).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      repo,
      "agents/run/0",
    );
    expect((await ctx.storage.get("job")).messages).toHaveLength(1);
  });
});

describe("GitHub import", () => {
  it("copies and verifies branches and tags without writing to GitHub", async () => {
    const { listServerRefs } = await import("isomorphic-git");
    const sourceRefs = [
      { ref: "refs/heads/develop", oid: "a".repeat(40) },
      { ref: "refs/tags/v1", oid: "b".repeat(40) },
    ];
    vi.mocked(listServerRefs).mockResolvedValue(sourceRefs);
    const target = {
      host: "artifacts" as const,
      name: "target",
      remote: "https://account.artifacts.cloudflare.net/git/default/target.git",
      defaultBranch: "develop",
    };
    vi.mocked(createRepository).mockResolvedValue(target);
    vi.mocked(refs).mockResolvedValue(
      Object.fromEntries(sourceRefs.map((r) => [r.ref, r.oid])),
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ default_branch: "develop", size: 1 }),
        ),
    );
    try {
      const ctx = state();
      const env = {
        MODEL: "@cf/test/model",
        ARTIFACTS: { get: vi.fn().mockRejectedValue({ code: "NOT_FOUND" }) },
      } as unknown as Env;
      const p = new Project(ctx, env);
      const clone = vi.fn();
      (p as any).ws = {
        fs: { rm: vi.fn() },
        git: { clone, updateRef: vi.fn() },
      };
      await p.importProject(
        {
          url: "https://github.com/owner/repo",
          requestId: crypto.randomUUID(),
        },
        crypto.randomUUID(),
      );
      await p.alarm();
      expect((await p.status())?.status).toBe("imported");
      expect(clone).toHaveBeenCalledWith(
        expect.objectContaining({
          depth: 0,
          singleBranch: false,
          noTags: false,
        }),
      );
      expect(createRepository).toHaveBeenCalledWith(
        env,
        "artifacts",
        expect.any(String),
        undefined,
        "develop",
      );
      expect(push).toHaveBeenCalledTimes(2);
      for (const call of vi.mocked(push).mock.calls)
        expect(call[2].host).toBe("artifacts");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('terminal agent cleanup', () => {
  it('retries shutdown after a terminal alarm without calling the model', async () => {
    const { generateText } = await import('ai');
    const ctx = state(); const agent = new Agent(ctx, {} as Env);
    await ctx.storage.put('job', { result: { status: 'failed' } });
    await agent.alarm();
    expect((agent as any).shutdown).toHaveBeenCalledOnce();
    expect(generateText).not.toHaveBeenCalled();
  });
  it('shuts down after a provider failure and clears the running guard', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockRejectedValue(Error('provider timed out'));
    const ctx = state(); const agent = new Agent(ctx, { AI: {} } as Env);
    await ctx.storage.put('job', { initialized: true, started: Date.now(), runKey: 'run', model: '@cf/model/test', messages: [], result: { status: 'running', steps: 0, tokens: 0 } });
    await agent.alarm();
    expect((await agent.status())?.status).toBe('failed');
    expect((agent as any).shutdown).toHaveBeenCalledOnce();
    expect((agent as any).running).toBe(false);
  });
});

describe('review preview artifact', () => {
  it('reads the committed bundle from the reviewed tree, not dirty workspace files', async () => {
    const ctx = state(); const project = new Project(ctx, {} as Env);
    await ctx.storage.put('run', { id: 'run', status: 'review', reviewHead: 'reviewed', agents: [], events: [] });
    (project as any).ws = { git: { lsTree: vi.fn().mockResolvedValue([]), show: vi.fn().mockResolvedValue({ tree: 'tree' }), catFile: vi.fn().mockResolvedValue({ bytes: new TextEncoder().encode('export default {};') }) } };
    expect(await project.previewArtifact()).toEqual({ head: 'reviewed', code: 'export default {};', resources: [] });
    expect((project as any).ws.git.catFile).toHaveBeenCalledWith({ dir: '/workspace', oid: 'tree', filepath: '.flareops/preview/worker.js' });
  });
  it('rejects unfinished runs and missing bundles', async () => {
    const ctx = state(); const project = new Project(ctx, {} as Env);
    await ctx.storage.put('run', { id: 'run', status: 'running', agents: [], events: [] });
    await expect(project.previewArtifact()).rejects.toThrow('completed review');
    await ctx.storage.put('run', { id: 'run', status: 'review', reviewHead: 'reviewed', agents: [], events: [] });
    (project as any).ws = { git: { lsTree: vi.fn().mockResolvedValue([]), show: vi.fn().mockRejectedValue(Error('missing')) } };
    await expect(project.previewArtifact()).rejects.toThrow('no preview bundle');
  });
});
