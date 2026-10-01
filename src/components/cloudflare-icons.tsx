import {
  forwardRef,
  type SVGProps,
  type ForwardRefExoticComponent,
  type RefAttributes,
} from "react";

export type DashboardIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  absoluteStrokeWidth?: boolean;
};
export type DashboardIcon = ForwardRefExoticComponent<
  DashboardIconProps & RefAttributes<SVGSVGElement>
>;
import type { Page } from "../lib/types";
import viewBoxes from "../lib/cloudflare-icon-viewboxes.json";

export type CloudflareIconName = keyof typeof viewBoxes;
const sprite = "/icons/cloudflare/dashboard.svg";
export function cloudflareIcon(name: CloudflareIconName): DashboardIcon {
  const Icon = forwardRef<SVGSVGElement, DashboardIconProps>(
    function CloudflareIcon(
      {
        size = 24,
        color = "currentColor",
        strokeWidth: _strokeWidth,
        absoluteStrokeWidth: _absoluteStrokeWidth,
        children,
        ...props
      },
      ref,
    ) {
      return (
        <svg
          ref={ref}
          width={size}
          height={size}
          viewBox={viewBoxes[name]}
          fill={color}
          aria-hidden="true"
          focusable="false"
          {...props}
        >
          <use href={`${sprite}#icon-${name}`} />
          {children}
        </svg>
      );
    },
  );
  Icon.displayName = `CloudflareIcon(${name})`;
  return Icon;
}

// Filled caret observed in Cloudflare's dashboard navigation.
export const DashboardCaret = forwardRef<SVGSVGElement, DashboardIconProps>(
  function DashboardCaret({ size = 12, ...props }, ref) {
    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 256 256"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        <path d="M184.49,136.49l-80,80a12,12,0,0,1-17-17L159,128,87.51,56.49a12,12,0,1,1,17-17l80,80A12,12,0,0,1,184.49,136.49Z" />
      </svg>
    );
  },
);
export const DashboardRealtime = forwardRef<SVGSVGElement, DashboardIconProps>(
  function DashboardRealtime({ size = 16, ...props }, ref) {
    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 256 256"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        <path d="M128,88a40,40,0,1,0,40,40A40,40,0,0,0,128,88Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,128,152Zm73.71,7.14a80,80,0,0,1-14.08,22.2,8,8,0,0,1-11.92-10.67,63.95,63.95,0,0,0,0-85.33,8,8,0,1,1,11.92-10.67,80.08,80.08,0,0,1,14.08,84.47ZM69,103.09a64,64,0,0,0,11.26,67.58,8,8,0,0,1-11.92,10.67,79.93,79.93,0,0,1,0-106.67A8,8,0,1,1,80.29,85.34,63.77,63.77,0,0,0,69,103.09ZM248,128a119.58,119.58,0,0,1-34.29,84,8,8,0,1,1-11.42-11.2,103.9,103.9,0,0,0,0-145.56A8,8,0,1,1,213.71,44,119.58,119.58,0,0,1,248,128ZM53.71,200.78A8,8,0,1,1,42.29,212a119.87,119.87,0,0,1,0-168,8,8,0,1,1,11.42,11.2,103.9,103.9,0,0,0,0,145.56Z" />
      </svg>
    );
  },
);
export const cloudflareAreaIcons = {
  Home: cloudflareIcon("home"),
  Build: cloudflareIcon("edgeworker"),
  Media: cloudflareIcon("media-play"),
  Network: cloudflareIcon("zerotrust-networks-logo"),
  Security: cloudflareIcon("api-security"),
  Workspace: cloudflareIcon("logs"),
  AI: cloudflareIcon("workers-constellation"),
  Settings: cloudflareIcon("gear"),
};

export const cloudflarePageIcons: Partial<Record<Page, DashboardIcon>> = {
  ...cloudflareAreaIcons,
  Settings: cloudflareIcon("gear"),
  Workers: cloudflareIcon("workers-pages"),
  "Durable Objects": cloudflareIcon("workers-durable-objects"),
  "Workers for Platforms": cloudflareIcon("workers-for-platforms"),
  Workflows: cloudflareIcon("flowchart"),
  Queues: cloudflareIcon("queues"),
  Zones: cloudflareIcon("globe"),
  DNS: cloudflareIcon("reliability-dns"),
  D1: cloudflareIcon("d1"),
  R2: cloudflareIcon("r2outline"),
  KV: cloudflareIcon("workers-kv"),
  Hyperdrive: cloudflareIcon("hyperdrive"),
  Pipelines: cloudflareIcon("cloudflare-pipelines"),
  "Secrets Store": cloudflareIcon("key"),
  "Analytics Engine": cloudflareIcon("chart"),
  AI: cloudflareIcon("workers-constellation"),
  "Workers AI": cloudflareIcon("workers-constellation"),
  "AI Search": cloudflareIcon("auto-rag-outline"),
  Vectorize: cloudflareIcon("vectorize"),
  "AI Gateway": cloudflareIcon("gateway"),
  "Agent tracing": cloudflareIcon("trace"),
  "Hosted images": cloudflareIcon("image"),
  Transformations: cloudflareIcon("image"),
  "Hosted videos": cloudflareIcon("stream"),
  "Live inputs": cloudflareIcon("media-play"),
  "Stream analytics": cloudflareIcon("chart"),
  RealtimeKit: cloudflareIcon("calls"),
  WAF: cloudflareIcon("security-waf"),
  Turnstile: cloudflareIcon("turnstile"),
  "Security insights": cloudflareIcon("product-security-center"),
  "Security investigation": cloudflareIcon("logs"),
  "Threat intelligence": cloudflareIcon("shield"),
  "Networking overview": cloudflareIcon("zerotrust-networks-logo"),
  "Networking insights": cloudflareIcon("network-analytics-logo"),
  "IP addresses": cloudflareIcon("byoip"),
  "Load Balancing": cloudflareIcon("reliability-load-balancer"),
  "Web tag management": cloudflareIcon("zaraz"),
  "Account analytics": cloudflareIcon("chart"),
  "Web analytics": cloudflareIcon("web-analytics-logo"),
  "Worker traffic": cloudflareIcon("chart"),
  "Log Explorer": cloudflareIcon("logs"),
  Logpush: cloudflareIcon("edge-log-delivery"),
  "Cron triggers": cloudflareIcon("time"),
};

export const cloudflareGroupIcons: Record<string, DashboardIcon> = {
  Workspace: cloudflareIcon("logs"),
  "Analytics & logs": cloudflareIcon("chart"),
  Investigate: cloudflareIcon("logs"),
  "Recent analytics": cloudflareIcon("preemptive-outline"),
  "Messaging & workflows": cloudflareIcon("flowchart"),
  Compute: cloudflareIcon("edgeworker"),
  AI: cloudflareIcon("workers-constellation"),
  "Storage & databases": cloudflareIcon("workers-kv"),
  "Images & Stream": cloudflareIcon("media-play"),
  Realtime: DashboardRealtime,
  "Application security": cloudflareIcon("api-security"),
  Networking: cloudflareIcon("zerotrust-networks-logo"),
  "Delivery & performance": cloudflareIcon("bolt"),
  "Manage account": cloudflareIcon("gear"),
};
export const cloudflareAccountIcons: Record<string, DashboardIcon> = {
  Members: cloudflareIcon("user-multi"),
  Billing: cloudflareIcon("organization-outline"),
  "Account API tokens": cloudflareIcon("key"),
  "OAuth clients": cloudflareIcon("platform-apps"),
  "Audit logs": cloudflareIcon("clipboard"),
  Alerts: cloudflareIcon("notifications"),
  "Blocked content": cloudflareIcon("shield"),
  "Abuse reports": cloudflareIcon("file"),
  "Carbon Impact Report": cloudflareIcon("carbon"),
  Configurations: cloudflareIcon("gear"),
  "Tagged Resources": cloudflareIcon("list"),
};
