import git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import type { Workspace } from "@cloudflare/computer";
import type { Env } from "./env";
import { assertSameRefs, safeRemote, type Repository } from "./contracts";

export async function github(
  env: Env,
  path: string,
  method = "GET",
  body?: unknown,
) {
  if (!env.GITHUB_TOKEN)
    throw new Error("Configure the backend GitHub token first.");
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    redirect: "error",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "FlareOps",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(
      `GitHub request failed (${response.status}). Check repository permissions.`,
    );
  return response.json() as Promise<Record<string, any>>;
}
export async function createRepository(
  env: Env,
  host: Repository["host"],
  name: string,
  owner = env.GITHUB_OWNER,
  defaultBranch = "main",
): Promise<Repository> {
  if (host === "artifacts") {
    const repo = await env.ARTIFACTS.create(name, {
      setDefaultBranch: defaultBranch,
    });
    return {
      host,
      name: repo.name,
      remote: safeRemote(repo.remote, host),
      defaultBranch: repo.defaultBranch || "main",
    };
  }
  if (!owner || !/^[a-zA-Z0-9-]{1,39}$/.test(owner))
    throw new Error("Set a GitHub owner first.");
  const me = await github(env, "/user");
  const path =
    String(me.login).toLowerCase() === owner.toLowerCase()
      ? "/user/repos"
      : `/orgs/${owner}/repos`;
  const repo = await github(env, path, "POST", {
    name,
    private: true,
    auto_init: false,
    description: "Created with FlareOps",
  });
  return {
    host,
    owner,
    name,
    remote: safeRemote(repo.clone_url, host),
    defaultBranch: "main",
  };
}
export async function credentials(env: Env, repo: Repository, write = false) {
  safeRemote(repo.remote, repo.host);
  if (repo.host === "github") {
    if (!env.GITHUB_TOKEN) throw new Error("GitHub is not connected.");
    return {
      Authorization: `Basic ${btoa(`x-access-token:${env.GITHUB_TOKEN}`)}`,
    };
  }
  if (
    new URL(repo.remote).hostname !==
    `${env.ACCOUNT_ID}.artifacts.cloudflare.net`
  )
    throw new Error("Repository belongs to another account.");
  using handle = await env.ARTIFACTS.get(repo.name);
  const token = await handle.createToken(write ? "write" : "read", 600);
  return { Authorization: `Bearer ${token.plaintext}` };
}
export async function refs(
  env: Env,
  repo: Repository,
): Promise<Record<string, string>> {
  const values = await git.listServerRefs({
    http,
    url: safeRemote(repo.remote, repo.host),
    headers: await credentials(env, repo),
  });
  return Object.fromEntries(
    values
      .filter(
        (r) => /^refs\/(heads|tags)\//.test(r.ref) && !r.ref.endsWith("^{}"),
      )
      .map((r) => [r.ref, r.oid]),
  );
}
export async function push(
  env: Env,
  ws: Workspace,
  repo: Repository,
  ref: string,
  remoteRef = ref,
  dir = "/workspace",
) {
  const result = await ws.git.push({
    dir,
    url: repo.remote,
    ref,
    remoteRef,
    headers: await credentials(env, repo, true),
  });
  if (!result.ok || Object.values(result.refs).some((v) => !v.ok))
    throw new Error(
      "Repository push rejected. Remote history has not been overwritten.",
    );
}
export async function copyRepository(
  env: Env,
  ws: Workspace,
  source: Repository,
  target: Repository,
  expected: Record<string, string>,
) {
  // Never shallow-clone migration data. Copy every advertised branch and tag.
  const dir = `/migration/${target.name}`;
  try {
    await ws.fs.stat(`${dir}/.git`);
  } catch {
    await ws.git.clone({
      dir,
      url: source.remote,
      headers: await credentials(env, source),
      depth: 0,
      singleBranch: false,
      noTags: false,
    });
  }
  for (const [ref, oid] of Object.entries(expected)) {
    await ws.git.fetch({
      dir,
      url: source.remote,
      ref,
      singleBranch: true,
      headers: await credentials(env, source),
    });
    await ws.git.updateRef({ dir, ref, value: oid });
    await push(env, ws, target, ref, ref, dir);
  }
  assertSameRefs(expected, await refs(env, target));
  assertSameRefs(expected, await refs(env, source));
  await github(env, `/repos/${target.owner}/${target.name}`, "PATCH", {
    default_branch: source.defaultBranch,
  });
}
