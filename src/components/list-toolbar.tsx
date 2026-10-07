import type { ReactNode } from "react";
import { RefreshCw, Search, X } from "lucide-react";
import { Button } from "./ui/button";

export function ListToolbar({
  children,
  label = "List controls",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <div className="list-toolbar" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function ListSearch({
  value,
  onChange,
  label,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <div className="list-search">
      <Search size={16} aria-hidden="true" />
      <input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button
          type="button"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={() => onChange("")}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function ListRefresh({
  onRefresh,
  busy = false,
  disabled = false,
}: {
  onRefresh: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      className="list-refresh"
      onClick={onRefresh}
      disabled={disabled || busy}
      aria-label={busy ? "Refreshing resources" : "Refresh resources"}
    >
      <RefreshCw size={15} className={busy ? "spin" : ""} aria-hidden="true" />
      <span>Refresh</span>
    </Button>
  );
}
