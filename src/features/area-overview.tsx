import { PagePin } from "./home";
import { DashboardCaret } from "../components/cloudflare-icons";
import { groupsForArea, type ProductArea } from "../lib/navigation";
import { resourceNames } from "../lib/resource-catalog";
import { useUI } from "../lib/store";

export function AreaOverview({ area }: { area: ProductArea }) {
  const { account, navigate } = useUI();
  return (
    <div className="page-content account-overview">
      <div className="page-heading">
        <div>
          <h1>{area}</h1>
          <p>{account.name}</p>
        </div>
      </div>
      {groupsForArea(area).map((group) => (
        <section className="overview-section" key={group.label}>
          <div className="overview-section-heading">
            <h2>{group.label}</h2>
          </div>
          <div className="overview-resource-list">
            {group.kinds.map((page) => {
              return (
                <div className="pinned-page-row" key={page}>
                  <button
                    className="overview-resource-row"
                    onClick={() => navigate(page)}
                  >
                    <span className="overview-resource-name">
                      {resourceNames[page] ?? page}
                    </span>
                    <DashboardCaret size={12} />
                  </button>
                  <PagePin page={page} />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
