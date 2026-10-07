import { LayoutDashboard } from "lucide-react";
import { useUI } from "../lib/store";
import { cloudflareIcon } from "./cloudflare-icons";
const Info = cloudflareIcon("info-sign");
export function UnsupportedFeature({
  feature,
  appLimitation = false,
  dashboardLink = false,
}: {
  feature: string;
  appLimitation?: boolean;
  dashboardLink?: boolean;
}) {
  return (
    <section
      className="unsupported-feature"
      aria-label={`${feature} availability`}
    >
      <Info size={22} />
      <div>
        <h2>
          {appLimitation
            ? "Boxflare doesn’t support this yet"
            : "The cf library doesn’t support this yet"}
        </h2>
        <p>
          {appLimitation
            ? "The cf library includes account token commands, but token management is not integrated into Boxflare yet."
            : `${feature} isn’t available through the bundled cf library yet. We haven’t found a documented public API for this page.`}
        </p>
        {dashboardLink && <DashboardLink />}
      </div>
    </section>
  );
}

export function DashboardLink({ iconOnly = false }: { iconOnly?: boolean }) {
  const { account } = useUI();
  return (
    <a
      title="Open Cloudflare dashboard"
      aria-label="Open Cloudflare dashboard"
      href={`https://dash.cloudflare.com/${encodeURIComponent(account.id)}`}
      target="_blank"
      rel="noreferrer"
    >
      {iconOnly ? <LayoutDashboard size={18} aria-hidden="true" /> : "Open Cloudflare dashboard ↗"}
    </a>
  );
}
