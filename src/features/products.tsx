import { TunnelStatus } from "../components/tunnel-status";
import {
  UnsupportedFeature,
  DashboardLink,
} from "../components/unsupported-feature";
import { StreamAnalytics } from "./stream-analytics";
import { ResourceTools } from "./resource-tools";
import { PageHeaderActions } from "../components/page-header-actions";
import { PageOperations } from "./page-operations";
import { pageOperations } from "../lib/page-operations";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, RefreshCw, Terminal, BookOpen } from "lucide-react";
import { useUI } from "../lib/store";
import {
  products,
  loadProductItems,
  productDiscovery,
  type ProductPage,
} from "../lib/products";
import type { Discovery } from "../lib/types";
import { Button } from "../components/ui/button";
import { Empty, ErrorBox } from "../components/shared";

export function Product({
  page,
  onCommand,
}: {
  page: ProductPage;
  onCommand: (value: Discovery) => void;
}) {
  const { account, mode, navigate } = useUI();
  const config = products[page];
  const [number, setNumber] = useState(1);
  const [cursors, setCursors] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: [
      "resources",
      mode,
      account.profile,
      account.id,
      "product",
      page,
      number,
    ],
    queryFn: () =>
      mode === "demo"
        ? Promise.resolve({
            items: [
              {
                id: `sample-${page}`,
                name: `Sample ${page}`,
                detail: page === "Tunnels" ? "healthy" : "Demo data",
              },
            ],
            hasNext: false,
            nextCursor: undefined as string | undefined,
          })
        : loadProductItems(
            page,
            { profile: account.profile, accountId: account.id },
            number,
            cursors[number],
          ),
    enabled: !!account.id && !!config.list,
  });
  const rows = (query.data?.items ?? []).filter((row) =>
    `${row.name} ${row.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="page-content ai-page">
      <div className="page-heading">
        <div>
          <h1>
            {config.title ??
              (page === "Media plans"
                ? "Plans"
                : page === "Hyperdrive"
                  ? "Postgres & MySQL (Hyperdrive)"
                  : page)}
          </h1>
          <p>
            {config.description} · {account.name}
          </p>
        </div>
        {config.list && (
          <Button
            disabled={!account.id || query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={14} />
            Refresh
          </Button>
        )}
      </div>
      <PageHeaderActions>
        <DashboardLink />
        {config.command && (
          <Button
            title="Explore commands"
            onClick={() => onCommand(productDiscovery(page))}
          >
            <span>Explore commands</span> <Terminal size={14} />
          </Button>
        )}
        {config.docs && (
          <a
            title="Documentation"
            href={`https://developers.cloudflare.com/${config.docs}/`}
            target="_blank"
            rel="noreferrer"
          >
            <span>Documentation</span> <BookOpen size={14} />
          </a>
        )}
      </PageHeaderActions>
      {page === "Stream analytics" && (
        <StreamAnalytics key={`${account.id}-${account.profile}-${mode}`} />
      )}
      {config.children && (
        <div className="ai-service-grid">
          {config.children.map((child) => (
            <button key={child} onClick={() => navigate(child)}>
              <span>
                <strong>
                  {child === "Networking insights" ? "Insights" : child}
                </strong>
                <small>{products[child].description}</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))}
        </div>
      )}
      {!config.list &&
        !config.children &&
        !pageOperations[page] &&
        page !== "Stream analytics" && <UnsupportedFeature feature={page} />}
      {pageOperations[page] && (
        <PageOperations key={page} operations={pageOperations[page]} />
      )}
      {config.list && (
        <>
          <div className="log-filters">
            <label className="log-search">
              <input
                aria-label={`Search ${page}`}
                placeholder="Filter these results…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <span>
              {rows.length} items{mode === "demo" ? " · Sample data" : ""}
            </span>
          </div>
          {!account.id ? (
            <Empty
              title="Connect an account"
              description="Add a Cloudflare account in Settings to view resources."
            />
          ) : query.isPending ? (
            <p role="status">Loading resources…</p>
          ) : query.isError ? (
            <ErrorBox error={query.error} />
          ) : rows.length ? (
            <div className="ai-items">
              {rows.map((row) => (
                <article
                  key={row.id}
                  className={page === "Tunnels" ? "tunnel-resource" : undefined}
                >
                  <div>
                    <h2>{row.name}</h2>
                    <code>{row.id}</code>
                  </div>
                  {page === "Tunnels" ? (
                    <TunnelStatus status={row.detail} />
                  ) : (
                    <span>{row.detail}</span>
                  )}
                  <ResourceTools page={page} id={row.id} name={row.name} />
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title={search ? "No matching resources" : "No resources found"}
              description={
                search
                  ? "Try a different filter."
                  : "No resources were returned for this account and page."
              }
            />
          )}
          {config.pagination ? (
            <div className="deployment-pagination">
              <Button
                disabled={number === 1 || query.isFetching}
                onClick={() => setNumber(number - 1)}
              >
                Previous
              </Button>
              <span>Page {number}</span>
              <Button
                disabled={!query.data?.hasNext || query.isFetching}
                onClick={() => {
                  if (query.data?.nextCursor)
                    setCursors({
                      ...cursors,
                      [number + 1]: query.data.nextCursor,
                    });
                  setNumber(number + 1);
                }}
              >
                Next
              </Button>
            </div>
          ) : (
            <p className="product-note">
              Showing the results returned by Cloudflare. Explore commands for
              additional filters and pagination options.
            </p>
          )}
        </>
      )}
    </div>
  );
}
