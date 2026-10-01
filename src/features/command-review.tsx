import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Check,
  Copy,
  Play,
  ShieldCheck,
  Square,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { Dialog } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { ErrorBox, CheckRow } from "../components/shared";
import { prepare, runPlan, cancelJob } from "../lib/cf";
import { queryClient } from "../lib/query";
import { useUI, isDesktop } from "../lib/store";
import { copy } from "../lib/utils";
import type { Request, Plan, Execution } from "../lib/types";
export function CommandReview({
  request,
  onClose,
}: {
  request: Request | null;
  onClose: () => void;
}) {
  const { account, mode } = useUI();
  const [plan, setPlan] = useState<Plan | null>(null),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<Execution | null>(null),
    [dry, setDry] = useState<Execution | null>(null),
    [confirmation, setConfirmation] = useState(""),
    [stream, setStream] = useState("");
  useEffect(() => {
    setPlan(null);
    setError(undefined);
    setResult(null);
    setDry(null);
    setConfirmation("");
    setStream("");
    if (!request) return;
    let active = true;
    prepare(request)
      .then((p) => active && setPlan(p))
      .catch((e) => active && setError(e));
    return () => {
      active = false;
    };
  }, [request]);
  useEffect(() => {
    if (!plan || !isDesktop || mode === "demo") return;
    let disposed = false;
    let off: undefined | (() => void);
    listen<{ id: string; text: string }>("cf-output", (e) => {
      if (e.payload.id === plan.id)
        setStream((s) => (s + "\n" + e.payload.text).slice(-20000));
    }).then((f) => {
      if (disposed) f();
      else off = f;
    });
    return () => {
      disposed = true;
      off?.();
    };
  }, [plan, mode]);
  const changed =
    !!request &&
    (account.id !== request.context.accountId ||
      account.profile !== request.context.profile);
  async function run(dryRun: boolean) {
    if (!plan) return;
    setBusy(true);
    setError(undefined);
    try {
      const e = await runPlan(plan, true, dryRun);
      if (dryRun) setDry(e);
      else setResult(e);
      if (!e.success) setError(e.error);
      await queryClient.invalidateQueries({ queryKey: ["history"] });
      if (e.success && !dryRun)
        await queryClient.invalidateQueries({ queryKey: ["resources"] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={!!request}
      onOpenChange={(v) => !v && !busy && onClose()}
      title={
        result?.success
          ? "Command completed"
          : plan?.classification === "Destructive"
            ? "Confirm destructive action"
            : "Review command"
      }
      description={
        mode === "demo"
          ? "Demo workspace · changes affect sample data only"
          : "Every command runs through the Cloudflare CLI."
      }
    >
      <div className="dialog-body review">
        {!!error && <ErrorBox error={error} />}
        <div className="review-context">
          <span>
            Account
            <strong>
              {account.id === request?.context.accountId
                ? account.name
                : request?.context.accountId}
            </strong>
          </span>
          <span>
            Profile<strong>{request?.context.profile}</strong>
          </span>
          {request?.context.zoneId && (
            <span>
              Zone<strong>{request.context.zoneId}</strong>
            </span>
          )}
        </div>
        {plan ? (
          <>
            <div className="section-label">
              EXACT COMMAND{" "}
              <span
                className={`command-class ${plan.classification === "Destructive" ? "danger" : ""}`}
              >
                {plan.classification}
              </span>
            </div>
            <div className="code-block">
              <code>{plan.command}</code>
              <Button
                variant="ghost"
                size="icon"
                title="Copy command"
                onClick={() => copy(plan.command)}
              >
                <Copy size={14} />
              </Button>
            </div>
            {plan.classification !== "Read" && (
              <div className="notice">
                <ShieldCheck size={17} />
                <span>
                  {plan.dryRunSupported
                    ? "Run a dry-run first, inspect the result, then apply the change."
                    : "The CLI does not advertise dry-run support for this command. Review carefully."}
                </span>
              </div>
            )}
            {dry && (
              <div className="dry-result">
                <CheckRow done={dry.success}>
                  Dry-run {dry.success ? "completed" : "failed"}
                </CheckRow>
                <pre>{dry.rawStdout || dry.rawStderr}</pre>
              </div>
            )}
            {plan.classification === "Destructive" && !result && (
              <label className="field">
                Type the account name to confirm{" "}
                <input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder={account.name}
                />
              </label>
            )}
            {busy && (
              <div className="task-progress">
                <CheckRow>Resolve account and zone</CheckRow>
                <CheckRow>Validate parameters</CheckRow>
                <CheckRow done={false}>Execute cf command</CheckRow>
              </div>
            )}
            {stream && (
              <details>
                <summary>Live output</summary>
                <pre>{stream}</pre>
              </details>
            )}
            {result && (
              <div className="task-progress">
                <CheckRow done={result.success}>
                  Command {result.success ? "completed" : "failed"} ·{" "}
                  {result.durationMs} ms
                </CheckRow>
                <details>
                  <summary>Output and technical details</summary>
                  <pre>{result.rawStdout}</pre>
                  <pre>{result.rawStderr}</pre>
                  <p>Exit code {result.exitCode}</p>
                </details>
              </div>
            )}
          </>
        ) : (
          !error && <p className="muted">Discovering command schema…</p>
        )}
        {changed && (
          <ErrorBox error="Account context changed. Close this review and prepare the command again." />
        )}
      </div>
      <div className="dialog-footer">
        <span className="muted">
          <Terminal size={14} />{" "}
          {mode === "demo" ? "Simulated execution" : "Powered by cf"}
        </span>
        {busy ? (
          <Button onClick={() => plan && cancelJob(plan.id).catch(setError)}>
            <Square size={13} />
            Cancel command
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              {result?.success ? "Done" : "Cancel"}
            </Button>
            {!result?.success && plan && (
              <Button
                variant={
                  plan.classification === "Destructive"
                    ? "destructive"
                    : "default"
                }
                disabled={
                  changed ||
                  (plan.classification === "Destructive" &&
                    confirmation !== account.name)
                }
                onClick={() =>
                  run(
                    plan.classification !== "Read" &&
                      plan.dryRunSupported &&
                      !dry?.success,
                  )
                }
              >
                {plan.classification !== "Read" &&
                plan.dryRunSupported &&
                !dry?.success ? (
                  <>
                    <ShieldCheck size={15} />
                    Run dry-run
                  </>
                ) : (
                  <>
                    <Play size={14} />
                    {mode === "demo" ? "Run in demo" : "Run command"}
                  </>
                )}
              </Button>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
