import { describe, expect, it, vi } from "vitest";
import { collectPages } from "./pagination";
describe("resource pagination", () => {
  it("loads all 55 items even if the service limits each page to 10", async () => {
    const items = Array.from({ length: 55 }, (_, i) => ({ id: String(i) }));
    const fetch = vi.fn(async (page: number) =>
      items.slice((page - 1) * 10, page * 10),
    );
    expect(await collectPages(fetch)).toEqual(items);
    expect(fetch).toHaveBeenLastCalledWith(7, 100);
  });
  it("loads multiple full pages and removes overlapping entries", async () => {
    const items = Array.from({ length: 205 }, (_, i) => ({ id: String(i) }));
    expect(
      await collectPages(async (page) =>
        page === 1
          ? items.slice(0, 100)
          : page === 2
            ? items.slice(99, 199)
            : page === 3
              ? items.slice(199)
              : [],
      ),
    ).toEqual(items);
  });
  it("rejects a failed or repeated page instead of returning a partial list", async () => {
    await expect(collectPages(async () => [{ id: "same" }])).rejects.toThrow(
      "repeated page",
    );
    await expect(
      collectPages(async (page) => {
        if (page === 2) throw Error("Offline");
        return [{ id: "first" }];
      }),
    ).rejects.toThrow("Offline");
  });
});
