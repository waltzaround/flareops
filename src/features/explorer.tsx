import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Compass,
  Search,
  Terminal,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { ErrorBox, Loading } from "../components/shared";
import { useUI } from "../lib/store";
import { discover, getSchema } from "../lib/cf";
import { useResources } from "../lib/query";
import type { CommandSchema, Discovery, Request } from "../lib/types";
export function Explorer({
  initial,
  onReview,
}: {
  initial: Discovery | null;
  onReview: (r: Request) => void;
}) {
  const { account, zone, setZone } = useUI();
  const zones = useResources("Zones");
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<Discovery[]>([]),
    [selected, setSelected] = useState<Discovery | null>(null),
    [schema, setSchema] = useState<CommandSchema | null>(null),
    [params, setParams] = useState<Record<string, string>>({}),
    [body, setBody] = useState("{}"),
    [error, setError] = useState<unknown>(),
    [loading, setLoading] = useState(false);
  async function search(value = query) {
    if (!value.trim()) return;
    setLoading(true);
    setError(undefined);
    try {
      setResults(await discover(value));
      setSelected(null);
      setSchema(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  async function select(d: Discovery) {
    setSelected(d);
    setSchema(null);
    setParams({});
    setBody(
      d.command.includes("purge")
        ? '{\n  "purge_everything": true\n}'
        : d.command.includes("create")
          ? '{\n  "name": ""\n}'
          : "{}",
    );
    setError(undefined);
    setLoading(true);
    try {
      setSchema(
        await getSchema(
          d.fullPath.length
            ? d.fullPath
            : d.command.replace(/^cf /, "").split(" "),
        ),
      );
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (initial) {
      if (initial.fullPath.length && initial.command) void select(initial);
      else {
        setQuery(initial.description);
        void search(initial.description);
      }
    }
  }, [initial]);
  function review() {
    if (!selected || !schema) return;
    try {
      const parameters: Record<string, unknown> = {};
      for (const p of [...schema.pathParams, ...schema.queryParams]) {
        if (["account_id", "zone_id"].includes(p.name)) continue;
        const raw = params[p.name];
        if (p.required && !raw) throw Error(`${p.name} is required.`);
        if (raw)
          parameters[p.name] = ["number", "integer"].includes(p.type)
            ? Number(raw)
            : p.type === "boolean"
              ? raw === "true"
              : ["array", "object"].includes(p.type)
                ? JSON.parse(raw)
                : raw;
      }
      onReview({
        path: selected.fullPath.length
          ? selected.fullPath
          : selected.command.replace(/^cf /, "").split(" "),
        context: {
          profile: account.profile,
          accountId: account.id,
          zoneId: zone || undefined,
        },
        parameters,
        ...(schema.hasRequestBody ? { body: JSON.parse(body) } : {}),
      });
    } catch (e) {
      setError(e);
    }
  }
  return (
    <div className="page-content explorer">
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE REST OF CLOUDFLARE, WITHIN REACH</div>
          <h1>Cloudflare Explorer</h1>
        </div>
        <span className="quiet-tag">
          <Compass size={14} /> Schema-powered
        </span>
      </div>
      <div className="explorer-search">
        <Search size={19} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Describe a task, like ‘list email routing rules’"
          aria-label="Discover commands"
        />
        <Button variant="default" onClick={() => search()} disabled={loading}>
          Find commands
          <ArrowRight size={15} />
        </Button>
      </div>
      <div className="suggestions">
        Try
        {["list workers", "create an R2 bucket", "list DNS records"].map(
          (s) => (
            <button
              key={s}
              onClick={() => {
                setQuery(s);
                void search(s);
              }}
            >
              {s}
              <ArrowUpRightIcon />
            </button>
          ),
        )}
      </div>
      {!!error && <ErrorBox error={error} />} {loading && <Loading />}
      <div className="explorer-layout">
        <div className="discovery-list">
          {results.map((r) => (
            <button
              key={r.command}
              className={`discovery-card ${selected?.command === r.command ? "selected" : ""}`}
              onClick={() => select(r)}
            >
              <Terminal size={18} />
              <span>
                <strong>{r.command}</strong>
                <small>{r.description}</small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
          {!selected && !loading && results.length === 0 && (
            <div className="explorer-intro">
              <div className="line-art">
                <Terminal size={42} strokeWidth={1} />
                <span />
                <span />
              </div>
              <h2>Your next command starts here.</h2>
              <p>
                Describe what you need. FlareOps asks <code>cf cli search</code>{" "}
                for matching commands and turns their schemas into a reviewable
                action.
              </p>
              <div className="explorer-steps">
                <span>
                  01 <strong>Discover</strong>
                </span>
                <ChevronRight size={14} />
                <span>
                  02 <strong>Configure</strong>
                </span>
                <ChevronRight size={14} />
                <span>
                  03 <strong>Review & run</strong>
                </span>
              </div>
            </div>
          )}
        </div>
        {selected && schema && (
          <div className="schema-form">
            <div className="section-heading">
              <h2>{selected.command}</h2>
              <span className="quiet-tag">{schema.httpMethod}</span>
            </div>
            <p className="muted">{selected.description}</p>
            <div className="review-context">
              <span>
                Account<strong>{account.name}</strong>
              </span>
              <span>
                Profile<strong>{account.profile}</strong>
              </span>
            </div>
            {schema.pathParams.some((p) => p.name === "zone_id") && (
              <label className="field">
                Zone
                <select value={zone} onChange={(e) => setZone(e.target.value)}>
                  <option value="">Select a zone</option>
                  {zones.data?.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {[...schema.pathParams, ...schema.queryParams]
              .filter(
                (p) =>
                  !["account_id", "zone_id", "account.id"].includes(p.name),
              )
              .map((p) => (
                <label className="field" key={p.name}>
                  {p.name.replaceAll("_", " ")}
                  {p.required ? " *" : ""}
                  {p.enum ? (
                    <select
                      value={params[p.name] ?? ""}
                      onChange={(e) =>
                        setParams({ ...params, [p.name]: e.target.value })
                      }
                    >
                      <option value="">Select…</option>
                      {p.enum.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  ) : p.type === "boolean" ? (
                    <select
                      value={params[p.name] ?? ""}
                      onChange={(e) =>
                        setParams({ ...params, [p.name]: e.target.value })
                      }
                    >
                      <option value="">Not set</option>
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  ) : (
                    <input
                      type={
                        ["number", "integer"].includes(p.type)
                          ? "number"
                          : "text"
                      }
                      value={params[p.name] ?? ""}
                      onChange={(e) =>
                        setParams({ ...params, [p.name]: e.target.value })
                      }
                      placeholder={
                        p.type === "object" || p.type === "array"
                          ? "JSON value"
                          : p.type
                      }
                    />
                  )}
                </label>
              ))}
            {schema.hasRequestBody && (
              <label className="field">
                Request body (JSON)
                <textarea
                  rows={7}
                  className="mono"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                <small>
                  Union and nested schemas use JSON. The CLI validates the body
                  during dry-run.
                </small>
              </label>
            )}
            <details>
              <summary>Inspect raw schema</summary>
              <pre>{JSON.stringify(schema, null, 2)}</pre>
            </details>
            <Button variant="default" onClick={review} disabled={!account.id}>
              Review command
              <ArrowRight size={15} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight size={11} />;
}
