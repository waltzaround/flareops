import { productAreas } from "../lib/navigation";
import { productPages } from "../lib/products";
import { aiPages } from "../lib/ai";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Search,
  Terminal,
  CornerDownLeft,
  Compass,
} from "lucide-react";
import { Dialog } from "../components/ui/dialog";
import { Kbd, ResourceIcon, ErrorBox } from "../components/shared";
import { useUI } from "../lib/store";
import { cachedResources } from "../lib/query";
import { discover, resourcesForAccount } from "../lib/cf";
import type { Discovery, Page, Resource } from "../lib/types";
import { resourceKinds } from "../lib/resource-catalog";
export const pages: Page[] = [
  "Home",
  ...productAreas,
  ...aiPages,
  ...resourceKinds,
  ...productPages,
  "Workspace",
  "Account analytics",
  "Web analytics",
  "Worker traffic",
  "Command analytics",
  "Log Explorer",
  "Rule simulator",
  "Logpush",
  "Explorer",
  "Activity",
  "Settings",
];
export function Palette({
  onResource,
  onCommand,
}: {
  onResource: (r: Resource) => void;
  onCommand: (d: Discovery) => void;
}) {
  const { palette, setPalette, navigate, account, mode } = useUI();
  const [term, setTerm] = useState(""),
    [selected, setSelected] = useState(0),
    [found, setFound] = useState<Discovery[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  useEffect(() => {
    if (palette) {
      setTerm("");
      setSelected(0);
      setFound([]);
      setError(undefined);
    }
  }, [palette]);
  const needle = term.replace(/^>\s*/, "").toLowerCase();
  const nav = pages.filter((p) =>
    `${p} ${p === "Activity" ? "Command logs" : ""}`
      .toLowerCase()
      .includes(needle),
  );
  const cached =
    mode === "demo"
      ? resourcesForAccount(account.id)
      : cachedResources(mode, account.profile, account.id);
  const resources =
    needle && !term.startsWith(">")
      ? cached.filter((r) => r.name.toLowerCase().includes(needle)).slice(0, 6)
      : [];
  const rows = [
    ...nav.map((p) => ({
      key: p,
      label: `Open ${p === "Activity" ? "Command logs" : p}`,
      sub: "Navigation",
      icon: <Compass size={17} />,
      run: () => navigate(p),
    })),
    ...resources.map((r) => ({
      key: r.id,
      label: r.name,
      sub: r.kind,
      icon: <ResourceIcon kind={r.kind} small />,
      run: () => onResource(r),
    })),
    ...found.map((d) => ({
      key: d.command,
      label: d.command,
      sub: d.description,
      icon: <Terminal size={17} />,
      run: () => onCommand(d),
    })),
  ];
  async function search() {
    if (!term.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      setFound(await discover(term));
      setSelected(0);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  function choose(i: number) {
    rows[i]?.run();
    setPalette(false);
  }
  return (
    <Dialog
      open={palette}
      onOpenChange={setPalette}
      title="Go anywhere. Do anything."
      description="Find resources, navigate your workspace, or discover a cf command."
      className="palette"
    >
      <div className="palette-input">
        <Search size={20} />
        <input
          autoFocus
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setSelected(0);
            setFound([]);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((i) =>
                Math.min(i + 1, Math.min(rows.length, 12) - 1),
              );
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((i) => Math.max(i - 1, 0));
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (rows.length) choose(selected);
              else void search();
            }
          }}
          placeholder="Search resources or describe a task…"
          aria-label="Command search"
        />
        <Kbd>esc</Kbd>
      </div>
      <div className="palette-results">
        {!!error && <ErrorBox error={error} />}
        <div className="section-label">{term ? "RESULTS" : "JUMP TO"}</div>
        {rows.slice(0, 12).map((r, i) => (
          <button
            key={r.key}
            className={`palette-result ${selected === i ? "selected" : ""}`}
            onMouseEnter={() => setSelected(i)}
            onClick={() => choose(i)}
          >
            {r.icon}
            <span>
              <strong>{r.label}</strong>
              <small>{r.sub}</small>
            </span>
            {selected === i && <CornerDownLeft size={14} />}
          </button>
        ))}
        {term && (
          <button className="discover-row" onClick={search} disabled={busy}>
            <Terminal size={17} />
            <span>
              {busy ? "Searching cf commands…" : `Find commands for “${term}”`}
              <small>
                Local discovery with cf cli search · nothing runs automatically
              </small>
            </span>
            <ArrowRight size={17} />
          </button>
        )}
      </div>
      <div className="palette-footer">
        <span>
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> to navigate <Kbd>↵</Kbd> to open
        </span>
        <span>{account.name}</span>
      </div>
    </Dialog>
  );
}
