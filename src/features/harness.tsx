import { ProjectPreview } from "./project-preview";
import { useEffect, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { Cloud, Loader2, Play, RefreshCw, Square } from "lucide-react";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { isDesktop } from "../lib/store";
import {
  useProjects,
  type ProjectBrief,
  type ProjectScope,
} from "../lib/projects";
import {
  defaultProvider,
  providerScopeKey,
  useProviders,
} from "../lib/providers";
import {
  harnessCall,
  harnessScope,
  useHarness,
  type Run,
} from "../lib/harness";

export function HarnessConnection({ scope }: { scope: ProjectScope }) {
  return (
    <AccountHarnessConnection key={providerScopeKey(scope)} scope={scope} />
  );
}
function AccountHarnessConnection({ scope }: { scope: ProjectScope }) {
  const saved = useHarness((s) => s.endpoints[providerScopeKey(scope)]);
  const [open, setOpen] = useState(false),
    [endpoint, setEndpoint] = useState(saved || ""),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [progress, setProgress] = useState("");
  async function setup(upgrade = false) {
    setBusy(true);
    setError("");
    setProgress("Preparing backend setup…");
    const onProgress = new Channel<string>();
    onProgress.onmessage = setProgress;
    try {
      const result = await invoke<{ endpoint: string }>("harness_setup", {
        accountId: scope.accountId,
        profile: scope.profile,
        onProgress,
        upgrade,
      });
      useHarness.getState().save(scope, result.endpoint);
      setEndpoint(result.endpoint);
      setDiscovery("connected");
      setToken("");
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  const [discovery, setDiscovery] = useState<
    "checking" | "missing" | "found" | "custom-domain" | "connected" | "error"
  >("checking");
  useEffect(() => {
    if (!open || !isDesktop || scope.mode !== "live") return;
    let current = true;
    setDiscovery("checking");
    setError("");
    void invoke<{
      status: "missing" | "found" | "custom-domain";
      endpoint?: string;
      connected?: boolean;
    }>("harness_discover", {
      accountId: scope.accountId,
      profile: scope.profile,
    })
      .then((result) => {
        if (!current) return;
        if (result.endpoint) setEndpoint(result.endpoint);
        if (result.connected && result.endpoint) {
          useHarness.getState().save(scope, result.endpoint);
          setDiscovery("connected");
        } else setDiscovery(result.status);
      })
      .catch((error) => {
        if (current) {
          setError(String(error));
          setDiscovery("error");
        }
      });
    return () => {
      current = false;
    };
  }, [open, scope.accountId, scope.profile, scope.mode]);
  const native = isDesktop && scope.mode === "live";
  return (
    <>
      <Button
        onClick={() => {
          setEndpoint(saved || "");
          setAdvanced(false);
          setOpen(true);
        }}
      >
        <Cloud size={15} />
        {saved ? "Backend settings" : "Connect agent backend"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) {
            setOpen(v);
            setToken("");
            setError("");
          }
        }}
        title="Connect agent backend"
        description={`Uses your current Cloudflare account through ${scope.profile}.`}
      >
        <form
          className="provider-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const origin = new URL(endpoint).origin;
              // Native validation checks the original URL, account and deployment version.
              if (token.trim())
                await invoke("harness_connect", {
                  scope: harnessScope(scope, endpoint),
                  token,
                });
              else await harnessCall(scope, endpoint, "health");
              useHarness.getState().save(scope, origin);
              setToken("");
              setOpen(false);
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            Account <code>{scope.accountId}</code>
          </p>
          {native && discovery === "checking" && (
            <p role="status">Finding this account’s backend…</p>
          )}
          {native && discovery === "connected" && (
            <>
              <AccountBudget scope={scope} endpoint={endpoint} />
              <Button
                type="button"
                disabled={busy}
                onClick={() => void setup(true)}
              >
                {busy ? "Updating…" : "Update backend"}
              </Button>
            </>
          )}
          {native && discovery === "connected" && (
            <p role="status">
              Connected using the saved credentials for this account and
              profile.
            </p>
          )}
          {native && discovery === "missing" && (
            <p role="status">
              Set up the agent backend in this account to run projects.
            </p>
          )}
          {native && discovery === "custom-domain" && (
            <p role="status">
              This backend uses a custom domain. Enter its address under
              advanced connection.
            </p>
          )}
          {native && discovery === "found" && (
            <p role="status">
              Found your backend. Continue setup to reconnect this installation.
            </p>
          )}
          {endpoint && !advanced && (
            <p className="harness-repository">{endpoint}</p>
          )}
          {native &&
            discovery !== "checking" &&
            discovery !== "connected" &&
            !advanced && (
              <>
                <p>
                  Setup deploys a Worker and agent Containers in this account.
                  Docker must be running. Cloudflare usage is billed to this
                  account.
                </p>
                <Button
                  type="button"
                  variant="default"
                  disabled={busy}
                  onClick={() => void setup()}
                >
                  {busy ? (
                    <Loader2 size={15} className="spin" />
                  ) : (
                    <Cloud size={15} />
                  )}
                  {busy ? "Setting up…" : "Set up backend"}
                </Button>
              </>
            )}
          {progress && (
            <p role="status" aria-live="polite">
              {progress}
            </p>
          )}
          <Button
            type="button"
            disabled={busy}
            onClick={() => setAdvanced(!advanced)}
          >
            {advanced ? "Hide advanced connection" : "Advanced connection"}
          </Button>
          {advanced && (
            <label>
              Backend URL
              <input
                type="url"
                required
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://flareops-harness.your-subdomain.workers.dev"
                disabled={busy || !native}
              />
            </label>
          )}
          {advanced && (
            <label>
              Backend access token
              <input
                type="password"
                autoComplete="new-password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={
                  saved
                    ? "Leave blank to use the saved token"
                    : "HARNESS_TOKEN from backend setup"
                }
                disabled={busy || !native}
              />
            </label>
          )}
          <p>
            Workers AI uses this account’s backend binding. Connection
            credentials are saved in your OS credential store.
          </p>
          {!isDesktop && (
            <p>
              Open the desktop app to connect. Browser preview cannot access
              saved credentials.
            </p>
          )}
          {error && (
            <p className="danger" role="alert">
              {error}
            </p>
          )}
          {advanced && (
            <Button
              variant="default"
              disabled={
                busy || !native || !endpoint || discovery === "checking"
              }
            >
              {busy ? "Checking connection…" : "Verify and connect"}
            </Button>
          )}
        </form>
      </Dialog>
    </>
  );
}
export function HarnessProject({
  project,
  scope,
}: {
  project: ProjectBrief;
  scope: ProjectScope;
}) {
  const endpoint = useHarness((s) => s.endpoints[providerScopeKey(scope)]);
  const config =
    useProviders((s) => s.configs[providerScopeKey(scope)]) ?? defaultProvider;
  const [run, setRun] = useState<Run | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [review, setReview] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const active =
    !!run && ["provisioning", "running", "merging"].includes(run.status);
  useEffect(() => {
    if (!endpoint || !isDesktop || scope.mode !== "live") return;
    let active = true;
    const refresh = async () => {
      try {
        const next = await harnessCall<Run | null>(
          scope,
          endpoint,
          "status",
          project.id,
        );
        if (active) {
          setRun(next);
          if (next?.status === "imported")
            useProjects.getState().markImported(project.id, scope);
          setLoaded(true);
          setError("");
        }
      } catch (e) {
        if (active) {
          setError(String(e));
          setLoaded(false);
        }
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [endpoint, scope.accountId, scope.profile, scope.mode, project.id]);
  async function action(action: string, body?: unknown) {
    if (!endpoint) return;
    setBusy(true);
    setError("");
    try {
      setRun(await harnessCall<Run>(scope, endpoint, action, project.id, body));
      setRequestId(crypto.randomUUID());
      setReview(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  if (!endpoint || scope.mode !== "live" || !isDesktop)
    return (
      <div className="project-connection">
        <Cloud size={18} />
        <div>
          <strong>
            {project.importSource ? "Ready to import" : "Ready to run"}
          </strong>
          <p>
            Connect the agent backend in the desktop app to{" "}
            {project.importSource
              ? "copy this GitHub repository into Artifacts"
              : "start Cloudflare AI agents"}
            .
          </p>
        </div>
        <HarnessConnection scope={scope} />
      </div>
    );
  return (
    <section className="harness-run" aria-label="Agent execution">
      <header>
        <strong>{run ? `Run · ${run.status}` : "Start building"}</strong>
        <span>{active && <Loader2 size={16} className="spin" />}</span>
      </header>
      {error && (
        <p role="alert" className="danger">
          {error}
        </p>
      )}
      {config.provider !== "cloudflare" && (
        <p>
          The connected backend currently supports Cloudflare AI. Select
          Cloudflare to run this project.
        </p>
      )}
      <div className="harness-actions">
        {project.importSource &&
        (!run ||
          (run.status === "failed" &&
            !run.agents.length &&
            project.importSource.status === "pending")) ? (
          <Button
            variant="default"
            disabled={busy || !loaded}
            onClick={() =>
              void action("import", {
                url: project.importSource!.url,
                requestId,
              })
            }
          >
            Import from GitHub
          </Button>
        ) : (
          <Button
            variant="default"
            disabled={
              busy ||
              !loaded ||
              active ||
              run?.status === "review" ||
              config.provider !== "cloudflare"
            }
            onClick={() =>
              void action("start", {
                requestId,
                provider: "cloudflare",
                ...(config.model ? { model: config.model } : {}),
                prompt: project.prompts
                  .map((p) => p.text)
                  .join("\n\n")
                  .slice(-20000),
              })
            }
          >
            <Play size={14} />
            Run agents
          </Button>
        )}
        {active && (
          <Button disabled={busy} onClick={() => void action("cancel")}>
            <Square size={14} />
            Cancel run
          </Button>
        )}
        {run?.status === "review" && (
          <Button onClick={() => setReview(true)}>Review changes</Button>
        )}
        <Button disabled={busy} onClick={() => void action("status")}>
          <RefreshCw size={14} />
          Refresh
        </Button>
      </div>
      {run?.usage && (
        <p>
          {run.usage.inputTokens.toLocaleString()} input ·{" "}
          {run.usage.outputTokens.toLocaleString()} output tokens
          {" · "}
          {usd(run.usage.estimatedMicrousd)} estimated AI cost
          {run.usage.reservedMicrousd > 0 && (
            <>
              {" "}
              · {usd(run.usage.reservedMicrousd)} reserved for in-flight or
              unconfirmed calls
            </>
          )}
        </p>
      )}
      {run?.error && (
        <p role="alert" className="danger">
          {run.error}
        </p>
      )}
      {run?.reviewHead && ["review", "merged"].includes(run.status) && (
        <ProjectPreview
          key={`${scope.accountId}:${scope.profile}:${project.id}:${run.reviewHead}`}
          scope={scope}
          endpoint={endpoint}
          projectId={project.id}
          head={run.reviewHead}
        />
      )}
      {run?.repo && <p className="harness-repository">{run.repo.remote}</p>}
      {run?.agents.map((a, i) => (
        <article key={a.branch}>
          <strong>
            Agent {i + 1} · {a.status}
          </strong>
          <small>
            {a.steps} steps · {a.tokens.toLocaleString()} tokens
          </small>
          {a.summary && <p>{a.summary}</p>}
          {a.error && <p className="danger">{a.error}</p>}
        </article>
      ))}
      {!!run?.events.length && (
        <ol className="harness-events">
          {run.events.map((e, i) => (
            <li key={i}>
              <time>{new Date(e.at).toLocaleTimeString()}</time>
              {e.message}
            </li>
          ))}
        </ol>
      )}
      <Dialog
        open={review}
        onOpenChange={setReview}
        title="Review agent changes"
        description="Merging updates the project’s default branch. Deployment is a separate action."
      >
        <div className="harness-review">
          <p>
            Review the diff and agent reports. A successful agent run does not
            guarantee tests passed.
          </p>
          <pre>{run?.diff || "No text changes."}</pre>
          <Button
            variant="default"
            disabled={busy}
            onClick={() =>
              void action("merge", { head: run?.reviewHead, confirm: true })
            }
          >
            Approve and merge
          </Button>
        </div>
      </Dialog>
    </section>
  );
}

const usd = (micro: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(micro / 1e6);
type BudgetStatus = {
  limits: { dailyUsd: number; monthlyUsd: number; concurrentRuns: number };
  dailyMicrousd: number;
  monthlyMicrousd: number;
  activeRuns: number;
};
function AccountBudget({
  scope,
  endpoint,
}: {
  scope: ProjectScope;
  endpoint: string;
}) {
  const [status, setStatus] = useState<BudgetStatus>();
  const [limits, setLimits] = useState<BudgetStatus["limits"]>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    void harnessCall<BudgetStatus>(scope, endpoint, "budget_status")
      .then((value) => {
        if (current) {
          setStatus(value);
          setLimits(value.limits);
        }
      })
      .catch((error) => {
        if (current) setError(String(error));
      });
    return () => {
      current = false;
    };
  }, [scope.accountId, scope.profile, endpoint]);
  return (
    <fieldset disabled={busy} className="provider-form">
      <legend>Account AI budget</legend>
      <p>
        Shared across profiles and projects. USD, resetting at midnight UTC.
        Infrastructure charges are separate.
      </p>
      {status && (
        <p>
          Today {usd(status.dailyMicrousd)} · This month{" "}
          {usd(status.monthlyMicrousd)} including reservations ·{" "}
          {status.activeRuns} active runs
        </p>
      )}
      {limits && (
        <>
          <label>
            Daily limit (USD)
            <input
              type="number"
              min="0"
              max="10000"
              step="0.01"
              value={limits.dailyUsd}
              onChange={(e) =>
                setLimits({ ...limits, dailyUsd: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Monthly limit (USD)
            <input
              type="number"
              min="0"
              max="100000"
              step="0.01"
              value={limits.monthlyUsd}
              onChange={(e) =>
                setLimits({ ...limits, monthlyUsd: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Concurrent runs
            <select
              value={limits.concurrentRuns}
              onChange={(e) =>
                setLimits({ ...limits, concurrentRuns: Number(e.target.value) })
              }
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </label>
          <Button
            type="button"
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setStatus(
                  await harnessCall<BudgetStatus>(
                    scope,
                    endpoint,
                    "budget_update",
                    undefined,
                    limits,
                  ),
                );
              } catch (error) {
                setError(String(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Save limits"}
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
