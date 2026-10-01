import { prepare, runPlan, unwrap } from "./cf";
import type { Context, Discovery } from "./types";

export const productPages = [
  "Security insights",
  "WAF",
  "BotBase",
  "Security investigation",
  "Infrastructure",
  "Threat intelligence",
  "Turnstile",
  "Networking overview",
  "Networking insights",
  "Tunnels",
  "Mesh",
  "Routes",
  "IP addresses",
  "Bulk redirects",
  "Load Balancing",
  "Web tag management",

  "R2 Data Catalog",
  "Hyperdrive",
  "Analytics Engine",
  "Pipelines",
  "K2 Streams",
  "Secrets Store",
  "Transformations",
  "Hosted images",
  "Hosted videos",
  "Live inputs",
  "Stream analytics",
  "Media plans",
  "RealtimeKit",
  "TURN Server",
  "Serverless SFU",
  "MoQ Relay",
] as const;
export type ProductPage = (typeof productPages)[number];
type ProductConfig = {
  title?: string;
  children?: ProductPage[];
  parameters?: Record<string, string | number | boolean>;
  description: string;
  command?: string;
  list?: string;
  pagination?:
    | "offset"
    | "page"
    | "page_no"
    | "continuation_token"
    | "before"
    | "created_before";
  docs: string;
  note?: string;
};
export const products: Record<ProductPage, ProductConfig> = {
  "Security insights": {
    description: "Review security findings across this account.",
    command: "security-insights",
    list: "security-insights list",
    pagination: "page",
    docs: "security/security-insights",
  },
  WAF: {
    description:
      "View account-level WAF rulesets. Explore commands for zone-level rules.",
    command: "rulesets",
    list: "rulesets account-rulesets list",
    docs: "waf",
  },
  BotBase: {
    description: "Explore Cloudflare’s directory of known bots and agents.",
    docs: "bots",
    command: "radar bots",
    list: "radar bots list",
    pagination: "offset",
  },
  "Security investigation": {
    title: "Investigate",
    description:
      "Investigate IP addresses, domains, URLs, and security signals.",
    command: "intel",
    docs: "security-center",
    note: "Choose a threat intelligence lookup and enter the IP address, domain, or URL you want to investigate.",
  },
  Infrastructure: {
    description: "Review infrastructure exposure and attack surface findings.",
    command: "intel attack-surface-report",
    docs: "security-center",
    note: "Explore attack surface reports, or open Application security → Infrastructure in Cloudflare for the infrastructure overview.",
  },
  "Threat intelligence": {
    description:
      "Look up threat intelligence for domains, IP addresses, and URLs.",
    command: "intel",
    docs: "security-center",
  },
  Turnstile: {
    description: "Manage Turnstile widgets for your websites and applications.",
    command: "turnstile widgets",
    list: "turnstile widgets list",
    pagination: "page",
    docs: "turnstile",
  },
  "Networking overview": {
    title: "Networking overview",
    description:
      "Explore your network connectivity, routing, and address space.",
    children: [
      "Networking insights",
      "Tunnels",
      "Mesh",
      "Routes",
      "IP addresses",
    ],
    docs: "cloudflare-one/networks",
  },
  "Networking insights": {
    title: "Networking insights",
    description: "Explore network traffic and monitoring.",
    command: "magic-network-monitoring",
    docs: "network-flow",
  },
  Tunnels: {
    description:
      "View Cloudflare Tunnels connecting your services to Cloudflare.",
    command: "tunnels",
    list: "tunnels list",
    pagination: "page",
    parameters: { is_deleted: false },
    docs: "cloudflare-one/networks/connectors/cloudflare-tunnel",
  },
  Mesh: {
    description: "View Mesh nodes connecting your private networks.",
    command: "mesh nodes",
    list: "mesh nodes list",
    pagination: "page",
    parameters: { is_deleted: false },
    docs: "cloudflare-one/networks/connectors/cloudflare-mesh",
  },
  Routes: {
    description:
      "View private network CIDR routes. Explore commands to manage hostname routes too.",
    command: "network routes",
    list: "network routes cidr list",
    pagination: "page",
    parameters: { is_deleted: false },
    docs: "cloudflare-one/networks/routes",
  },
  "IP addresses": {
    description: "View IP prefixes allocated to your account.",
    command: "addressing",
    list: "addressing prefixes list",
    docs: "byoip",
  },
  "Bulk redirects": {
    description: "Manage redirect lists and account redirect rules.",
    command: "rules lists",
    list: "rules lists list",
    docs: "rules/url-forwarding/bulk-redirects",
  },
  "Load Balancing": {
    description: "View load balancers across your account.",
    command: "load-balancers",
    list: "load-balancers account list",
    docs: "load-balancing",
  },
  "Web tag management": {
    description: "Manage third-party tags with Cloudflare Zaraz.",
    command: "zaraz",
    docs: "zaraz",
    note: "Zaraz configuration is specific to a zone. Choose a zone in the command explorer to view or update its configuration.",
  },

  "R2 Data Catalog": {
    command: "basin-catalog",
    list: "basin-catalog list",
    description:
      "Manage Iceberg catalogs for your R2 buckets. Now called Basin Catalog.",
    docs: "basin-catalog",
  },
  Hyperdrive: {
    description:
      "Connect Workers to Postgres and MySQL with connection pooling.",
    command: "hyperdrive",
    list: "hyperdrive list",
    pagination: "page",
    docs: "hyperdrive",
  },
  "Analytics Engine": {
    description: "Query custom analytics datasets with SQL.",
    command: "analytics_engine sql",
    docs: "analytics/analytics-engine",
    note: "Open a SQL query to read your Analytics Engine datasets.",
  },
  Pipelines: {
    description: "Manage data pipelines, streams, and sinks.",
    command: "pipelines",
    list: "pipelines list",
    pagination: "page",
    docs: "pipelines",
  },
  "K2 Streams": {
    description: "Manage your K2 streaming data in Cloudflare.",
    docs: "",
  },
  "Secrets Store": {
    description: "Manage stores for shared application secrets.",
    command: "secrets-store",
    list: "secrets-store stores list",
    pagination: "page",
    docs: "secrets-store",
  },
  Transformations: {
    description: "Configure image transformations and delivery.",
    command: "images",
    docs: "images/transform-images",
  },
  "Hosted images": {
    description: "Browse images stored on Cloudflare Images.",
    command: "images",
    list: "images list",
    pagination: "continuation_token",
    docs: "images",
  },
  "Hosted videos": {
    description: "Browse on-demand and recorded videos in Cloudflare Stream.",
    command: "stream videos",
    list: "stream videos list",
    pagination: "before",
    docs: "stream",
  },
  "Live inputs": {
    description: "Manage live video inputs for Cloudflare Stream.",
    command: "stream live-inputs",
    list: "stream live-inputs list",
    docs: "stream/stream-live",
  },
  "Stream analytics": {
    description: "Review video playback, delivery, and audience metrics.",
    docs: "stream/getting-analytics",
  },
  "Media plans": {
    description: "Review Cloudflare Images and Stream subscriptions and usage.",
    docs: "stream/pricing",
  },
  RealtimeKit: {
    description:
      "Manage applications for real-time audio and video experiences.",
    command: "realtime kit",
    list: "realtime kit apps list",
    pagination: "page_no",
    docs: "realtime/realtimekit",
  },
  "TURN Server": {
    description: "Manage TURN keys for reliable WebRTC connectivity.",
    command: "realtime turn",
    list: "realtime turn keys list",
    docs: "realtime/turn",
  },
  "Serverless SFU": {
    description: "Manage applications for routing real-time audio and video.",
    command: "realtime sfu",
    list: "realtime sfu apps list",
    docs: "realtime/sfu",
  },
  "MoQ Relay": {
    description: "Manage relays for live media delivered over QUIC.",
    command: "realtime moq relays",
    list: "realtime moq relays list",
    pagination: "created_before",
    docs: "moq",
  },
};
export function productDiscovery(page: ProductPage): Discovery {
  return {
    command: "",
    fullPath: [],
    description: products[page].command ?? page,
  };
}
export type ProductItem = { id: string; name: string; detail: string };
function productRows(data: unknown): unknown[] {
  let raw = unwrap(data);
  // Product APIs use different envelopes; never treat an unknown shape as empty.
  for (
    let depth = 0;
    depth < 3 && raw && typeof raw === "object" && !Array.isArray(raw);
    depth++
  ) {
    const object = raw as Record<string, unknown>;
    raw =
      object.bots ??
      object.catalogs ??
      object.warehouses ??
      object.issues ??
      object.insights ??
      object.widgets ??
      object.items ??
      object.images ??
      object.videos ??
      object.liveInputs ??
      object.apps ??
      object.keys ??
      object.relays ??
      object.stores ??
      object.pipelines ??
      object.data;
  }
  if (!Array.isArray(raw))
    throw Error(
      "Cloudflare returned an unsupported resource list. Use Explore commands to inspect this product.",
    );
  return raw;
}
export function normalizeProductItems(data: unknown): ProductItem[] {
  return productRows(data).map((item) => {
    if (!item || typeof item !== "object")
      throw Error("Cloudflare returned an invalid resource.");
    const r = item as Record<string, unknown>;
    const id =
      r.bucket ??
      r.slug ??
      r.bucket_name ??
      r.id ??
      r.uid ??
      r.sitekey ??
      r.key_id ??
      r.name;
    if (typeof id !== "string")
      throw Error("Cloudflare returned a resource without an identifier.");
    const meta =
      r.meta && typeof r.meta === "object"
        ? (r.meta as Record<string, unknown>)
        : {};
    const name =
      r.name ??
      r.filename ??
      meta.name ??
      r.network ??
      r.cidr ??
      r.subject ??
      id;
    return {
      id,
      name: typeof name === "string" ? name : id,
      detail:
        typeof r.status === "string"
          ? r.status
          : typeof r.severity === "string"
            ? r.severity
            : "",
    };
  });
}
export async function loadProductItems(
  page: ProductPage,
  context: Context,
  number: number,
  cursor?: string,
) {
  const config = products[page];
  if (!config.list)
    throw Error("This product does not expose a resource list.");
  const plan = await prepare({
    context,
    path: config.list.split(" "),
    parameters: productListParameters(page, number, cursor),
  });
  if (plan.classification !== "Read")
    throw Error("Resource lists only run read operations.");
  const result = await runPlan(plan, false, false);
  if (!result.success)
    throw Error(
      result.error ||
        "Could not load resources. Check account access and retry.",
    );
  return productListResult(page, result.data);
}
export function productListParameters(
  page: ProductPage,
  number: number,
  cursor?: string,
) {
  const pagination = products[page].pagination;
  const defaults = products[page].parameters ?? {};
  if (!pagination) return defaults;
  if (pagination === "offset")
    return { ...defaults, limit: 20, offset: (number - 1) * 20 };
  if (pagination === "page" || pagination === "page_no")
    return { ...defaults, [pagination]: number, per_page: 20 };
  return {
    [pagination === "before" ? "limit" : "per_page"]: 20,
    ...(cursor ? { [pagination]: cursor } : {}),
  };
}
export function productListResult(page: ProductPage, data: unknown) {
  const rows = productRows(data);
  const visibleRows =
    page === "Bulk redirects"
      ? rows.filter(
          (row) => (row as Record<string, unknown>)?.kind === "redirect",
        )
      : page === "WAF"
        ? rows.filter((row) =>
            [
              "http_request_firewall_custom",
              "http_request_firewall_managed",
              "http_ratelimit",
            ].includes(String((row as Record<string, unknown>)?.phase)),
          )
        : rows;
  const items = normalizeProductItems(visibleRows);
  const pagination = products[page].pagination;
  const raw = unwrap(data) as Record<string, unknown>;
  const last = rows.at(-1) as Record<string, unknown> | undefined;
  const cursor =
    pagination === "continuation_token"
      ? raw?.continuation_token
      : last?.created;
  const hasNext =
    pagination === "continuation_token"
      ? typeof cursor === "string" && cursor.length > 0
      : !!pagination && rows.length >= 20;
  return {
    items,
    hasNext,
    nextCursor: typeof cursor === "string" ? cursor : undefined,
  };
}
