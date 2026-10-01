import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
const dateTimeOptions: Intl.DateTimeFormatOptions = {
  timeZoneName: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
};
export function formatTimestamp(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", dateTimeOptions).format(date);
}
export function formatMetadataValue(value: unknown): string {
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(
      value,
    )
  ) {
    return formatTimestamp(value);
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
export function relativeTime(value: string) {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return value;
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  return mins < 1
    ? "Just now"
    : mins < 60
      ? `${mins}m ago`
      : mins < 1440
        ? `${Math.floor(mins / 60)}h ago`
        : new Date(value).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
}
export async function copy(text: string) {
  await navigator.clipboard.writeText(text);
}
