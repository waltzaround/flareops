import {
  cloudflarePageIcons,
  cloudflareGroupIcons,
  cloudflareIcon,
  type DashboardIcon,
} from "./cloudflare-icons";
import { resourceGroups } from "../lib/resource-catalog";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Cloud,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import type { Page, Resource } from "../lib/types";
import { Button } from "./ui/button";
// Products without a dedicated dashboard glyph inherit their Cloudflare section icon.
export const icons: Partial<Record<Page, DashboardIcon>> = {
  ...Object.fromEntries(
    resourceGroups.flatMap((group) =>
      group.kinds.map((page) => [page, cloudflareGroupIcons[group.label]]),
    ),
  ),
  Models: cloudflareIcon("workers-constellation"),
  "MCP Portals": cloudflareIcon("workers-constellation"),
  Explorer: cloudflareIcon("wrangler"),
  Activity: cloudflareIcon("logs"),
  "Command analytics": cloudflareIcon("chart"),
  "Rule simulator": cloudflareIcon("cloudflare-ruleset-engine"),
  ...cloudflarePageIcons,
};
const ResourceFallback = cloudflareIcon("cloud-internet");
export function ResourceIcon({
  kind,
  small = false,
}: {
  kind: Resource["kind"];
  small?: boolean;
}) {
  const Icon = icons[kind] ?? ResourceFallback;
  return (
    <span
      className={`resource-icon ${kind.toLowerCase()} ${small ? "small" : ""}`}
    >
      <Icon size={small ? 16 : 19} strokeWidth={1.65} />
    </span>
  );
}
export function Status({ label = "Active" }: { label?: string }) {
  return (
    <span className="status">
      <span />
      {label}
    </span>
  );
}
export function Empty({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <Cloud size={30} strokeWidth={1.25} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <Button onClick={onAction}>
          {action}
          <ArrowUpRight size={14} />
        </Button>
      )}
    </div>
  );
}
export function ErrorBox({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="error-box">
      <TriangleAlert size={17} />
      <div>
        <strong>Something needs your attention</strong>
        <p>{String(error instanceof Error ? error.message : error)}</p>
        {retry && (
          <Button size="sm" onClick={retry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <Loader2 className="spin" size={18} /> Asking Cloudflare…
    </div>
  );
}
export function CheckRow({
  children,
  done = true,
}: {
  children: React.ReactNode;
  done?: boolean;
}) {
  return (
    <div className="check-row">
      {done ? (
        <CheckCircle2 size={15} />
      ) : (
        <Loader2 className="spin" size={15} />
      )}{" "}
      {children}
    </div>
  );
}
export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd>{children}</kbd>;
}
