import type { Page, Resource } from "./types";

export const resourceKinds: Resource["kind"][] = [
  "Workers",
  "Containers",
  "Durable Objects",
  "Queues",
  "Workflows",
  "Workers for Platforms",
  "Zones",
  "DNS",
  "D1",
  "R2",
  "KV",
];

export const resourceGroups: { label: string; kinds: Page[] }[] = [
  {
    label: "Compute",
    kinds: [
      "Workers",
      "Containers",
      "Durable Objects",
      "Workers for Platforms",
    ],
  },
  {
    label: "Storage & databases",
    kinds: [
      "R2",
      "R2 Data Catalog",
      "Hyperdrive",
      "KV",
      "D1",
      "Analytics Engine",
      "Pipelines",
      "K2 Streams",
      "Secrets Store",
    ],
  },
  {
    label: "Images & Stream",
    kinds: [
      "Transformations",
      "Hosted images",
      "Hosted videos",
      "Live inputs",
      "Stream analytics",
      "Media plans",
    ],
  },
  {
    label: "Realtime",
    kinds: ["RealtimeKit", "TURN Server", "Serverless SFU", "MoQ Relay"],
  },
  { label: "Messaging & workflows", kinds: ["Queues", "Workflows"] },
  {
    label: "Application security",
    kinds: [
      "Security insights",
      "WAF",
      "BotBase",
      "Security investigation",
      "Infrastructure",
      "Threat intelligence",
      "Turnstile",
    ],
  },
  {
    label: "Networking",
    kinds: [
      "Networking overview",
      "Networking insights",
      "Tunnels",
      "Mesh",
      "Routes",
      "IP addresses",
      "Zones",
      "DNS",
    ],
  },
  {
    label: "Delivery & performance",
    kinds: ["Bulk redirects", "Load Balancing", "Web tag management"],
  },
];

export const resourceNames: Record<Resource["kind"], string> &
  Partial<Record<Page, string>> = {
  "Security investigation": "Investigate",
  "Networking overview": "Overview",
  "Networking insights": "Insights",
  Workers: "Workers & Pages",
  Containers: "Containers",
  "Durable Objects": "Durable Objects",
  Queues: "Queues",
  Workflows: "Workflows",
  "Workers for Platforms": "Workers for Platforms",
  Zones: "Zones",
  DNS: "DNS records",
  D1: "D1 SQLite Database",
  R2: "R2 Object Storage",
  KV: "Workers KV",
  Hyperdrive: "Postgres & MySQL (Hyperdrive)",
  "Media plans": "Plans",
};

export const resourceCommands: Partial<
  Record<Resource["kind"], { label: string; query: string }>
> = {
  Containers: { label: "Manage containers", query: "containers applications" },
  "Durable Objects": {
    label: "Explore namespaces",
    query: "durable-objects namespaces",
  },
  Workflows: { label: "Manage workflows", query: "workflows" },
  "Workers for Platforms": {
    label: "Manage namespaces",
    query: "workers-for-platforms dispatch-namespaces",
  },
};
