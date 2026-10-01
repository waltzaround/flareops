/** Collect every numbered page. Do not trust the CLI to preserve result_info. */
export async function collectPages<T extends { id: string }>(
  fetchPage: (page: number, perPage: number) => Promise<T[]>,
  perPage = 100,
): Promise<T[]> {
  const items = new Map<string, T>();
  for (let page = 1; page <= 1000; page++) {
    const batch = await fetchPage(page, perPage);
    if (!batch.length) return [...items.values()];
    const previous = items.size;
    for (const item of batch) items.set(item.id, item);
    if (items.size === previous) {
      throw Error(
        "Cloudflare returned a repeated page. Refresh to retry loading all resources.",
      );
    }
  }
  throw Error(
    "The resource list exceeded the pagination limit; loading is incomplete.",
  );
}
