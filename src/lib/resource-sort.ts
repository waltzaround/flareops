import type { Resource } from "./types";
export type SortKey =
  | "product"
  | "name"
  | "status"
  | "description"
  | "modified"
  | "traffic"
  | "type"
  | "content"
  | "proxied"
  | "ttl";
export function sortResources(
  rows: Resource[],
  key: SortKey,
  direction: "asc" | "desc",
  traffic?: Record<string, number>,
) {
  const value = (r: Resource): string | number | undefined => {
    if (key === "traffic")
      return r.product === "Pages"
        ? undefined
        : traffic
          ? (traffic[r.name] ?? 0)
          : undefined;
    if (key === "modified") {
      const date = Date.parse(r.modified);
      return Number.isFinite(date) ? date : undefined;
    }
    if (key === "proxied")
      return r.proxied === undefined ? undefined : Number(r.proxied);
    return r[key];
  };
  return [...rows].sort((a, b) => {
    const av = value(a),
      bv = value(b);
    if (av === undefined && bv !== undefined) return 1;
    if (bv === undefined && av !== undefined) return -1;
    const difference =
      av === undefined || bv === undefined
        ? 0
        : typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, {
              numeric: true,
              sensitivity: "base",
            });
    return difference
      ? difference * (direction === "asc" ? 1 : -1)
      : a.name.localeCompare(b.name);
  });
}
