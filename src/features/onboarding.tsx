import { HarnessConnection } from "./harness";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cloud,
  Github,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";
import { z } from "zod";
import { Button } from "../components/ui/button";
import { accounts, authAction, cancelJob, profiles, unwrap } from "../lib/cf";
import { isDesktop, useUI } from "../lib/store";
import { githubRepository, useOnboarding } from "../lib/onboarding";
import {
  defaultProvider,
  providerLabels,
  providerScopeKey,
  useProviders,
} from "../lib/providers";
import { useProjects } from "../lib/projects";
import { ProviderForm } from "./provider-picker";
import type { Account } from "../lib/types";

const steps = ["Cloudflare account", "Connect AI", "Your first project"];
export function Onboarding() {
  const ui = useUI();
  const { step, setStep, finish, draft, setDraft } = useOnboarding();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profileList, setProfiles] = useState<string[]>([]);
  const [profile, setProfile] = useState(ui.account.profile);
  const [choices, setChoices] = useState<Account[]>(ui.knownAccounts);
  const [verified, setVerified] = useState(false);
  const [providerForm, setProviderForm] = useState(false);
  const { kind, prompt, url } = draft;
  const setKind = (kind: "new" | "github") => setDraft({ kind });
  const setPrompt = (prompt: string) => setDraft({ prompt });
  const setUrl = (url: string) => setDraft({ url });
  const [authJob, setAuthJob] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  const scope = {
    mode: ui.mode,
    accountId: ui.account.id,
    profile: ui.account.profile,
  };
  const config =
    useProviders((s) => s.configs[providerScopeKey(scope)]) ?? defaultProvider;
  useEffect(() => {
    heading.current?.focus();
    setError("");
  }, [step]);
  useEffect(() => {
    if (!isDesktop) return;
    let active = true;
    profiles()
      .then((result) => {
        if (active && result.success)
          setProfiles(
            z
              .array(z.object({ name: z.string() }))
              .parse(unwrap(result.data))
              .map((p) => p.name),
          );
      })
      .catch(() => {
        if (active)
          setError(
            "Could not load saved logins. You can try signing in again.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  async function connect(existing?: string) {
    setBusy(true);
    setError("");
    setVerified(false);
    const name = existing || `flareops-${crypto.randomUUID().slice(0, 8)}`;
    try {
      if (!existing) {
        const id = crypto.randomUUID();
        setAuthJob(id);
        const result = await authAction("create", name, false, id);
        if (!result.success)
          throw new Error(result.error || "Sign-in did not finish. Try again.");
      }
      setAuthJob(undefined);
      const result = await accounts(name);
      if (!result.success)
        throw new Error(result.error || "Could not load Cloudflare accounts.");
      const list = z
        .array(z.object({ id: z.string(), name: z.string() }))
        .parse(unwrap(result.data))
        .map((a) => ({
          ...a,
          profile: name,
          workspace: "My workspace",
          color: "#b8c8ad",
        }));
      if (!list.length)
        throw new Error(
          "No accounts were authorized. Sign in again and grant access to an account.",
        );
      setChoices(list);
      setProfile(name);
      ui.rememberAccounts(list);
      ui.setMode("live");
      ui.setAccount(list[0]);
      setVerified(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not connect. Try again.",
      );
    } finally {
      setBusy(false);
      setAuthJob(undefined);
    }
  }
  function complete() {
    setError("");
    try {
      if (kind === "github")
        useProjects
          .getState()
          .queueImport(scope, githubRepository(url), config);
      else useProjects.getState().createProject(scope, prompt, config);
      setDraft({ prompt: "", url: "", kind: "new" });
      finish();
      ui.navigate("Projects");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save your project. Try again.",
      );
    }
  }
  return (
    <main className="onboarding">
      <header className="onboarding-top">
        <span className="onboarding-brand">
          <Cloud size={20} /> FlareOps <small>Beta</small>
        </span>
        <Button variant="ghost" disabled={busy} onClick={finish}>
          Finish later
        </Button>
      </header>
      <div className="onboarding-layout">
        <aside aria-label="Setup progress">
          <h2>
            Your workspace,
            <br />
            ready to build.
          </h2>
          <ol>
            {steps.map((label, index) => (
              <li
                key={label}
                aria-current={index === step ? "step" : undefined}
                className={
                  index === step ? "current" : index < step ? "done" : ""
                }
              >
                <span>{index < step ? <Check size={16} /> : index + 1}</span>
                <div>
                  {label}
                  <small>
                    {
                      [
                        "Choose where your projects live",
                        "Choose the model behind your agents",
                        "Bring code or describe an idea",
                      ][index]
                    }
                  </small>
                </div>
              </li>
            ))}
          </ol>
          <p>You can change accounts and providers later.</p>
        </aside>
        <section className="onboarding-panel" aria-labelledby="setup-title">
          <div className="onboarding-step">Step {step + 1} of 3</div>
          <h1 id="setup-title" tabIndex={-1} ref={heading}>
            {
              [
                "Start with Cloudflare",
                "Choose your AI",
                "What would you like to build?",
              ][step]
            }
          </h1>
          <p className="onboarding-intro">
            {
              [
                "Sign in securely in your browser, then choose the account you want to use.",
                "Cloudflare Workers AI uses your Cloudflare account. You can also bring your own provider.",
                "Start with a prompt, or bring an existing GitHub repository.",
              ][step]
            }
          </p>
          {step === 0 && (
            <div className="onboarding-body">
              {!isDesktop && (
                <div className="onboarding-note">
                  Browser preview: live sign-in is available in the desktop app.
                </div>
              )}
              <Button
                variant="default"
                disabled={!isDesktop || busy}
                onClick={() => void connect()}
              >
                {busy ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <Cloud size={16} />
                )}
                {authJob
                  ? "Waiting for browser sign-in…"
                  : "Sign in with Cloudflare"}
              </Button>
              <a
                href="https://dash.cloudflare.com/sign-up"
                onClick={(event) => {
                  if (isDesktop) {
                    event.preventDefault();
                    void invoke("open_cloudflare_signup").catch(() =>
                      setError(
                        "Could not open your browser. Visit dash.cloudflare.com/sign-up to create your account.",
                      ),
                    );
                  }
                }}
                target="_blank"
                rel="noreferrer"
              >
                Create a Cloudflare account ↗
              </a>
              {authJob && (
                <Button
                  onClick={() =>
                    void cancelJob(authJob).catch(() =>
                      setError("Could not cancel sign-in."),
                    )
                  }
                >
                  Cancel sign-in
                </Button>
              )}
              {!!profileList.length && (
                <div className="onboarding-existing">
                  <label htmlFor="setup-profile">Use a saved login</label>
                  <div>
                    <select
                      id="setup-profile"
                      value={profileList.includes(profile) ? profile : ""}
                      disabled={busy}
                      onChange={(e) => setProfile(e.target.value)}
                    >
                      <option value="" disabled>
                        Choose a login
                      </option>
                      {profileList.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                    <Button
                      disabled={busy || !profileList.includes(profile)}
                      onClick={() => void connect(profile)}
                    >
                      Connect
                    </Button>
                  </div>
                </div>
              )}
              {verified && (
                <label>
                  Cloudflare account
                  <select
                    value={ui.account.id}
                    onChange={(e) => {
                      const a = choices.find((a) => a.id === e.target.value);
                      if (a) ui.setAccount(a);
                    }}
                  >
                    {choices.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <small className="onboarding-success">
                    <Check size={14} /> Account connected
                  </small>
                </label>
              )}
              {!isDesktop && (
                <Button
                  onClick={() => {
                    setVerified(true);
                    setStep(1);
                  }}
                >
                  Explore with demo data <ArrowRight size={16} />
                </Button>
              )}
            </div>
          )}
          {step === 1 && (
            <div className="onboarding-body">
              <div className="onboarding-account">
                <Cloud size={18} />
                <span>
                  {ui.account.name}
                  <small>
                    {ui.mode === "demo" ? "Demo account" : ui.account.profile}
                  </small>
                </span>
              </div>
              {providerForm ? (
                <ProviderForm
                  key={providerScopeKey(scope)}
                  scope={scope}
                  config={config}
                  close={() => setProviderForm(false)}
                />
              ) : (
                <>
                  <div className="onboarding-provider">
                    <Sparkles size={22} />
                    <div>
                      <strong>{providerLabels[config.provider]}</strong>
                      <p>
                        {config.provider === "cloudflare"
                          ? "Default · no separate AI key required once the agent backend is deployed"
                          : config.model ||
                            "Choose a model and add your API key"}
                      </p>
                    </div>
                    <Button onClick={() => setProviderForm(true)}>
                      Change provider
                    </Button>
                  </div>
                  <div className="onboarding-note">
                    {config.provider === "cloudflare"
                      ? "Cloudflare selected. Connect a deployed agent backend to run prompts."
                      : "Provider preferences are saved separately for this account. Saving a key does not verify the connection."}
                  </div>
                  <HarnessConnection
                    key={providerScopeKey(scope)}
                    scope={scope}
                  />
                  <p className="onboarding-options">
                    Also available: OpenAI, Anthropic, and OpenAI-compatible
                    providers.
                  </p>
                </>
              )}
            </div>
          )}
          {step === 2 && (
            <div className="onboarding-body">
              <div
                className="onboarding-choices"
                role="group"
                aria-label="Project starting point"
              >
                <button
                  aria-pressed={kind === "new"}
                  onClick={() => setKind("new")}
                >
                  <Plus size={20} />
                  <strong>Start a new project</strong>
                  <span>Describe your idea in your own words.</span>
                </button>
                <button
                  aria-pressed={kind === "github"}
                  onClick={() => setKind("github")}
                >
                  <Github size={20} />
                  <strong>Import from GitHub</strong>
                  <span>Continue working on an existing repository.</span>
                </button>
              </div>
              {kind === "new" ? (
                <label htmlFor="setup-prompt">
                  What do you want to build?
                  <textarea
                    id="setup-prompt"
                    rows={5}
                    maxLength={20000}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Build a dashboard that tracks…"
                  />
                  <small>
                    We’ll infer the project name and type from your prompt.
                  </small>
                </label>
              ) : (
                <>
                  <label htmlFor="setup-repository">
                    GitHub repository URL
                    <input
                      id="setup-repository"
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://github.com/owner/repository"
                    />
                  </label>
                  <div className="onboarding-note">
                    Save this repository, then use Import from GitHub in the
                    project to copy it into Artifacts. A connected backend is
                    required. Private repositories need GitHub credentials on
                    the backend.
                  </div>
                </>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="danger">
              {error}
            </p>
          )}
          <footer className="onboarding-footer">
            <Button
              variant="ghost"
              disabled={busy || step === 0}
              onClick={() => {
                setProviderForm(false);
                setStep(step - 1);
              }}
            >
              <ArrowLeft size={16} /> Back
            </Button>
            <Button
              variant="default"
              disabled={
                busy ||
                providerForm ||
                (step === 0 && !verified) ||
                (step === 2 && !(kind === "new" ? prompt.trim() : url.trim()))
              }
              onClick={() => (step < 2 ? setStep(step + 1) : complete())}
            >
              {step < 2
                ? "Continue"
                : kind === "new"
                  ? "Create project brief"
                  : "Save pending import"}
              <ArrowRight size={16} />
            </Button>
          </footer>
        </section>
      </div>
    </main>
  );
}
