import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Copy, RefreshCw } from "lucide-react";
import { useUI } from "../lib/store";
import {
  buildsForDeployment,
  loadBuildLog,
  loadDeployments,
  sampleDeployments,
  type Deployment,
} from "../lib/deployments";
import type { Resource } from "../lib/types";
import { Button } from "../components/ui/button";
import { Empty, ErrorBox } from "../components/shared";
import { copy, formatTimestamp } from "../lib/utils";

export function Deployments({
  resource,
  builds,
}: {
  resource: Resource;
  builds: boolean;
}) {
  const { account, mode } = useUI();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string>();
  const context = { accountId: account.id, profile: account.profile };
  const query = useQuery({
    queryKey: [
      "deployments",
      mode,
      account.profile,
      account.id,
      resource.kind,
      resource.product,
      resource.name,
      builds,
      page,
    ],
    queryFn: () =>
      mode === "demo"
        ? Promise.resolve(page === 1 ? sampleDeployments(resource) : [])
        : loadDeployments(resource, context, builds, page),
    retry: false,
  });
  return (
    <section className="deployment-panel">
      <div className="deployment-heading">
        <h3>{builds ? "Build logs" : "Deployments"}</h3>
        <Button
          size="sm"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw size={13} />
          Refresh
        </Button>
      </div>
      <p>
        {resource.product === "Pages"
          ? "Select a deployment to read its build output."
          : builds
            ? "Cloudflare builds, including failed builds. Select a build to read its output."
            : "Deployment history. Select a deployment to see logs from its associated Cloudflare builds."}
      </p>
      {query.isPending && <p role="status">Loading deployments…</p>}
      {query.error && <ErrorBox error={query.error} />}
      {query.data?.length === 0 && (
        <Empty
          title="No deployments found"
          description={
            builds
              ? "Builds will appear here when this Worker uses Cloudflare Builds."
              : "No deployments on this page."
          }
        />
      )}
      {query.data?.map((deployment) => (
        <div className="deployment-item" key={deployment.id}>
          <button
            className="deployment-row"
            aria-expanded={selected === deployment.id}
            onClick={() =>
              setSelected(
                selected === deployment.id ? undefined : deployment.id,
              )
            }
          >
            {selected === deployment.id ? (
              <ChevronDown size={15} />
            ) : (
              <ChevronRight size={15} />
            )}
            <span>
              <strong>{deployment.label}</strong>
              <small>{deployment.id}</small>
              <small>
                {deployment.created
                  ? formatTimestamp(deployment.created)
                  : "Time unavailable"}
              </small>
            </span>
            <span
              className={
                /fail|error/i.test(deployment.status) ? "danger" : "muted"
              }
            >
              {deployment.status}
            </span>
          </button>
          {selected === deployment.id && (
            <DeploymentLogs resource={resource} deployment={deployment} />
          )}
        </div>
      ))}
      <div className="deployment-pagination">
        <Button
          size="sm"
          disabled={page === 1 || query.isFetching}
          onClick={() => {
            setPage(page - 1);
            setSelected(undefined);
          }}
        >
          Previous
        </Button>
        <span>Page {page}</span>
        <Button
          size="sm"
          disabled={!query.data || query.data.length < 20 || query.isFetching}
          onClick={() => {
            setPage(page + 1);
            setSelected(undefined);
          }}
        >
          Next
        </Button>
      </div>
    </section>
  );
}
function DeploymentLogs({
  resource,
  deployment,
}: {
  resource: Resource;
  deployment: Deployment;
}) {
  const { account, mode } = useUI();
  const query = useQuery({
    queryKey: [
      "deployment-builds",
      mode,
      account.profile,
      account.id,
      resource.name,
      resource.product,
      deployment.id,
    ],
    queryFn: () =>
      mode === "demo" || resource.product === "Pages"
        ? Promise.resolve([deployment])
        : buildsForDeployment(deployment, {
            accountId: account.id,
            profile: account.profile,
          }),
    retry: false,
  });
  return (
    <div className="deployment-detail">
      {query.isPending && <p>Finding build logs…</p>}
      {query.error && (
        <>
          <ErrorBox error={query.error} />
          <Button size="sm" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </>
      )}
      {query.data?.length === 0 && (
        <p>
          No Cloudflare build logs are associated with this deployment.
          Deployments uploaded from local tools or external CI may have logs in
          that build system.
        </p>
      )}
      {query.data?.map((build) => (
        <LogOutput
          key={build.id}
          resource={resource}
          id={
            resource.product === "Pages"
              ? deployment.id
              : build.buildId || build.id
          }
          failed={/fail|error/i.test(build.status)}
        />
      ))}
    </div>
  );
}
function LogOutput({
  resource,
  id,
  failed,
}: {
  resource: Resource;
  id: string;
  failed: boolean;
}) {
  const { account, mode } = useUI();
  const query = useInfiniteQuery({
    queryKey: [
      "deployment-log",
      mode,
      account.profile,
      account.id,
      resource.kind,
      resource.product,
      resource.name,
      id,
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      mode === "demo"
        ? Promise.resolve({
            text: `[Sample build output]\nCloning repository…\nInstalling dependencies…\nRunning build…\n${failed ? "Build failed: dependency installation failed." : "Build completed. Deployment successful."}`,
            truncated: false,
            cursor: undefined as string | undefined,
          })
        : loadBuildLog(
            resource,
            { accountId: account.id, profile: account.profile },
            id,
            pageParam,
          ),
    getNextPageParam: (last, _pages, _param, params) =>
      last.cursor && !params.includes(last.cursor) ? last.cursor : undefined,
    retry: false,
  });
  const text = query.data?.pages.map((page) => page.text).join("\n") || "";
  return (
    <div className="deployment-log">
      <div className="deployment-heading">
        <strong>Build output</strong>
        <div>
          <Button
            size="sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={13} />
            Refresh logs
          </Button>
          <Button size="sm" disabled={!text} onClick={() => copy(text)}>
            <Copy size={13} />
            Copy logs
          </Button>
        </div>
      </div>
      {query.isPending && <p role="status">Loading logs…</p>}
      {query.error && <ErrorBox error={query.error} />}
      {query.data && (
        <pre tabIndex={0} aria-label="Build output">
          {text || "No log lines available yet."}
        </pre>
      )}
      {query.hasNextPage && (
        <Button
          size="sm"
          disabled={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        >
          Load more logs
        </Button>
      )}
      {query.data?.pages.at(-1)?.truncated && !query.hasNextPage && (
        <p>
          Cloudflare returned partial logs. Refresh to check for more output.
        </p>
      )}
    </div>
  );
}
