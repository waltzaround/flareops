import type { Workspace } from "@cloudflare/computer";
export const bundlePath = ".flareops/preview/worker.js";
export async function readPreviewBundle(ws: Workspace, head: string) {
  const commit = await ws.git.show({ dir: "/workspace", ref: head });
  const blob = await ws.git.catFile({
    dir: "/workspace",
    oid: commit.tree,
    filepath: bundlePath,
  });
  if (!blob.bytes.length || blob.bytes.length > 2000000)
    throw Error("Preview bundle exceeds size limit");
  return blob.bytes;
}
export async function reviewDiff(ws: Workspace, base: string, head: string) {
  const options = { dir: "/workspace", ref: base, to: head };
  const changes = await ws.git.diffSummary(options);
  const paths = changes
    .map((c) => c.path)
    .filter((path) => path !== bundlePath);
  let diff = paths.length ? await ws.git.diff({ ...options, paths }) : "";
  let previewBundle: { bytes: number; sha256: string } | undefined;
  if (changes.some((c) => c.path === bundlePath && c.status !== "D")) {
    const bytes = await readPreviewBundle(ws, head);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      Uint8Array.from(bytes),
    );
    previewBundle = {
      bytes: bytes.length,
      sha256: Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
    };
    diff += `\nGenerated preview bundle: ${bundlePath}\n${previewBundle.bytes} bytes · SHA-256 ${previewBundle.sha256}\nBundle content is available through View bundle in the Preview panel.\n`;
  } else if (changes.some((c) => c.path === bundlePath && c.status === "D"))
    diff += `\nDeleted preview bundle: ${bundlePath}\n`;
  if (new TextEncoder().encode(diff).length > 60000)
    throw Error("Source diff exceeds review limit");
  return { diff, previewBundle };
}

// Read optional declarations from the reviewed tree, never the mutable workspace.
export async function readPreviewResources(
  ws: Workspace,
  head: string,
): Promise<unknown> {
  let path = "";
  for (const part of [".flareops", "preview", "resources.json"]) {
    const entries = await ws.git.lsTree({
      dir: "/workspace",
      ref: head,
      ...(path ? { path } : {}),
    });
    if (!entries.some((entry) => entry.path === part)) return [];
    path = path ? `${path}/${part}` : part;
  }
  const commit = await ws.git.show({ dir: "/workspace", ref: head });
  const blob = await ws.git.catFile({
    dir: "/workspace",
    oid: commit.tree,
    filepath: path,
  });
  if (blob.bytes.length > 16000)
    throw Error("Preview resource manifest exceeds 16 KB");
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
      blob.bytes,
    ),
  );
}
