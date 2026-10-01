import type { CommandSchema, Context, Request } from "./types";

export type PageOperation = {
  label: string;
  command: string;
  required?: string[];
  sql?: boolean;
};
const op = (
  label: string,
  command: string,
  required?: string[],
): PageOperation => ({ label, command, required });
const intelligence = [
  op("Domain intelligence", "intel domains get", ["domain"]),
  op("WHOIS lookup", "intel whois get", ["domain"]),
  op("DNS history", "intel dns list"),
  op("URL intelligence", "intel urls get", ["url"]),
  op("ASN overview", "intel asn get"),
];
// Command paths verified against the bundled cf schema catalog.
export const pageOperations: Record<string, PageOperation[]> = {
  BotBase: [
    op("Bot details", "radar bots get"),
    op("Browse bots", "radar bots list"),
  ],
  "R2 Data Catalog": [
    op("Catalog details", "basin-catalog get"),
    op("Namespaces", "basin-catalog namespaces list"),
    op("Tables", "basin-catalog namespaces tables list"),
    op("Maintenance configuration", "basin-catalog maintenance-configs get"),
    op("Enable catalog", "basin-catalog enable"),
    op(
      "Update maintenance configuration",
      "basin-catalog maintenance-configs update",
    ),
  ],
  "Blocked content": [
    op("Abuse reports", "abuse-reports list"),
    op("Content mitigations for a report", "abuse-reports mitigations list"),
  ],
  Models: [op("Model schema", "ai get-model-schema")],
  "Workers AI": [
    op("Model schema", "ai get-model-schema"),
    op("Fine-tuned models", "ai finetunes list"),
  ],
  "AI Gateway": [
    op("Gateway details", "ai-gateway gateways get"),
    op("Request logs", "ai-gateway logs list"),
    op("Custom domains", "ai-gateway custom-domains list"),
    op("Create gateway", "ai-gateway gateways create"),
    op("Update gateway", "ai-gateway gateways update"),
  ],
  "MCP Portals": [
    op("Portal details", "mcp portals read"),
    op("Connected servers", "mcp servers list"),
    op("Tool-call analytics", "mcp portals tool-call-analytics"),
  ],
  Vectorize: [
    op("Index details", "vectorize get"),
    op("Index statistics", "vectorize info"),
    op("Metadata indexes", "vectorize metadata-index list"),
    op("Create index", "vectorize create"),
  ],
  "AI Search": [
    op("Instance details", "ai-search get"),
    op("Search statistics", "ai-search stats"),
    op("Indexed items", "ai-search items list"),
    op("Indexing jobs", "ai-search jobs list"),
    op("Namespaces", "ai-search namespace list"),
  ],
  RealtimeKit: [
    op("Application details", "realtime kit apps get"),
    op("Usage analytics", "realtime kit analytics usage get"),
    op("Meetings", "realtime kit meetings list"),
  ],
  "Serverless SFU": [
    op("Application details", "realtime sfu apps get"),
    op("Update application", "realtime sfu apps update"),
  ],
  "MoQ Relay": [
    op("Relay details", "realtime moq relays get"),
    op("Update relay", "realtime moq relays update"),
  ],
  "Security investigation": intelligence,
  "Threat intelligence": intelligence,
  Infrastructure: [
    op("Exposure findings", "intel attack-surface-report issues list"),
    op("Findings by severity", "intel attack-surface-report issues severity"),
    op("Issue types", "intel attack-surface-report issue-types get"),
  ],
  "Networking insights": [
    op("Monitoring configuration", "magic-network-monitoring configs full get"),
    op("Monitoring rules", "magic-network-monitoring rules list"),
  ],
  "Web tag management": [
    op("Configuration", "zaraz config get"),
    op("Configuration history", "zaraz history list"),
    op("Workflow", "zaraz workflow get"),
    op("Update configuration", "zaraz config update"),
  ],
  "Analytics Engine": [
    {
      label: "Query dataset",
      command: "analytics_engine sql query",
      sql: true,
    },
  ],
  Transformations: [
    op("Image variants", "images variants list"),
    op("Transformation flows", "images flows get"),
    op("Create variant", "images variants create"),
    op("Edit variant", "images variants edit"),
  ],
  "Media plans": [
    op("Image usage", "images stats"),
    op("Video storage usage", "stream storage-usage"),
    op("Subscriptions", "accounts subscriptions get"),
  ],
  "Hosted images": [
    op("Image details", "images get"),
    op("Image usage", "images stats"),
    op("Edit image", "images edit"),
  ],
  "Hosted videos": [
    op("Video details", "stream videos get"),
    op("Video captions", "stream videos captions list"),
    op("Edit video", "stream videos edit"),
  ],
  "Live inputs": [
    op("Input details", "stream live-inputs get"),
    op("Create live input", "stream live-inputs create"),
    op("Update live input", "stream live-inputs update"),
  ],
  Turnstile: [
    op("Widget details", "turnstile widgets get"),
    op("Create widget", "turnstile widgets create"),
    op("Update widget", "turnstile widgets update"),
  ],
  Hyperdrive: [
    op("Connection details", "hyperdrive get"),
    op("Restart connection", "hyperdrive restart"),
  ],
  Pipelines: [
    op("Pipeline details", "pipelines get"),
    op("Streams", "pipelines streams list"),
    op("Sinks", "pipelines sinks list"),
  ],
  "Secrets Store": [
    op("Store details", "secrets-store stores get"),
    op("Account quota", "secrets-store quota get"),
  ],
  WAF: [op("Ruleset details", "rulesets account-rulesets get")],
  Tunnels: [op("Tunnel details", "tunnels get")],
  "Bulk redirects": [op("List items", "rules lists items list")],
  Billing: [
    op("Billing history", "accounts billing history list"),
    op("Subscriptions", "accounts subscriptions get"),
    op("Usage", "billing usage get-v1"),
  ],
  "OAuth clients": [
    op("Clients", "oauth-clients list"),
    op("Client details", "oauth-clients get"),
  ],
  "Abuse reports": [
    op("Reports", "abuse-reports list"),
    op("Report details", "abuse-reports get"),
    op("Mitigations", "abuse-reports mitigations list"),
  ],
  Configurations: [
    op("Account details", "accounts get"),
    op("Update account", "accounts update"),
  ],
  "Tagged Resources": [
    op("Tag summary", "resource-tagging summary get"),
    op("Resources by tag", "tags resources list"),
    op("Account tags", "account-tags get"),
  ],
};
const contextFields = new Set([
  "account_id",
  "account.id",
  "account-id",
  "account_or_zone",
  "account_or_zone_id",
  "zone_id",
  "zone",
  "zone-id",
]);
export function operationParameters(schema: CommandSchema) {
  return [...schema.pathParams, ...schema.queryParams].filter(
    (p) => !contextFields.has(p.name),
  );
}
export function operationRequest(
  operation: PageOperation,
  schema: CommandSchema,
  context: Context,
  values: Record<string, string>,
  body: string,
): Request {
  if (!context.accountId) throw Error("Select an account.");
  if (schema.pathParams.some((p) => p.name === "zone_id") && !context.zoneId)
    throw Error("Select a zone.");
  const parameters: Record<string, unknown> = {};
  for (const p of operationParameters(schema)) {
    const raw = values[p.name]?.trim() ?? "";
    if (!raw) {
      if (p.required || operation.required?.includes(p.name))
        throw Error(`${p.name.replaceAll("_", " ")} is required.`);
      continue;
    }
    if (p.enum && !p.enum.includes(raw))
      throw Error(`Choose a valid ${p.name}.`);
    if (["number", "integer"].includes(p.type)) {
      const number = Number(raw);
      if (
        !Number.isFinite(number) ||
        (p.type === "integer" && !Number.isInteger(number))
      )
        throw Error(`${p.name} must be a valid ${p.type}.`);
      parameters[p.name] = number;
    } else if (p.type === "boolean") {
      if (!["true", "false"].includes(raw))
        throw Error(`${p.name} must be true or false.`);
      parameters[p.name] = raw === "true";
    } else
      parameters[p.name] = ["array", "object"].includes(p.type)
        ? JSON.parse(raw)
        : raw;
  }
  const request: Request = {
    path: operation.command.split(" "),
    context: {
      ...context,
      zoneId: schema.pathParams.some((p) => p.name === "zone_id")
        ? context.zoneId
        : undefined,
    },
    parameters,
  };
  if (operation.sql) {
    if (!/^\s*SELECT\s/i.test(body)) throw Error("Enter a SELECT query.");
    request.body = body;
  } else if (schema.hasRequestBody) request.body = JSON.parse(body);
  return request;
}

// Each binding is explicit: a resource identifier must never fill an unrelated field.
const resourceBindings: Record<string, string[]> = {
  BotBase: ["bot_slug"],
  "R2 Data Catalog": ["bucket_name"],
  Models: ["model"],
  "AI Gateway": ["id", "gateway_id"],
  "MCP Portals": ["id", "portal_id"],
  Vectorize: ["index_name"],
  "AI Search": ["id"],
  "Hosted images": ["image_id"],
  "Hosted videos": ["identifier"],
  "Live inputs": ["live_input_identifier"],
  Turnstile: ["sitekey"],
  Hyperdrive: ["hyperdrive_id"],
  Pipelines: ["pipeline_id"],
  "Secrets Store": ["store_id"],
  WAF: ["ruleset_id"],
  Tunnels: ["tunnel_id"],
  "Bulk redirects": ["list_id"],
  RealtimeKit: ["app_id"],
  "Serverless SFU": ["app_id"],
  "MoQ Relay": ["relay_id"],
};
export function resourceOperationValues(
  page: string,
  id: string,
  namespace = "default",
  name = id,
): Record<string, string> | undefined {
  const fields = resourceBindings[page];
  if (!fields) return undefined;
  return {
    ...Object.fromEntries(
      fields.map((field) => [field, page === "Models" ? name : id]),
    ),
    ...(page === "AI Search" ? { name: namespace } : {}),
  };
}
