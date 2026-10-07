import type { Project, Agent } from "./index";
import type { Budget } from "./budget";
export interface Env {
  BUDGET: DurableObjectNamespace<Budget>;
  AI: Ai;
  ARTIFACTS: Artifacts;
  LOADER: WorkerLoader;
  PROJECTS: DurableObjectNamespace<Project>;
  AGENTS: DurableObjectNamespace<Agent>;
  ACCOUNT_ID: string;
  MODEL: string;
  HARNESS_TOKEN: string;
  GITHUB_TOKEN?: string;
  GITHUB_OWNER?: string;
}
