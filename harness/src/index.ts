import { reviewDiff, readPreviewBundle, readPreviewResources } from "./preview";
import { budget, limitsSchema, ControlError, MODEL } from "./budget";
export { Budget } from "./budget";
import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { createAITools } from "@cloudflare/computer/tools";
import { z } from "zod";
import { Computer } from "./computer";
import type { Env } from "./env";
import {
  startSchema,
  safeRemote,
  terminal,
  type Repository,
  type Run,
  type AgentResult,
} from "./contracts";
import { createRepository, credentials, push, refs } from "./repositories";
export { WorkspaceProxy } from "@cloudflare/computer";
const gitDir = "/workspace";
const now = () => new Date().toISOString();
const githubSource = z
  .string()
  .url()
  .refine(
    (s) => /^https:\/\/github\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9._-]+$/.test(s),
    "Use a GitHub repository URL without credentials or query parameters.",
  );
const importSchema = z.object({
  url: githubSource,
  requestId: z.string().uuid(),
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // One authenticated backend per Cloudflare account. Never trust a client account ID alone.
    if (
      !env.HARNESS_TOKEN ||
      request.headers.get("Authorization") !== `Bearer ${env.HARNESS_TOKEN}`
    )
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (request.headers.get("X-FlareOps-Account") !== env.ACCOUNT_ID)
      return Response.json({ error: "Account mismatch" }, { status: 403 });
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/health")
      return Response.json({
        accountId: env.ACCOUNT_ID,
        version: 1,
        cloudflareAI: true,
        githubPrivate: !!env.GITHUB_TOKEN,
      });
    if (path === "/budget" && ["GET", "POST"].includes(request.method)) {
      try {
        if (request.method === "GET")
          return Response.json(await budget(env).status());
        const raw = await request.text();
        if (raw.length > 1000) throw Error("Too large");
        return Response.json(
          await budget(env).configure(limitsSchema.parse(JSON.parse(raw))),
        );
      } catch {
        return Response.json(
          { error: "Invalid budget settings" },
          { status: 400 },
        );
      }
    }
    const match = path.match(
      /^\/projects\/([a-f0-9-]{36})\/(start|import|status|cancel|merge|preview-artifact)$/,
    );
    const profile = request.headers.get("X-FlareOps-Profile") || "";
    if (!match || !/^[\w-]{1,64}$/.test(profile))
      return Response.json({ error: "Invalid request" }, { status: 400 });
    if (
      request.method !==
      (["status", "preview-artifact"].includes(match[2]) ? "GET" : "POST")
    )
      return new Response(null, { status: 405 });
    const project = env.PROJECTS.get(
      env.PROJECTS.idFromName(`${profile}:${match[1]}`),
    );
    try {
      if (
        request.headers.get("Content-Length") &&
        Number(request.headers.get("Content-Length")) > 30000
      )
        throw new Error("Request too large");
      const raw = request.method === "POST" ? await request.text() : "{}";
      if (raw.length > 30000) throw new Error("Request too large");
      const body = JSON.parse(raw);
      const result =
        match[2] === "start"
          ? await project.start(startSchema.parse(body), match[1])
          : match[2] === "import"
            ? await project.importProject(importSchema.parse(body), match[1])
            : match[2] === "cancel"
              ? await project.cancel()
              : match[2] === "merge"
                ? await project.approve(
                    z
                      .object({
                        head: z.string().regex(/^[a-f0-9]{40}$/),
                        confirm: z.literal(true),
                      })
                      .parse(body).head,
                  )
                : match[2] === "preview-artifact"
                  ? await project.previewArtifact()
                  : await project.status();
      return Response.json(result);
    } catch (e) {
      // Avoid returning SDK errors that can contain request credentials or provider payloads.
      return Response.json(
        {
          error:
            e instanceof ControlError
              ? e.message
              : e instanceof z.ZodError
                ? "Invalid request fields."
                : "Operation could not complete. Check backend setup or refresh project status.",
        },
        { status: 400 },
      );
    }
  },
} satisfies ExportedHandler<Env>;

type AgentJob = {
  runKey: string;
  repo: Repository;
  base: string;
  branch: string;
  prompt: string;
  assignment: string;
  model: string;
  started: number;
  result: AgentResult;
  messages: ModelMessage[];
  initialized?: boolean;
};
export class Agent extends Computer {
  private running = false;
  private abort?: AbortController;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env, "AGENTS");
  }
  async start(job: Omit<AgentJob, "result" | "messages" | "started">) {
    if (await this.ctx.storage.get("job")) return;
    await this.ctx.storage.put<AgentJob>("job", {
      ...job,
      started: Date.now(),
      result: { branch: job.branch, status: "running", steps: 0, tokens: 0 },
      messages: [{ role: "user", content: job.prompt }],
    });
    await this.ctx.storage.setAlarm(Date.now() + 100);
  }
  async status() {
    return (await this.ctx.storage.get<AgentJob>("job"))?.result;
  }
  async cancel() {
    await this.ctx.storage.put("cancelled", true);
    this.abort?.abort();
    const job = await this.ctx.storage.get<AgentJob>("job");
    if (job && job.result.status === "running") {
      job.result.status = "cancelled";
      await this.ctx.storage.put("job", job);
    }
    await this.shutdown();
  }
  override async alarm() {
    if (this.running) {
      await this.ctx.storage.setAlarm(Date.now() + 120000);
      return;
    }
    const job = await this.ctx.storage.get<AgentJob>("job");
    if (!job || terminal(job.result.status)) {
      await this.shutdown();
      return;
    }
    this.running = true;
    this.abort = new AbortController();
    // Pre-arm recovery before any network operation. Tool calls may replay after a crash.
    await this.ctx.storage.setAlarm(Date.now() + 120000);
    try {
      if (await this.ctx.storage.get("cancelled")) {
        job.result.status = "cancelled";
        return;
      }
      if (
        job.result.steps >= 20 ||
        job.result.tokens >= 100000 ||
        Date.now() - job.started > 20 * 60000
      )
        throw new Error("Run limit reached");
      if (!job.initialized) {
        await this.ws.fs.rm(gitDir, { recursive: true, force: true });
        await this.ws.git.clone({
          dir: gitDir,
          url: job.repo.remote,
          ref: job.repo.defaultBranch,
          depth: 0,
          headers: await credentials(this.env, job.repo),
        });
        await this.ws.git.checkout({ dir: gitDir, ref: job.base });
        await this.ws.git.branch({ dir: gitDir, name: job.branch });
        await this.ws.git.checkout({ dir: gitDir, ref: job.branch });
        job.initialized = true;
        await this.ctx.storage.put("job", job);
      }
      const tools = createAITools({
        workspace: this.ws,
        read: { maxBytes: 16000, maxLines: 300 },
      });
      tools.exec = tool({
        description:
          "Run a command in /workspace. Use worker-shell for text operations, container-shell for npm, tests, or native binaries. Commands stop after 60 seconds. Do not read or change .git; repository operations are managed outside your tools.",
        inputSchema: z.object({
          command: z.string().max(8000),
          backend: z.enum(["worker-shell", "container-shell"]),
        }),
        execute: async ({ command, backend }) => {
          if (this.abort?.signal.aborted) throw new Error("Cancelled");
          using handle = await this.ws.runtime.exec(command, {
            backend,
            cwd: gitDir,
            encoding: "utf8",
          });
          if (this.abort?.signal.aborted) {
            await handle.kill();
            throw new Error("Cancelled");
          }
          const timer = setTimeout(() => {
            void handle.kill();
          }, 60000);
          const cancel = () => {
            void handle.kill();
          };
          this.abort?.signal.addEventListener("abort", cancel, { once: true });
          try {
            const r = await handle.result();
            return {
              exitCode: r.exitCode,
              stdout: r.stdout.slice(-16000),
              stderr: r.stderr.slice(-8000),
            };
          } finally {
            clearTimeout(timer);
            this.abort?.signal.removeEventListener("abort", cancel);
          }
        },
      });
      const call = crypto.randomUUID();
      if (!(await budget(this.env).reserve(job.runKey, call, job.model)))
        throw new ControlError(
          "AI budget exhausted, run lease expired, or model pricing unavailable.",
        );
      const ai = createWorkersAI({ binding: this.env.AI });
      const result = await generateText({
        model: ai(job.model as Parameters<typeof ai>[0]),
        system: `You are a coding agent working in /workspace. ${job.assignment} Implement the user's request, inspect existing code first, and run relevant tests. Do not deploy or alter repository remotes. Never claim tests passed unless a tool confirmed it. Finish with a concise summary.`,
        messages: job.messages,
        tools,
        stopWhen: stepCountIs(1),
        maxOutputTokens: 4096,
        maxRetries: 0,
        abortSignal: AbortSignal.any([
          this.abort.signal,
          AbortSignal.timeout(90000),
        ]),
      });
      const usage = result.totalUsage;
      if (usage.inputTokens !== undefined && usage.outputTokens !== undefined)
        await budget(this.env).settle(
          call,
          usage.inputTokens,
          usage.outputTokens,
        );
      // Missing usage or interrupted calls retain the full reservation conservatively.
      if (await this.ctx.storage.get("cancelled")) {
        job.result.status = "cancelled";
        return;
      }
      const messages = [...job.messages, ...result.response.messages];
      if (new TextEncoder().encode(JSON.stringify(messages)).length > 80000)
        throw new Error("Conversation storage limit reached");
      job.messages = messages;
      job.result.steps++;
      job.result.tokens += result.totalUsage.totalTokens || 0;
      if (!result.toolCalls.length) {
        await this.ws.git.add({ dir: gitDir, paths: ["."], all: true });
        const diff = await this.ws.git.diff({ dir: gitDir, ref: job.base });
        if (diff)
          await this.ws.git.commit({
            dir: gitDir,
            message: "Implement FlareOps agent assignment",
          });
        await push(this.env, this.ws, job.repo, job.branch);
        job.result.status = "complete";
        job.result.summary = result.text.slice(0, 8000);
      }
    } catch (error) {
      job.result.status = "failed";
      job.result.error =
        error instanceof ControlError
          ? error.message
          : "Agent stopped. A provider, tool, or run limit failed. Its workspace is retained.";
    } finally {
      try {
        if (await this.ctx.storage.get("cancelled"))
          job.result.status = "cancelled";
        await this.ctx.storage.put("job", job);
        if (job.result.status === "running")
          await this.ctx.storage.setAlarm(Date.now() + 1000);
        else await this.shutdown();
      } finally {
        this.running = false;
      }
    }
  }
}

export class Project extends Computer {
  private running = false;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env, "PROJECTS");
  }
  async status() {
    const run = (await this.ctx.storage.get<Run>("run")) || null;
    if (run) run.usage = await budget(this.env).usage(this.runKey(run.id));
    return run;
  }
  private runKey(id: string) {
    return `${this.ctx.id}:${id}`;
  }
  private async cleanup(run: Run) {
    await this.ctx.storage.setAlarm(Date.now() + 60000);
    if (["failed", "cancelled"].includes(run.status))
      await Promise.all(
        run.agents.map((_, i) => this.agent(run.id, i).cancel()),
      );
    await budget(this.env).release(this.runKey(run.id));
    await this.shutdown();
  }
  private async save(run: Run, message?: string) {
    if (message) run.events.push({ at: now(), message });
    run.events = run.events.slice(-100);
    await this.ctx.storage.put("run", run);
  }
  async start(input: z.infer<typeof startSchema>, projectId: string) {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (this.running)
        throw new ControlError("Wait for the current operation to stop.");
      const old = await this.status();
      if (old?.id === input.requestId) return old;
      if (
        old &&
        ["provisioning", "running", "review", "merging"].includes(old.status)
      )
        throw new Error("Finish the current run first");
      if (
        old?.status === "failed" &&
        (await this.ctx.storage.get("importSource"))
      )
        throw new Error("Retry the failed import first");
      if ((input.model || this.env.MODEL) !== MODEL)
        throw new ControlError("This model has no configured budget pricing.");
      if (!(await budget(this.env).acquire(this.runKey(input.requestId))))
        throw new ControlError(
          "Account concurrency limit reached. Wait for an active run to finish.",
        );
      const run: Run = {
        id: input.requestId,
        name: old?.name || "New project",
        prompt: input.prompt,
        model: input.model || this.env.MODEL,
        status: "provisioning",
        createdAt: now(),
        agents: [],
        events: [],
        repo: old?.repo,
      };
      await this.ctx.storage.delete("cancelled");
      await this.ctx.storage.put("projectId", projectId);
      await this.ctx.storage.delete("importSource");
      await this.save(run, "Run queued");
      await this.ctx.storage.setAlarm(Date.now() + 100);
      return run;
    });
  }
  async importProject(input: z.infer<typeof importSchema>, projectId: string) {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (this.running)
        throw new ControlError("Wait for the current operation to stop.");
      const old = await this.status();
      if (old?.id === input.requestId) return old;
      if (
        old &&
        !(
          old.status === "failed" &&
          (await this.ctx.storage.get("importSource")) === input.url
        )
      )
        throw new Error(
          "Import requires a new project or a failed import retry",
        );
      if (!(await budget(this.env).acquire(this.runKey(input.requestId))))
        throw new ControlError(
          "Account concurrency limit reached. Wait for an active run to finish.",
        );
      await this.ctx.storage.delete("cancelled");
      const run: Run = {
        id: input.requestId,
        name: input.url.split("/").pop()!,
        repo: old?.repo,
        prompt: "",
        model: this.env.MODEL,
        status: "provisioning",
        createdAt: now(),
        agents: [],
        events: [],
      };
      await this.ctx.storage.put({ projectId, importSource: input.url });
      await this.save(run, "GitHub import queued");
      await this.ctx.storage.setAlarm(Date.now() + 100);
      return run;
    });
  }
  async cancel() {
    await this.ctx.storage.put("cancelled", true);
    const run = await this.status();
    if (run && ["provisioning", "running"].includes(run.status)) {
      run.status = "cancelled";
      await this.save(run, "Cancellation requested");
      await Promise.all(
        run.agents.map((_, i) => this.agent(run.id, i).cancel()),
      );
    }
    if (run && !this.running) await this.cleanup(run);
    return this.status();
  }
  private agent(id: string, index: number) {
    return this.env.AGENTS.get(
      this.env.AGENTS.idFromName(`${this.ctx.id}:${id}:${index}`),
    );
  }
  override async alarm() {
    if (this.running) {
      await this.ctx.storage.setAlarm(Date.now() + 120000);
      return;
    }
    const run = await this.status();
    if (!run) return;
    if (!["provisioning", "running"].includes(run.status)) {
      await this.cleanup(run);
      return;
    }
    this.running = true;
    await this.ctx.storage.setAlarm(Date.now() + 120000);
    try {
      if (await this.ctx.storage.get("cancelled")) return;
      if (Date.now() - Date.parse(run.createdAt) > 25 * 60000)
        throw new ControlError("Project run time limit reached.");
      if (!(await budget(this.env).acquire(this.runKey(run.id))))
        throw new ControlError("Account concurrency limit reached.");
      if (run.status === "provisioning") {
        const source = await this.ctx.storage.get<string>("importSource");
        let sourceMetadata:
          { default_branch: string; size: number } | undefined;
        if (source) {
          const url = githubSource.parse(source);
          const path = new URL(url).pathname.replace(/\.git$/, "");
          const response = await fetch(`https://api.github.com/repos${path}`, {
            headers: {
              "User-Agent": "FlareOps",
              ...(this.env.GITHUB_TOKEN
                ? { Authorization: `Bearer ${this.env.GITHUB_TOKEN}` }
                : {}),
            },
            redirect: "error",
            signal: AbortSignal.timeout(30000),
          });
          if (!response.ok) throw new Error("GitHub access failed");
          sourceMetadata = (await response.json()) as {
            default_branch: string;
            size: number;
          };
          if (sourceMetadata.size > 100000)
            throw new Error("Repository too large for preview");
        }
        if (!run.repo) {
          const name = `flareops-${await this.ctx.storage.get<string>("projectId")}`;
          try {
            using existing = await this.env.ARTIFACTS.get(name);
            const info = await existing.info();
            run.repo = {
              host: "artifacts",
              name,
              remote: info.remote,
              defaultBranch: info.defaultBranch || "main",
            };
          } catch (e) {
            if ((e as { code?: string }).code !== "NOT_FOUND") throw e;
            run.repo = await createRepository(
              this.env,
              "artifacts",
              name,
              undefined,
              sourceMetadata?.default_branch || "main",
            );
          }
          await this.save(run, "Artifacts repository ready");
        }
        if (source) {
          const url = githubSource.parse(source);
          const [owner, rawName] = new URL(url).pathname.slice(1).split("/");
          const name = rawName.replace(/\.git$/, "");
          const metadata = sourceMetadata!;
          const repo: Repository = {
            host: "github",
            name,
            owner,
            remote: safeRemote(`${url.replace(/\.git$/, "")}.git`, "github"),
            defaultBranch: metadata.default_branch,
          };
          await this.ws.fs.rm(gitDir, { recursive: true, force: true });
          const headers = this.env.GITHUB_TOKEN
            ? await credentials(this.env, repo)
            : {};
          await this.ws.git.clone({
            dir: gitDir,
            url: repo.remote,
            ref: repo.defaultBranch,
            depth: 0,
            singleBranch: false,
            noTags: false,
            headers,
          });
          // Import all advertised branches and tags; never push to the GitHub source.
          const git = await import("isomorphic-git");
          const http = (await import("isomorphic-git/http/web")).default;
          const all = await git.listServerRefs({
            http,
            url: repo.remote,
            headers,
          });
          if (!all.some((r) => r.ref.startsWith("refs/heads/")))
            throw new Error("Repository has no branches");
          for (const ref of all.filter(
            (r) =>
              /^refs\/(heads|tags)\//.test(r.ref) && !r.ref.endsWith("^{}"),
          )) {
            await this.ws.git.updateRef({
              dir: gitDir,
              ref: ref.ref,
              value: ref.oid,
              force: true,
            });
            await push(this.env, this.ws, run.repo, ref.ref);
          }
          const copied = await refs(this.env, run.repo);
          for (const ref of all.filter(
            (r) =>
              /^refs\/(heads|tags)\//.test(r.ref) && !r.ref.endsWith("^{}"),
          ))
            if (copied[ref.ref] !== ref.oid)
              throw new Error("Import verification failed");
          run.repo.defaultBranch = repo.defaultBranch;
          run.status = "imported";
          await this.save(
            run,
            "GitHub branches and tags copied and verified. Source unchanged.",
          );
          return;
        }
        const remoteRefs = await refs(this.env, run.repo);
        await this.ws.fs.rm(gitDir, { recursive: true, force: true });
        if (!Object.keys(remoteRefs).length) {
          await this.ws.git.init({
            dir: gitDir,
            defaultBranch: run.repo.defaultBranch,
          });
          await this.ws.fs.writeFile(
            `${gitDir}/README.md`,
            `# FlareOps project\n\n${run.prompt}\n`,
          );
          await this.ws.fs.writeFile(
            `${gitDir}/.gitignore`,
            "node_modules/\ndist/\n.env\n.env.*\n",
          );
          await this.ws.git.add({ dir: gitDir, paths: ["."], all: true });
          await this.ws.git.commit({
            dir: gitDir,
            message: "Initialize project",
          });
          await push(this.env, this.ws, run.repo, run.repo.defaultBranch);
        } else
          await this.ws.git.clone({
            dir: gitDir,
            url: run.repo.remote,
            ref: run.repo.defaultBranch,
            depth: 0,
            headers: await credentials(this.env, run.repo),
          });
        run.base = await this.ws.git.revParse({ dir: gitDir, ref: "HEAD" });
        run.agents = [0, 1].map((i) => ({
          status: "running",
          branch: `agents/${run.id}/${i}`,
          steps: 0,
          tokens: 0,
        }));
        if (await this.ctx.storage.get("cancelled")) return;
        await Promise.all(
          run.agents.map((a, i) =>
            this.agent(run.id, i).start({
              runKey: this.runKey(run.id),
              repo: run.repo!,
              base: run.base!,
              branch: a.branch,
              prompt: run.prompt,
              model: run.model,
              assignment:
                i === 0
                  ? "Own application implementation and configuration. Leave documentation to the other agent. For web applications, also build a self-contained Cloudflare ES module Worker at .flareops/preview/worker.js (under 2 MB), embedding required static assets in the bundle. Bundle dependencies; leave no relative file imports. Previews have ENVIRONMENT=preview and Cloudflare Access. For isolated storage, commit .flareops/preview/resources.json as an array of objects with exactly type (d1, kv or r2) and binding (unique uppercase identifier); maximum 12 resources. FlareOps provisions empty resources and binds them automatically. Never supply production resource IDs. Initialize D1 schemas idempotently in the application. Never embed credentials. Use mock data for unsupported integrations and document limitations. Test the preview bundle; do not deploy it."
                  : "Own README and documentation only. Describe expected behavior, setup and validation based on this request. Do not edit application files.",
            }),
          ),
        );
        run.status = "running";
        await this.save(run, "Two agents started in separate workspaces");
      } else {
        run.agents = await Promise.all(
          run.agents.map(
            async (a, i) => (await this.agent(run.id, i).status()) || a,
          ),
        );
        if (run.agents.every((a) => terminal(a.status))) {
          if (run.agents.some((a) => a.status !== "complete"))
            throw new Error("An agent did not complete");
          const branch = `review/${run.id}`;
          await this.ws.git.branch({
            dir: gitDir,
            name: branch,
            startPoint: run.base,
            force: true,
          });
          await this.ws.git.checkout({ dir: gitDir, ref: branch });
          for (const a of run.agents) {
            await this.ws.git.fetch({
              dir: gitDir,
              url: run.repo!.remote,
              ref: a.branch,
              headers: await credentials(this.env, run.repo!),
            });
            await this.ws.git.merge({
              dir: gitDir,
              theirs: `refs/remotes/origin/${a.branch}`,
            });
          }
          run.reviewHead = await this.ws.git.revParse({
            dir: gitDir,
            ref: "HEAD",
          });
          Object.assign(
            run,
            await reviewDiff(this.ws, run.base!, run.reviewHead),
          );
          await push(this.env, this.ws, run.repo!, branch);
          run.status = "review";
          await this.save(
            run,
            "Changes ready for review. Main branch unchanged.",
          );
        } else await this.save(run);
      }
    } catch (error) {
      run.status = "failed";
      run.error =
        error instanceof ControlError
          ? error.message
          : "Run stopped during repository setup, agent execution, or integration. Check permissions, model availability, and backend logs. Agent branches are preserved.";
      await this.save(run, "Run failed");
    } finally {
      try {
        if (await this.ctx.storage.get("cancelled")) {
          run.status = "cancelled";
          await this.save(run);
          await Promise.all(
            run.agents.map((_, i) => this.agent(run.id, i).cancel()),
          );
        }
        if (["provisioning", "running"].includes(run.status))
          await this.ctx.storage.setAlarm(Date.now() + 5000);
        else await this.cleanup(run);
      } finally {
        this.running = false;
      }
    }
  }
  async previewArtifact() {
    return this.ctx.blockConcurrencyWhile(async () => {
      const run = await this.status();
      if (
        !run ||
        !["review", "merged"].includes(run.status) ||
        !run.reviewHead ||
        this.running
      )
        throw new ControlError("A completed review is required for a preview.");
      let code: string;
      try {
        const bytes = await readPreviewBundle(this.ws, run.reviewHead);
        code = new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: false,
        }).decode(bytes);
      } catch {
        throw new ControlError(
          "This revision has no preview bundle. Ask the agent to build .flareops/preview/worker.js.",
        );
      }
      if (!code.trim() || new TextEncoder().encode(code).length > 2000000)
        throw new ControlError("Preview bundle is missing or exceeds 2 MB.");
      return { head: run.reviewHead, code, resources: await readPreviewResources(this.ws, run.reviewHead) };
    });
  }
  async approve(head: string) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const run = await this.status();
      if (
        !run ||
        run.status !== "review" ||
        run.reviewHead !== head ||
        !run.repo
      )
        throw new Error("Review changed");
      try {
        const remote = await refs(this.env, run.repo);
        if (remote[`refs/heads/${run.repo.defaultBranch}`] !== run.base)
          throw new Error("Main branch changed. Start a fresh review.");
        await push(
          this.env,
          this.ws,
          run.repo,
          `review/${run.id}`,
          run.repo.defaultBranch,
        );
        run.status = "merged";
        await this.save(run, "Reviewed changes merged");
        return run;
      } finally {
        await this.shutdown();
      }
    });
  }
}
