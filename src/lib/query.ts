import { QueryClient, useQuery } from "@tanstack/react-query";
import { useUI } from "./store";
import { loadResources, getHistory, workerTraffic, workerCrons } from "./cf";
import type { Resource } from "./types";
import { resourceSchema } from "./types";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});
export function cachedResources(
  mode: "demo" | "live",
  profile: string,
  accountId: string,
): Resource[] {
  return queryClient
    .getQueriesData<unknown>({
      queryKey: ["resources", mode, profile, accountId],
      predicate: (query) =>
        resourceSchema.shape.kind.safeParse(query.queryKey[4]).success,
    })
    .flatMap(([, data]) => {
      if (!Array.isArray(data)) return [];
      return data.flatMap((item) => {
        const resource = resourceSchema.safeParse(item);
        return resource.success ? [resource.data] : [];
      });
    });
}
export function useResources(kind: Resource["kind"]) {
  const { account, zone, mode } = useUI();
  const key = [
    "resources",
    mode,
    account.profile,
    account.id,
    kind,
    kind === "DNS" ? zone : "",
  ];
  const cacheKey = JSON.stringify(key);
  let cached: Resource[] | undefined;
  try {
    const cache = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
    if (cache) cached = resourceSchema.array().parse(cache);
  } catch {
    /* Discard incompatible cache. */
  }
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const data = await loadResources(kind, account.id, account.profile, zone);
      localStorage.setItem(
        cacheKey,
        JSON.stringify(data.map(({ metadata, ...r }) => r)),
      );
      return data;
    },
    enabled: !!account.id && (kind !== "DNS" || !!zone),
    initialData: cached,
    initialDataUpdatedAt: 0,
  });
}
export function useHistory() {
  const { mode, account } = useUI();
  return useQuery({
    queryKey: ["history", mode, account.profile, account.id],
    queryFn: () => getHistory(account.id, account.profile),
    refetchInterval: 5000,
  });
}
export function clearCache() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith('["resources"'))
    .forEach((k) => localStorage.removeItem(k));
  queryClient.removeQueries({ queryKey: ["resources"] });
}

export function useWorkerTraffic(enabled: boolean) {
  const { account, mode } = useUI();
  return useQuery({
    queryKey: [
      "resources",
      mode,
      account.profile,
      account.id,
      "worker-traffic",
    ],
    queryFn: () => workerTraffic(account.profile, account.id),
    enabled: enabled && !!account.id,
    staleTime: 300000,
    retry: false,
  });
}

export function useWorkerCrons(enabled: boolean) {
  const { account, mode } = useUI();
  return useQuery({
    queryKey: ["resources", mode, account.profile, account.id, "worker-crons"],
    queryFn: () => workerCrons(account.profile, account.id),
    enabled: enabled && !!account.id,
    staleTime: 300000,
    retry: false,
  });
}
