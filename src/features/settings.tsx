import { accountSettings } from "../lib/account-settings";
import { AccountSettings } from "./account-settings";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
  Check,
  CheckCircle2,
  Cloud,
  ExternalLink,
  Loader2,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  Sun,
  Terminal,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { ErrorBox, Status } from "../components/shared";
import { Dialog } from "../components/ui/dialog";
import { useUI, isDesktop } from "../lib/store";
import {
  diagnostics,
  profiles,
  accounts,
  authAction,
  cancelJob,
  unwrap,
} from "../lib/cf";
import { clearCache } from "../lib/query";
import type { Diagnostics, Account, Page } from "../lib/types";
export function Settings() {
  const {
    theme,
    setTheme,
    mode,
    setMode,
    account,
    setAccount,
    defaultPage,
    setDefaultPage,
    workspaceLabel,
    setWorkspaceLabel,
    rememberAccounts,
    knownAccounts,
    forgetProfile,
    settingsTab: tab,
    setSettingsTab: setTab,
  } = useUI();
  const [info, setInfo] = useState<Diagnostics>(),
    [error, setError] = useState<unknown>(),
    [profileList, setProfileList] = useState<string[]>([]),
    [accountList, setAccountList] = useState<Account[]>([]),
    [busy, setBusy] = useState(false),
    [output, setOutput] = useState(""),
    [name, setName] = useState(""),
    [remove, setRemove] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [authJob, setAuthJob] = useState<string>(),
    [selectionProfile, setSelectionProfile] = useState("");
  async function check() {
    setBusy(true);
    setError(undefined);
    try {
      setInfo(await diagnostics());
      const r = await profiles();
      if (r.success) {
        const data = unwrap(r.data);
        setProfileList(
          z
            .array(z.object({ name: z.string() }))
            .parse(data)
            .map((p) => p.name),
        );
      } else setOutput(r.error ?? "");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (isDesktop) void check();
  }, []);
  async function getAccounts(profile: string) {
    setBusy(true);
    setError(undefined);
    setAccountList([]);
    setSelectionProfile(profile);
    try {
      const result = await accounts(profile);
      if (!result.success) throw Error(result.error);
      const list = z
        .array(z.object({ id: z.string(), name: z.string() }))
        .parse(unwrap(result.data));
      const discovered = list.map((a) => ({
        ...a,
        profile,
        workspace: workspaceLabel || "My workspace",
        color: "#b8c8ad",
      }));
      setAccountList(discovered);
      if (!discovered.length)
        setMessage(
          "No accounts are available to this login. Reconnect and authorize the account you want to add.",
        );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function auth(action: string, n?: string) {
    setBusy(true);
    setError(undefined);
    setMessage("");
    setOutput("");
    setAccountList([]);
    const id = crypto.randomUUID();
    if (action === "create" || action === "login") setAuthJob(id);
    try {
      const r = await authAction(action, n, action === "delete", id);
      setAuthJob(undefined);
      setOutput(r.rawStdout || r.rawStderr);
      if (!r.success) throw Error(r.error);
      if (action === "delete" && n) forgetProfile(n);
      await check();
      if (action === "create" || action === "login") {
        setMessage("Signed in. Select an account below to add it to FlareOps.");
        await getAccounts(n || "default");
      }
    } catch (e) {
      setError(e);
    } finally {
      setAuthJob(undefined);
      setBusy(false);
    }
  }
  const nodeOk = info?.nodeVersion
    ? (() => {
        const [major, minor] = info
          .nodeVersion!.replace("v", "")
          .split(".")
          .map(Number);
        return major > 22 || (major === 22 && minor >= 18);
      })()
    : false;
  const accountSetting = accountSettings.find((item) => item.label === tab);
  return (
    <div className="page-content settings-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Settings</div>
          <h1>{tab}</h1>
        </div>
      </div>
      <div className="settings-content">
        <div className="settings-body">
          {accountSetting && (
            <AccountSettings
              key={`${tab}-${mode}-${account.profile}-${account.id}`}
              setting={accountSetting}
            />
          )}
          {!accountSetting && !!error && <ErrorBox error={error} />}{" "}
          {tab === "General" && (
            <>
              <h2>Appearance</h2>

              <div className="theme-options">
                {(
                  [
                    { name: "light", Icon: Sun },
                    { name: "dark", Icon: Moon },
                    { name: "system", Icon: Monitor },
                  ] as const
                ).map(({ name, Icon }) => (
                  <button
                    key={name}
                    className={theme === name ? "selected" : ""}
                    onClick={() => setTheme(name)}
                  >
                    <div className={`theme-preview ${name}`}>
                      <i />
                      <span />
                      <span />
                    </div>
                    <span>
                      <Icon size={15} />
                      {name[0].toUpperCase() + name.slice(1)}
                      {theme === name && <Check size={14} />}
                    </span>
                  </button>
                ))}
              </div>
              <div className="settings-divider" />
              <h2>Startup</h2>
              <label className="setting-row">
                Default opening page
                <select
                  value={defaultPage}
                  onChange={(e) => setDefaultPage(e.target.value as Page)}
                >
                  {[
                    "Home",
                    "Workers",
                    "Zones",
                    "DNS",
                    "D1",
                    "R2",
                    "Activity",
                  ].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <div className="settings-divider" />
              <h2>Workspace mode</h2>
              <p className="muted">
                Demo mode uses local sample data. Live mode connects through the
                Cloudflare CLI bundled with the desktop app.
              </p>
              <div className="segmented">
                <button
                  className={mode === "demo" ? "active" : ""}
                  onClick={() => setMode("demo")}
                >
                  Demo workspace
                </button>
                <button
                  className={mode === "live" ? "active" : ""}
                  onClick={() => {
                    setMode("live");
                    setTab("Cloudflare CLI");
                  }}
                >
                  Live Cloudflare
                </button>
              </div>
            </>
          )}
          {tab === "Cloudflare CLI" && (
            <>
              <h2>System checks</h2>
              <p className="muted">
                Cloudflare CLI and Node are included with FlareOps and updated
                with the app. No separate installation is needed. Credentials
                are managed by the bundled CLI.
              </p>
              {!isDesktop ? (
                <div className="notice">
                  <Monitor size={20} />
                  <span>
                    This is the browser preview. Open the FlareOps desktop app
                    to sign in and connect your Cloudflare accounts.
                  </span>
                </div>
              ) : (
                <div className="diagnostics">
                  {[
                    ["Operating system", info?.os, !!info?.os],
                    [
                      info?.source === "bundled"
                        ? "Bundled Node.js"
                        : "Node.js",
                      info?.nodeVersion ?? "Not found",
                      nodeOk,
                    ],
                    [
                      "CLI source",
                      info?.source === "bundled"
                        ? "Included with FlareOps"
                        : info?.source === "system"
                          ? "System installation"
                          : "Not available",
                      !!info?.version,
                    ],
                    [
                      "Cloudflare CLI",
                      info?.version ?? "Unavailable",
                      !!info?.version,
                    ],
                    [
                      "Named profiles",
                      `${profileList.length} discovered`,
                      profileList.length > 0,
                    ],
                  ].map(([label, value, ok]) => (
                    <div key={String(label)}>
                      {ok ? (
                        <CheckCircle2 size={18} />
                      ) : (
                        <TriangleAlert size={18} />
                      )}
                      <strong>{label}</strong>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
              )}
              <Button onClick={check} disabled={!isDesktop || busy}>
                <RefreshCw size={14} className={busy ? "spin" : ""} />
                Run system check
              </Button>
              <div className="settings-divider" />
              <h2>Connect your accounts</h2>
              <p className="muted">
                Add an account with a named Cloudflare OAuth login. You can use
                separate logins for work, personal, and client accounts.
              </p>
              <Button variant="default" onClick={() => setTab("Accounts")}>
                <Plus size={15} /> Add account
              </Button>
              {info?.binary && (
                <label className="field">
                  Cloudflare CLI path
                  <input readOnly value={info.binary} />
                </label>
              )}
              <p className="muted">
                Compatibility: {info?.supportedRange ?? "1.0.0-beta.x"}. Command
                schemas are refreshed when the bundled version changes.
              </p>
              <a
                href="https://developers.cloudflare.com/cf/get-started/#authenticate"
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                Cloudflare authentication documentation
                <ExternalLink size={13} />
              </a>
            </>
          )}
          {tab === "Accounts" && (
            <>
              <h2>Connected accounts</h2>
              <p className="muted">
                Each account uses the login profile shown below. Choose a
                separate profile when adding an account that needs a different
                login.
              </p>
              {knownAccounts.length === 0 && (
                <p className="muted">No accounts added yet.</p>
              )}
              <div className="connected-accounts">
                {knownAccounts.map((a) => (
                  <div
                    className="connected-account"
                    key={`${a.profile}:${a.id}`}
                  >
                    <div>
                      <strong>{a.name}</strong>
                      <small>{a.id}</small>
                      <small>Cloudflare OAuth · {a.profile}</small>
                    </div>
                    <Button
                      size="sm"
                      disabled={!isDesktop || busy}
                      onClick={() => {
                        setMode("live");
                        setAccount(a);
                        setMessage(`${a.name} is now selected.`);
                      }}
                    >
                      {mode === "live" &&
                      account.id === a.id &&
                      account.profile === a.profile
                        ? "Selected"
                        : "Use account"}
                    </Button>
                    <Button
                      size="sm"
                      disabled={!isDesktop || busy}
                      onClick={() => auth("create", a.profile)}
                    >
                      Reconnect
                    </Button>
                  </div>
                ))}
              </div>
              <div className="settings-divider" />
              <h2>Add an account</h2>
              <p className="muted">
                Sign in with Cloudflare in your browser, then select an
                authorized account. Login credentials stay in the CLI’s profile
                storage. FlareOps saves the account ID and profile name.
              </p>
              {!isDesktop && (
                <div className="notice">
                  <Terminal size={17} />
                  Sign-in is available in the FlareOps desktop app. This browser
                  preview cannot authenticate accounts.
                </div>
              )}
              <label className="field">
                Connection name
                <input
                  aria-label="Connection name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. personal or client-acme"
                  disabled={busy}
                />
              </label>
              <p className="muted">
                Authentication method: Cloudflare OAuth. Use letters, numbers,
                hyphens, or underscores for the connection name.
              </p>
              <Button
                variant="default"
                disabled={
                  !isDesktop ||
                  busy ||
                  !/^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,63}$/.test(name.trim()) ||
                  profileList.includes(name.trim())
                }
                onClick={() => auth("create", name.trim())}
              >
                <Cloud size={15} /> Sign in with Cloudflare
              </Button>
              {profileList.includes(name.trim()) && (
                <p className="muted">
                  This login already exists. Use or reconnect it below.
                </p>
              )}
              {profileList.length > 0 && (
                <details className="existing-logins">
                  <summary>Use an existing login</summary>
                  <div className="profile-list">
                    {profileList.map((p) => (
                      <div key={p}>
                        <strong>{p}</strong>
                        <Button
                          size="sm"
                          disabled={!isDesktop || busy}
                          onClick={() => getAccounts(p)}
                        >
                          Choose account
                        </Button>
                        <Button
                          size="sm"
                          disabled={!isDesktop || busy}
                          onClick={() => auth("create", p)}
                        >
                          Reconnect
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={!isDesktop || busy}
                          title={`Remove ${p}`}
                          onClick={() => setRemove(p)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {busy && (
                <p className="muted">
                  <Loader2 size={14} className="spin" />{" "}
                  {authJob
                    ? "Complete sign-in and authorization in the browser that opens."
                    : "Checking your Cloudflare connection…"}
                  {authJob && (
                    <Button
                      size="sm"
                      onClick={() => void cancelJob(authJob).catch(setError)}
                    >
                      Cancel sign-in
                    </Button>
                  )}
                </p>
              )}
              {accountList.length > 0 && (
                <>
                  <h2>Select an account for {selectionProfile}</h2>
                  {accountList.map((a) => (
                    <button
                      className="account-option"
                      key={`${a.profile}:${a.id}`}
                      disabled={busy}
                      onClick={() => {
                        rememberAccounts([a]);
                        setMode("live");
                        setAccount(a);
                        setMessage(`${a.name} is now selected.`);
                      }}
                    >
                      <span>
                        <strong>{a.name}</strong>
                        <small>{a.id}</small>
                      </span>
                      {mode === "live" &&
                        account.id === a.id &&
                        account.profile === a.profile && <Check size={16} />}
                    </button>
                  ))}
                </>
              )}
              {output && (
                <details open>
                  <summary>CLI response</summary>
                  <pre>{output}</pre>
                </details>
              )}
            </>
          )}
          {tab === "Workspaces" && (
            <>
              <h2>Workspace grouping</h2>
              <p className="muted">
                Workspaces are local labels for organizing Cloudflare profiles
                and accounts.
              </p>
              <label className="field">
                Workspace name
                <input
                  value={workspaceLabel}
                  onChange={(e) => setWorkspaceLabel(e.target.value)}
                  placeholder={account.workspace}
                />
              </label>
              <Button
                onClick={() => {
                  setAccount({
                    ...account,
                    workspace: workspaceLabel.trim() || "My workspace",
                  });
                  setMessage("Workspace name saved.");
                }}
              >
                Save workspace
              </Button>
              <div className="settings-divider" />
              <dl className="metadata">
                <div>
                  <dt>Current profile</dt>
                  <dd>{account.profile}</dd>
                </div>
                <div>
                  <dt>Current account</dt>
                  <dd>{account.name}</dd>
                </div>
              </dl>
            </>
          )}
          {tab === "Advanced" && (
            <>
              <h2>Local data</h2>
              <p className="muted">
                Read-only resource summaries are cached for fast startup.
                Command history retains the latest 200 executions.
              </p>
              <div className="setting-row">
                <span>
                  <strong>Resource cache</strong>
                  <small>Remove cached summaries and refresh from cf.</small>
                </span>
                <Button
                  onClick={() => {
                    clearCache();
                    setMessage("Resource cache cleared.");
                  }}
                >
                  Clear cache
                </Button>
              </div>
              <div className="setting-row">
                <span>
                  <strong>Credentials</strong>
                  <small>Managed exclusively by the Cloudflare CLI.</small>
                </span>
                <Status label="Not stored" />
              </div>
              <div className="notice">
                <Terminal size={16} />
                <span>
                  History and output are redacted before they reach the
                  interface. Commands that can return credentials are
                  unavailable in this version.
                </span>
              </div>
            </>
          )}
          {message && (
            <p className="success-message">
              <Check size={15} />
              {message}
            </p>
          )}
        </div>
      </div>
      <Dialog
        open={!!remove}
        onOpenChange={(v) => !v && setRemove(null)}
        title="Remove Cloudflare profile?"
        description={`This removes the profile “${remove}”, its saved login, and all FlareOps account connections using it.`}
      >
        <div className="dialog-body">
          <pre className="code-block">cf auth delete {remove}</pre>
          <p>You’ll need to sign in again to use this profile.</p>
        </div>
        <div className="dialog-footer">
          <Button onClick={() => setRemove(null)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => {
              void auth("delete", remove!);
              setRemove(null);
            }}
          >
            Remove profile
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
