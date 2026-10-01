import { z } from "zod";
import { prepare, runPlan, unwrap } from "./cf";
import type { Context } from "./types";

export const accountSettings = [
  {
    label: "Members",
    description: "View account members and their roles.",
    route: "members",
    path: ["accounts", "members", "list"],
    paginated: true,
  },
  {
    label: "Billing",
    description: "Manage invoices, payment details, and subscriptions.",
    route: "billing",
  },
  {
    label: "Account API tokens",
    description: "Manage tokens owned by this Cloudflare account.",
  },
  {
    label: "OAuth clients",
    description: "Manage applications that use Cloudflare OAuth.",
    route: "oauth-clients",
  },
  {
    label: "Audit logs",
    description: "Review who changed your account and when.",
    path: ["audit-logs", "list"],
    paginated: true,
  },
  {
    label: "Alerts",
    description: "View notification policies for your account.",
    path: ["alerting", "policies", "list"],
  },
  {
    label: "Blocked content",
    description:
      "Inspect abuse reports and their content mitigations. Use the dashboard for pending blocks and review requests.",
    route: "blocked-content",
  },
  {
    label: "Abuse reports",
    description: "Review and respond to abuse reports for your account.",
  },
  {
    label: "Carbon Impact Report",
    description:
      "View the estimated carbon savings from your Cloudflare usage.",
  },
  {
    label: "Configurations",
    description: "Manage your account name and default settings.",
  },
  {
    label: "Tagged Resources",
    description: "Browse resources by tag and manage their tags.",
    beta: true,
  },
] satisfies AccountSetting[];
export type AccountSetting = {
  label: string;
  description: string;
  route?: string;
  path?: string[];
  paginated?: boolean;
  beta?: boolean;
};
export type AccountRow = {
  id: string;
  name: string;
  detail: string;
  status: string;
};
const text = (value: unknown) => (typeof value === "string" ? value : "");
export function normalizeAccountRows(
  data: unknown,
  label: string,
): AccountRow[] {
  return z
    .array(z.record(z.unknown()))
    .parse(unwrap(data))
    .map((row) => {
      const user = z.record(z.unknown()).safeParse(row.user).data ?? {};
      const actor = z.record(z.unknown()).safeParse(row.actor).data ?? {};
      const action = z.record(z.unknown()).safeParse(row.action).data ?? {};
      const roles = Array.isArray(row.roles)
        ? row.roles
            .map((role) =>
              typeof role === "object" && role
                ? text((role as Record<string, unknown>).name)
                : "",
            )
            .filter(Boolean)
            .join(", ")
        : "";
      return {
        id: z.string().parse(row.id),
        name:
          label === "Members"
            ? text(user.email) || text(row.id)
            : label === "Audit logs"
              ? text(action.type) || "Account activity"
              : text(row.name) || text(row.id),
        detail:
          label === "Members"
            ? roles
            : label === "Audit logs"
              ? [text(actor.email), text(row.when)].filter(Boolean).join(" · ")
              : text(row.description),
        status:
          label === "Alerts"
            ? row.enabled === true
              ? "Enabled"
              : row.enabled === false
                ? "Disabled"
                : "Unknown"
            : text(row.status),
      };
    });
}
export async function loadAccountRows(
  setting: AccountSetting,
  context: Context,
  page: number,
) {
  if (!setting.path) throw Error("Open this page in Cloudflare.");
  const plan = await prepare({
    path: setting.path,
    context,
    parameters: setting.paginated ? { page, per_page: 20 } : {},
  });
  if (plan.classification !== "Read")
    throw Error("Account lists require a read command.");
  const result = await runPlan(plan, false, false);
  if (!result.success)
    throw Error(result.error || "Could not load account information.");
  return normalizeAccountRows(result.data, setting.label);
}
