import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SlidersHorizontal } from "lucide-react";
import { Dialog } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { isDesktop } from "../lib/store";
import type { ProjectScope } from "../lib/projects";
import {
  providerLabels,
  providerSnapshot,
  useProviders,
  type Provider,
  type ProviderConfig,
} from "../lib/providers";

export function ProviderPicker({
  scope,
  config,
}: {
  scope: ProjectScope;
  config: ProviderConfig;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        className="provider-picker"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal size={14} /> {providerLabels[config.provider]}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="AI provider"
        description="Choose the provider for new prompts in this account."
      >
        {open && (
          <ProviderForm
            scope={scope}
            config={config}
            close={() => setOpen(false)}
          />
        )}
      </Dialog>
    </>
  );
}

export function ProviderForm({
  scope,
  config,
  close,
}: {
  scope: ProjectScope;
  config: ProviderConfig;
  close: () => void;
}) {
  const [draft, setDraft] = useState(config);
  const [secret, setSecret] = useState("");
  const [stored, setStored] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const native = isDesktop && scope.mode === "live";
  const save = useProviders((s) => s.save);
  const credentialScope = (value: ProviderConfig) => ({
    accountId: scope.accountId,
    profile: scope.profile,
    provider: value.provider,
    endpoint: value.endpoint,
  });
  useEffect(() => {
    let active = true;
    setStored(undefined);
    setSecret("");
    setError("");
    if (native && draft.provider !== "cloudflare") {
      try {
        const clean = providerSnapshot(draft);
        invoke<boolean>("provider_credential", {
          scope: credentialScope(clean),
          action: "status",
        }).then(
          (value) => {
            if (active) setStored(value);
          },
          () => {
            if (active) setError("Could not read the OS credential store.");
          },
        );
      } catch {
        /* Incomplete endpoint: validate when saving. */
      }
    }
    return () => {
      active = false;
    };
  }, [draft.provider, draft.endpoint, native, scope.accountId, scope.profile]);

  return (
    <form
      className="provider-form"
      onSubmit={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        setError("");
        setBusy(true);
        try {
          const clean = providerSnapshot(draft);
          if (native && secret.trim()) {
            await invoke("provider_credential", {
              scope: credentialScope(clean),
              action: "save",
              secret,
            });
            setSecret("");
          }
          save(scope, clean);
          close();
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : "Could not save provider settings. Try again.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Provider
        <select
          disabled={busy}
          value={draft.provider}
          onChange={(e) => {
            const provider = e.target.value as Provider;
            setDraft({ provider, model: "", endpoint: "" });
          }}
        >
          {Object.entries(providerLabels).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
              {id === "cloudflare" ? " (default)" : ""}
            </option>
          ))}
        </select>
      </label>
      {draft.provider === "compatible" && (
        <label>
          API base URL
          <input
            disabled={busy}
            type="url"
            required
            value={draft.endpoint}
            placeholder="https://your-provider.com/v1"
            onChange={(e) => setDraft({ ...draft, endpoint: e.target.value })}
          />
        </label>
      )}
      <label>
        Model
        <input
          disabled={busy}
          value={draft.model}
          maxLength={200}
          placeholder="Enter a model ID"
          onChange={(e) => setDraft({ ...draft, model: e.target.value })}
        />
      </label>
      {draft.provider === "cloudflare" && (
        <p>
          Cloudflare is the default. Connect the agent backend for this account
          to start running prompts.
        </p>
      )}
      {draft.provider === "cloudflare" ? (
        <p>
          Use the connected agent backend’s Workers AI binding. No separate
          model key is required.
        </p>
      ) : native ? (
        <>
          <label>
            {stored ? "Replace API key" : "API key"}
            <input
              type="password"
              disabled={busy}
              value={secret}
              autoComplete="new-password"
              spellCheck={false}
              maxLength={8192}
              placeholder={
                stored
                  ? "Leave blank to keep the saved key"
                  : "Paste your API key"
              }
              onChange={(e) => setSecret(e.target.value)}
            />
          </label>
          <p>
            {stored
              ? "Key saved in the OS credential store. Connection not tested."
              : "Keys are saved in the OS credential store, separately for this account and profile."}
          </p>
          {stored && (
            <Button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await invoke("provider_credential", {
                    scope: credentialScope(providerSnapshot(draft)),
                    action: "remove",
                  });
                  setStored(false);
                  setSecret("");
                } catch {
                  setError("Could not remove the saved key.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove saved key
            </Button>
          )}
        </>
      ) : (
        <p>Open the desktop app in live mode to securely add an API key.</p>
      )}
      <p>
        The live agent backend currently supports Cloudflare. Other provider
        settings are saved for future adapters.
      </p>
      {error && (
        <p role="alert" className="danger">
          {error}
        </p>
      )}
      <div className="provider-actions">
        <Button type="button" disabled={busy} onClick={close}>
          Cancel
        </Button>
        <Button type="submit" variant="default" disabled={busy}>
          {busy ? "Saving…" : "Save provider"}
        </Button>
      </div>
    </form>
  );
}
