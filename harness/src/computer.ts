import { DurableObject } from "cloudflare:workers";
import { Workspace, type DurableObjectStorageLike } from "@cloudflare/computer";
import {
  CloudflareContainerBackend,
  withWorkspaceContainer,
} from "@cloudflare/computer/backends/container";
import { WorkerShellBackend } from "@cloudflare/computer/backends/worker-shell";
import { createGitClient } from "@cloudflare/computer/git";
import type { Env } from "./env";
export class Computer extends withWorkspaceContainer(
  class extends DurableObject<Env> {},
) {
  protected ws: Workspace;
  protected containerBackend: CloudflareContainerBackend;
  constructor(ctx: DurableObjectState, env: Env, binding: string) {
    super(ctx, env);
    const workspace = { binding, id: ctx.id.toString() };
    this.containerBackend = new CloudflareContainerBackend({
      container: () => this,
      workspace,
      egress: { mode: "direct" },
    });
    this.ws = new Workspace({
      storage: ctx.storage as unknown as DurableObjectStorageLike,
      git: createGitClient(),
      defaultGitIdentity: { name: "FlareOps", email: "agent@flareops.local" },
      backends: [
        new WorkerShellBackend({ loader: env.LOADER, ctx, workspace }),
        this.containerBackend,
      ],
    });
  }
  protected async shutdown() {
    // Container disk is disposable; the workspace filesystem is persisted in DO storage.
    await this.ctx.storage.setAlarm(Date.now() + 60000);
    await this.ctx.container?.destroy();
    await this.ctx.storage.deleteAlarm();
  }
  async __getWorkspaceStub() {
    return this.ws.stub();
  }
  override async fetch(request: Request) {
    return this.containerBackend.handleFetch(request);
  }
  protected async execute(command: string) {
    using handle = await this.ws.runtime.exec(command, {
      backend: "container-shell",
      cwd: "/workspace",
      encoding: "utf8",
    });
    return handle.result();
  }
}
