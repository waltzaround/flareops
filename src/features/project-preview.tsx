import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { harnessScope, harnessCall } from "../lib/harness";
import type { ProjectScope } from "../lib/projects";
type Preview = {
  head: string;
  name: string;
  worker: string;
  deploymentId: string;
  previewUrls: string[];
  deploymentUrls: string[];
  createdAt: string;
  access: "configured" | "unconfigured";
  accessEmail?: string;
  resources: { type: string; binding: string; name: string }[];
};
export function ProjectPreview({
  scope,
  endpoint,
  projectId,
  head,
}: {
  scope: ProjectScope;
  endpoint: string;
  projectId: string;
  head: string;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [plannedResources, setPlannedResources] = useState<
    { type: string; binding: string }[]
  >([]);
  const [deleteData, setDeleteData] = useState(false);
  const [bundle, setBundle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState<"deploy" | "delete" | null>(null);
  const request = (action: string) =>
    invoke<Preview | null>("harness_preview", {
      scope: harnessScope(scope, endpoint),
      projectId,
      head,
      action,
    });
  useEffect(() => {
    let current = true;
    void request("status")
      .then((value) => {
        if (current) setPreview(value);
      })
      .catch((error) => {
        if (current) setError(String(error));
      });
    return () => {
      current = false;
    };
  }, [scope.accountId, scope.profile, endpoint, projectId, head]);
  async function act(action: "deploy" | "status" | "delete" | "delete-data") {
    setBusy(true);
    setError("");
    setConfirm(null);
    try {
      const value = await request(action);
      setPreview(action.startsWith("delete") ? null : value);
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="harness-run" aria-label="Cloudflare Preview">
      <header>
        <strong>Preview</strong>
        <code>{head.slice(0, 8)}</code>
      </header>
      <div className="harness-actions">
        <Button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const artifact = await harnessCall<{
                head: string;
                resources?: { type: string; binding: string }[];
              }>(scope, endpoint, "preview-artifact", projectId);
              if (artifact.head !== head)
                throw Error("Review changed. Refresh first.");
              if (
                artifact.resources &&
                (!Array.isArray(artifact.resources) ||
                  artifact.resources.some(
                    (item) =>
                      !item ||
                      !["d1", "kv", "r2"].includes(item.type) ||
                      typeof item.binding !== "string",
                  ))
              )
                throw Error("Invalid preview resource manifest.");
              setPlannedResources(artifact.resources || []);
              setConfirm("deploy");
            } catch (error) {
              setError(String(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Working…" : preview ? "Redeploy preview" : "Deploy preview"}
        </Button>
        <Button
          type="button"
          disabled={busy}
          onClick={() => void act("status")}
          aria-label="Refresh preview"
        >
          <RefreshCw size={14} />
        </Button>
        {(preview || error) && (
          <Button
            type="button"
            disabled={busy}
            onClick={() => setConfirm("delete")}
          >
            <Trash2 size={14} />
            Delete preview
          </Button>
        )}
      </div>
      <Button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const result = await harnessCall<{ head: string; code: string }>(
              scope,
              endpoint,
              "preview-artifact",
              projectId,
            );
            if (result.head !== head)
              throw Error("Review changed. Refresh first.");
            setBundle(result.code);
          } catch (error) {
            setError(String(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        View bundle
      </Button>
      <Dialog
        open={bundle !== null}
        onOpenChange={(open) => {
          if (!open) setBundle(null);
        }}
        title="Preview bundle"
        description={`Committed Worker bundle for ${head.slice(0, 8)}`}
      >
        <textarea
          readOnly
          value={bundle || ""}
          aria-label="Preview bundle source"
          style={{ width: "100%", height: "50vh", fontFamily: "monospace" }}
        />
      </Dialog>
      {preview && (
        <p>
          {preview.access === "configured"
            ? `Access configured for ${preview.accessEmail || "the preview owner"}`
            : "Access is not configured. Redeploy to protect this preview."}
        </p>
      )}
      {!!preview?.resources?.length && (
        <ul>
          {preview.resources.map((resource) => (
            <li key={resource.binding}>
              <code>{resource.binding}</code> · {resource.type.toUpperCase()} ·{" "}
              {resource.name}
            </li>
          ))}
        </ul>
      )}
      {preview?.previewUrls.map((url) => (
        <p key={url}>
          <a href={url} target="_blank" rel="noopener noreferrer">
            Open preview <ExternalLink size={14} />
          </a>
        </p>
      ))}
      {preview?.deploymentUrls.map((url) => (
        <p key={url}>
          <a href={url} target="_blank" rel="noopener noreferrer">
            Exact deployment <ExternalLink size={14} />
          </a>
        </p>
      ))}
      {preview && (
        <p>
          <a
            href={`https://dash.cloudflare.com/${scope.accountId}/workers/services/view/${preview.worker}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Deployments, logs and preview settings
          </a>
        </p>
      )}
      {preview &&
        !preview.previewUrls.length &&
        !preview.deploymentUrls.length && (
          <p>
            Deployed, but Cloudflare returned no active preview URL. Check
            preview routing in the dashboard.
          </p>
        )}
      {error && (
        <p className="danger" role="alert">
          {error}
        </p>
      )}
      <Dialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={
          confirm === "delete"
            ? "Delete this preview?"
            : "Deploy this review as a preview?"
        }
        description={
          confirm === "delete"
            ? "Deletes the preview and all of its deployments. Isolated data and project Access protection are retained for redeployment. Manage retained resources in Cloudflare."
            : "Requires sign-in with your Cloudflare user email. Automatically creates and binds isolated D1, KV and R2 resources declared in this review. Preview and storage usage incur Cloudflare charges."
        }
      >
        {confirm === "deploy" && (
          <p>
            Zero Trust must be enabled, with permission to manage Access and the
            requested storage. Setup stops before upload if protection cannot be
            configured. Data is isolated per review and reused on redeploy.
          </p>
        )}
        {confirm === "deploy" &&
          (plannedResources.length ? (
            <ul>
              {plannedResources.map((item) => (
                <li key={item.binding}>
                  <code>{item.binding}</code> · {item.type.toUpperCase()}
                </li>
              ))}
            </ul>
          ) : (
            <p>No data resources requested in this review.</p>
          ))}
        {confirm === "delete" && (
          <label>
            <input
              type="checkbox"
              checked={deleteData}
              onChange={(event) => setDeleteData(event.target.checked)}
            />{" "}
            Also permanently delete this review’s D1 and KV data and empty R2
            buckets. Nonempty buckets require cleanup in Cloudflare.
          </label>
        )}
        <Button
          type="button"
          variant="default"
          onClick={() =>
            confirm &&
            void act(
              confirm === "delete" && deleteData ? "delete-data" : confirm,
            )
          }
        >
          {confirm === "delete" ? "Delete preview" : "Deploy preview"}
        </Button>
      </Dialog>
    </section>
  );
}
