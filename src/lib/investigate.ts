import { z } from "zod";
import { prepare, runPlan, unwrap } from "./cf";
import type { Context, Request } from "./types";

export const investigationPages = [
  "Log Explorer",
  "Rule simulator",
  "Logpush",
] as const;
export type InvestigationPage = (typeof investigationPages)[number];
export function logQueryRequest(context: Context, sql: string): Request {
  if (!/^SELECT\s/i.test(sql.trim())) throw Error("Enter a SELECT query.");
  return { context, path: ["logs", "query"], parameters: {}, body: sql.trim() };
}
export function traceRequest(
  context: Context,
  url: string,
  method: string,
  country: string,
  body: string,
): Request {
  const parsed = new URL(url);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  )
    throw Error("Enter an HTTP or HTTPS URL without credentials.");
  if (country && !/^[A-Za-z]{2}$/.test(country))
    throw Error("Use a two-letter country code.");
  return {
    context: { ...context, zoneId: undefined },
    path: ["request-tracers", "traces", "create"],
    parameters: {},
    body: {
      url: parsed.href,
      method,
      skip_response: true,
      ...(country
        ? { context: { geoloc: { iso_code: country.toUpperCase() } } }
        : {}),
      ...(body ? { body: { plain_text: body } } : {}),
    },
  };
}
export async function readInvestigation(request: Request) {
  const plan = await prepare(request);
  if (plan.classification !== "Read")
    throw Error("This operation requires command review.");
  const result = await runPlan(plan, false, false);
  if (!result.success)
    throw Error(result.error || "Unable to load investigation data.");
  return unwrap(result.data);
}
export const logpushJobsSchema = z.array(
  z.object({
    id: z.number(),
    name: z.string().nullish(),
    dataset: z.string().nullish(),
    enabled: z.boolean().optional(),
    last_complete: z.string().nullish(),
    last_error: z.string().nullish(),
    error_message: z.string().nullish(),
  }),
);
export const logRowsSchema = z.array(z.record(z.unknown()));
export type TraceStep = {
  name?: string;
  description?: string;
  step_name?: string;
  type?: string;
  action?: string;
  matched?: boolean;
  expression?: string;
  trace?: TraceStep[];
};
export const traceStepSchema: z.ZodType<TraceStep> = z.lazy(() =>
  z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    step_name: z.string().optional(),
    type: z.string().optional(),
    action: z.string().optional(),
    matched: z.boolean().optional(),
    expression: z.string().optional(),
    trace: z.array(traceStepSchema).optional(),
  }),
);
export const traceResultSchema = z.object({ trace: z.array(traceStepSchema) });
