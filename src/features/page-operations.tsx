import bundledSchemas from "../lib/page-operation-schemas.json";
import "./page-operations.css";
import type { CommandSchema, Parameter } from "../lib/types";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSchema, prepare, runPlan, unwrap } from "../lib/cf";
import {
  operationParameters,
  operationRequest,
  resourceReadRequest,
  type PageOperation,
} from "../lib/page-operations";
import type { Request } from "../lib/types";
import { useUI, isDesktop } from "../lib/store";
import { useResources } from "../lib/query";
import { Button } from "../components/ui/button";
import { ErrorBox, Loading } from "../components/shared";
import { CommandReview } from "./command-review";

function OperationResult({ data }: { data: unknown }) {
  const value = unwrap(data);
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const rows = Array.isArray(value)
    ? value
    : value &&
        typeof value === "object" &&
        Array.isArray((value as Record<string, unknown>).data)
      ? (value as { data: unknown[] }).data
      : null;
  const columns = rows
    ? [
        ...new Set(
          rows.flatMap((row) =>
            row && typeof row === "object" ? Object.keys(row) : [],
          ),
        ),
      ]
    : [];
  const text = (v: unknown) =>
    v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return (
    <section className="operation-result" aria-label="Operation results">
      <h3>Results</h3>
      {rows && rows.length === 0 ? (
        <p>No results returned.</p>
      ) : rows && columns.length ? (
        <>
          <p>
            {rows.length} results
            {rows.length > 100
              ? " · First 100 shown below; all results are in the response."
              : ""}
          </p>
          <div className="operation-table">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c}>{c.replaceAll("_", " ")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((row, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c}>
                        {text((row as Record<string, unknown>)[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : record ? (
        <dl className="operation-properties">
          {Object.entries(record).map(([key, value]) => (
            <div key={key}>
              <dt>{key.replaceAll("_", " ")}</dt>
              <dd>
                {value && typeof value === "object" ? (
                  <pre>{JSON.stringify(value, null, 2)}</pre>
                ) : (
                  text(value)
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : value == null ? (
        <p>Operation completed. No response body was returned.</p>
      ) : (
        <pre>
          {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
        </pre>
      )}
      {(rows || record) && (
        <details>
          <summary>Full response</summary>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}
function OperationForm({
  operation,
  initialValues,
  resourceMode = false,
}: {
  operation: PageOperation;
  initialValues: Record<string, string>;
  resourceMode?: boolean;
}) {
  const { account, mode, zone, setZone } = useUI();
  const zones = useResources("Zones");
  const schema = useQuery({
    queryKey: ["operation-schema", mode, operation.command],
    queryFn: () =>
      mode === "demo" || !isDesktop
        ? Promise.resolve(
            (bundledSchemas as Record<string, CommandSchema>)[
              operation.command
            ],
          )
        : getSchema(operation.command.split(" ")),
    retry: false,
  });
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [body, setBody] = useState(
    operation.sql ? "SELECT * FROM your_dataset LIMIT 100 FORMAT JSON" : "{}",
  );
  const [meeting, setMeeting] = useState({
    title: "",
    persist_chat: "",
    record_on_start: "",
  });
  const createsMeeting = operation.command === "realtime kit meetings create";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [result, setResult] = useState<{ data: unknown }>();
  const [review, setReview] = useState<Request | null>(null);
  const initialRead = resourceMode
    ? resourceReadRequest(
        operation,
        schema.data,
        {
          profile: account.profile,
          accountId: account.id,
          zoneId: zone || undefined,
        },
        initialValues,
      )
    : undefined;
  const details = useQuery({
    queryKey: ["resource-operation", mode, initialRead],
    enabled: !!initialRead,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      if (!initialRead)
        throw Error("Select an operation and supply its required fields.");
      const plan = await prepare(initialRead);
      if (plan.classification !== "Read")
        throw Error(
          "This operation requires review. Use Review change to continue.",
        );
      const execution = await runPlan(plan, false, false);
      if (!execution.success)
        throw Error(
          execution.error || "Cloudflare could not load this resource.",
        );
      return { data: execution.data };
    },
  });
  async function submit() {
    if (!schema.data || busy) return;
    setError(undefined);
    setResult(undefined);
    setBusy(true);
    try {
      const request = operationRequest(
        operation,
        schema.data,
        {
          profile: account.profile,
          accountId: account.id,
          zoneId: zone || undefined,
        },
        values,
        createsMeeting
          ? JSON.stringify({
              ...(meeting.title.trim() ? { title: meeting.title.trim() } : {}),
              ...(meeting.persist_chat
                ? { persist_chat: meeting.persist_chat === "true" }
                : {}),
              ...(meeting.record_on_start
                ? { record_on_start: meeting.record_on_start === "true" }
                : {}),
            })
          : body,
      );
      const plan = await prepare(request);
      if (plan.classification !== "Read") {
        setReview(request);
        return;
      }
      const execution = await runPlan(plan, false, false);
      if (!execution.success)
        throw Error(
          execution.error || "Cloudflare could not complete this operation.",
        );
      setResult({ data: execution.data });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  if (schema.isPending) return <Loading />;
  if (schema.isError)
    return (
      <ErrorBox error={schema.error} retry={() => void schema.refetch()} />
    );
  const fields = operationParameters(schema.data);
  const renderField = (p: Parameter) => {
    const required = !!p.required || !!operation.required?.includes(p.name);
    return (
      <label className="field" key={p.name}>
        {p.name.replaceAll("_", " ").replaceAll("-", " ")}
        {required ? " *" : ""}
        {p.enum || p.type === "boolean" ? (
          <select
            required={required}
            value={values[p.name] ?? ""}
            onChange={(e) => setValues({ ...values, [p.name]: e.target.value })}
          >
            <option value="">{required ? "Select…" : "Default"}</option>
            {(p.enum ?? ["true", "false"]).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        ) : (
          <input
            readOnly={
              resourceMode &&
              !!initialValues[p.name] &&
              schema.data.pathParams.some((field) => field.name === p.name)
            }
            required={required}
            type={["number", "integer"].includes(p.type) ? "number" : "text"}
            step={p.type === "integer" ? 1 : "any"}
            value={values[p.name] ?? ""}
            onChange={(e) => setValues({ ...values, [p.name]: e.target.value })}
            placeholder={
              ["array", "object"].includes(p.type) ? "JSON value" : undefined
            }
          />
        )}
        {p.description && <small>{p.description}</small>}
      </label>
    );
  };
  const requiredField = (p: Parameter) =>
    !!p.required || !!operation.required?.includes(p.name);
  const optionalFields = fields.filter((p) => !requiredField(p));
  const needsZone = schema.data.pathParams.some((p) => p.name === "zone_id");
  return (
    <div className="operation-form">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {needsZone && (
          <label className="field">
            Zone
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              required
            >
              <option value="">Select a zone</option>
              {zones.data?.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {needsZone && zones.isError && <ErrorBox error={zones.error} />}
        <div className="operation-fields">
          {fields.filter(requiredField).map(renderField)}
        </div>
        {optionalFields.length > 0 && (
          <details className="operation-options">
            <summary>
              Optional filters and parameters ({optionalFields.length})
            </summary>
            <div className="operation-fields">
              {optionalFields.map(renderField)}
            </div>
          </details>
        )}
        {createsMeeting && (
          <fieldset className="meeting-configuration">
            <legend>New meeting</legend>
            <label className="field">
              Meeting title
              <input
                value={meeting.title}
                onChange={(e) =>
                  setMeeting({ ...meeting, title: e.target.value })
                }
                placeholder="Weekly team meeting"
              />
            </label>
            {(
              [
                ["persist_chat", "Keep meeting chat"],
                ["record_on_start", "Record when the meeting starts"],
              ] as const
            ).map(([key, label]) => (
              <label className="field" key={key}>
                {label}
                <select
                  value={meeting[key]}
                  onChange={(e) =>
                    setMeeting({ ...meeting, [key]: e.target.value })
                  }
                >
                  <option value="">Use service default</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
            ))}
          </fieldset>
        )}
        {!createsMeeting && (schema.data.hasRequestBody || operation.sql) && (
          <label className="field">
            {operation.sql ? "SQL query" : "Configuration (JSON)"}
            <textarea
              className="mono"
              rows={8}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            {!operation.sql && (
              <small>
                Use API property names and nested objects for this
                configuration.
              </small>
            )}
          </label>
        )}
        {!account.id && (
          <p>Connect an account in Settings to use this operation.</p>
        )}
        <Button
          type="submit"
          disabled={
            !account.id || busy || details.isFetching || (needsZone && !zone)
          }
        >
          {busy || details.isFetching
            ? "Running…"
            : schema.data.httpMethod === "GET" || operation.sql
              ? resourceMode
                ? "Refresh results"
                : "Run"
              : "Review change"}
        </Button>
      </form>
      {!!error && <ErrorBox error={error} />}
      <div aria-live="polite">
        {details.isFetching && !result && <Loading />}
      </div>
      {!result && details.isError && (
        <ErrorBox error={details.error} retry={() => void details.refetch()} />
      )}
      {(result || details.data) && (
        <OperationResult data={(result || details.data)!.data} />
      )}
      <CommandReview request={review} onClose={() => setReview(null)} />
    </div>
  );
}
export function PageOperations({
  operations,
  initialValues = {},
  resourceMode = false,
}: {
  operations: PageOperation[];
  initialValues?: Record<string, string>;
  resourceMode?: boolean;
}) {
  const { account, mode, zone } = useUI();
  const [selected, setSelected] = useState(operations[0].command);
  const operation =
    operations.find((o) => o.command === selected) ?? operations[0];
  return (
    <section className="page-operations">
      <h2>{resourceMode ? "Details & actions" : "Tools"}</h2>
      <label className="field">
        Operation
        <select
          value={operation.command}
          onChange={(e) => setSelected(e.target.value)}
        >
          {operations.map((o) => (
            <option value={o.command} key={o.command}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <OperationForm
        key={`${operation.command}-${account.id}-${account.profile}-${mode}-${zone}`}
        operation={operation}
        initialValues={initialValues}
        resourceMode={resourceMode}
      />
    </section>
  );
}
