import { AgentTraces } from "./account-reads";
import { PageOperations } from "./page-operations";
import { ResourceTools } from "./resource-tools";
import { pageOperations } from "../lib/page-operations";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, RefreshCw, Sparkles } from "lucide-react";
import {
  aiChildren,
  aiCommands,
  aiDescriptions,
  loadAIItems,
  type AIChild,
  type AIPage,
} from "../lib/ai";
import { useUI } from "../lib/store";
import { Button } from "../components/ui/button";
import { Empty, ErrorBox } from "../components/shared";

export function AI({ page }: { page: AIPage }) {
  const { navigate, account } = useUI();
  if (page === "AI")
    return (
      <div className="page-content ai-page">
        <div className="page-heading">
          <div>
            <h1>AI</h1>
            <p>
              Models, inference, search, and observability for {account.name}.
            </p>
          </div>
          <Sparkles size={25} />
        </div>
        <div className="ai-service-grid">
          {aiChildren.map((child) => (
            <button key={child} onClick={() => navigate(child)}>
              <span>
                <strong>{child}</strong>
                <small>{aiDescriptions[child]}</small>
              </span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      </div>
    );
  if (page === "Agent tracing")
    return (
      <div className="page-content ai-page">
        <div className="page-heading">
          <div>
            <h1>Agent tracing</h1>
            <p>{aiDescriptions[page]}</p>
          </div>
        </div>
        <AgentTraces key={`${account.profile}-${account.id}`} />
      </div>
    );
  return (
    <AIList key={`${account.profile}-${account.id}-${page}`} page={page} />
  );
}
function AIList({ page }: { page: AIChild }) {
  const { account, mode } = useUI();
  const [number, setNumber] = useState(1);
  const [search, setSearch] = useState("");
  const [namespace, setNamespace] = useState("default");
  const [draft, setDraft] = useState("default");
  const query = useQuery({
    queryKey: [
      "ai",
      mode,
      account.profile,
      account.id,
      page,
      number,
      namespace,
    ],
    queryFn: () =>
      mode === "demo"
        ? Promise.resolve(
            number === 1
              ? [
                  {
                    id: `demo-${page}`,
                    name:
                      page === "Models"
                        ? "Example language model"
                        : page === "Workers AI"
                          ? "Text generation"
                          : `Sample ${page.toLowerCase()}`,
                    description:
                      "Sample data · connect an account to view your Cloudflare data.",
                    detail: "Demo",
                  },
                ]
              : [],
          )
        : loadAIItems(
            page,
            { accountId: account.id, profile: account.profile },
            number,
            namespace,
          ),
    enabled: !!account.id,
    retry: false,
  });
  const rows = (query.data || []).filter((row) =>
    `${row.name} ${row.description} ${row.detail}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="page-content ai-page">
      <div className="page-heading">
        <div>
          <h1>{page}</h1>
          <p>{aiDescriptions[page]}</p>
        </div>
        <Button
          disabled={!account.id || query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw size={14} />
          Refresh
        </Button>
      </div>
      {page === "AI Search" && (
        <form
          className="ai-namespace"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) {
              setNamespace(draft.trim());
              setNumber(1);
            }
          }}
        >
          <label>
            Namespace
            <input value={draft} onChange={(e) => setDraft(e.target.value)} />
          </label>
          <Button type="submit" disabled={!draft.trim()}>
            Load namespace
          </Button>
        </form>
      )}
      {pageOperations[page] && (
        <PageOperations
          key={`${page}-${namespace}`}
          operations={pageOperations[page]}
          initialValues={page === "AI Search" ? { name: namespace } : undefined}
        />
      )}
      <div className="log-filters">
        <label className="log-search">
          <input
            aria-label={`Search ${page}`}
            placeholder="Filter this page…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <span>{rows.length} items</span>
      </div>
      {!account.id ? (
        <Empty
          title="Connect an account"
          description="Add a Cloudflare account in Settings to view AI resources."
        />
      ) : query.isPending ? (
        <p role="status">Loading {page.toLowerCase()}…</p>
      ) : query.error ? (
        <ErrorBox error={query.error} />
      ) : rows.length ? (
        <div className="ai-items">
          {rows.map((row) => (
            <article key={row.id}>
              <div>
                <h2>{row.name}</h2>
                {row.description && <p>{row.description}</p>}
                <code>{row.id}</code>
              </div>
              <span>{row.detail}</span>
              <ResourceTools
                page={page}
                id={row.id}
                name={row.name}
                namespace={namespace}
              />
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={search ? "No matching items" : "No items found"}
          description={
            search
              ? "Try a different filter."
              : "There are no items to show for this account and page."
          }
        />
      )}
      {aiCommands[page]?.paginated && (
        <div className="deployment-pagination">
          <Button
            disabled={number === 1 || query.isFetching}
            onClick={() => setNumber(number - 1)}
          >
            Previous
          </Button>
          <span>Page {number}</span>
          <Button
            disabled={!query.data || query.data.length < 20 || query.isFetching}
            onClick={() => setNumber(number + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
