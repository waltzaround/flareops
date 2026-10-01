import { AccountTokens } from "./account-reads";
import { PageHeaderActions } from "../components/page-header-actions";
import {
  UnsupportedFeature,
  DashboardLink,
} from "../components/unsupported-feature";
import { PageOperations } from "./page-operations";
import { pageOperations } from "../lib/page-operations";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useUI } from "../lib/store";
import { loadAccountRows, type AccountSetting } from "../lib/account-settings";
import { Button } from "../components/ui/button";
import { Empty, ErrorBox, Loading } from "../components/shared";

export function AccountSettings({ setting }: { setting: AccountSetting }) {
  const { account, mode, setSettingsTab } = useUI();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: [
      "account-settings",
      mode,
      account.profile,
      account.id,
      setting.label,
      page,
    ],
    queryFn: () =>
      loadAccountRows(
        setting,
        { accountId: account.id, profile: account.profile },
        page,
      ),
    enabled: mode === "live" && !!account.id && !!setting.path,
    retry: false,
  });
  if (setting.label === "Account API tokens")
    return <AccountTokens key={`${mode}-${account.profile}-${account.id}`} />;
  if (!setting.path && !pageOperations[setting.label])
    return (
      <UnsupportedFeature
        dashboardLink
        feature={setting.label}
        appLimitation={setting.label === "Account API tokens"}
      />
    );
  if (!account.id || mode === "demo")
    return (
      <Empty
        title="Connect a Cloudflare account"
        description="Choose a live account to manage its settings."
        action="Manage accounts"
        onAction={() => setSettingsTab("Accounts")}
      />
    );
  const rows = (query.data ?? []).filter((row) =>
    `${row.name} ${row.detail} ${row.status}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <section className="account-management">
      <PageHeaderActions>
        <DashboardLink />
      </PageHeaderActions>
      <p>{setting.description}</p>
      <div className="account-management-context">
        <strong>{account.name}</strong>
        <span>{account.profile}</span>
      </div>
      <div className="account-management-actions">
        {setting.path && (
          <Button
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={14} /> Refresh
          </Button>
        )}
      </div>
      {pageOperations[setting.label] && (
        <PageOperations
          key={setting.label}
          operations={pageOperations[setting.label]}
        />
      )}
      {setting.path && (
        <>
          <label className="field">
            Filter this page
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${setting.label.toLowerCase()}…`}
            />
          </label>
          {query.isPending ? (
            <Loading />
          ) : query.error ? (
            <ErrorBox error={query.error} retry={() => void query.refetch()} />
          ) : rows.length ? (
            <div className="account-management-list">
              {rows.map((row) => (
                <article key={row.id}>
                  <div>
                    <strong>{row.name}</strong>
                    {row.detail && <p>{row.detail}</p>}
                  </div>
                  <span>{row.status}</span>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title={search ? "No matching results" : "No results on this page"}
              description={
                search
                  ? "Try another filter."
                  : "No entries were returned for this account and page."
              }
            />
          )}
          {setting.paginated && (
            <div className="deployment-pagination">
              <Button
                disabled={page === 1 || query.isFetching}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                disabled={
                  query.isFetching ||
                  !query.data ||
                  query.isError ||
                  query.data.length < 20
                }
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
