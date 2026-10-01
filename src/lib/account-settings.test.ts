import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("./cf", () => ({
  prepare: vi.fn(),
  runPlan: vi.fn(),
  unwrap: (data: unknown) =>
    data && typeof data === "object" && "result" in data ? data.result : data,
}));
import { prepare, runPlan } from "./cf";
import {
  accountSettings,
  loadAccountRows,
  normalizeAccountRows,
} from "./account-settings";
describe("account settings", () => {
  beforeEach(() => vi.resetAllMocks());
  it("shows member email and role names without exposing raw member data", () => {
    expect(
      normalizeAccountRows(
        {
          result: [
            {
              id: "member",
              user: { email: "member@example.com" },
              roles: [{ name: "Administrator" }],
              status: "accepted",
            },
          ],
        },
        "Members",
      ),
    ).toEqual([
      {
        id: "member",
        name: "member@example.com",
        detail: "Administrator",
        status: "accepted",
      },
    ]);
  });
  it("distinguishes disabled alerts from missing state and rejects malformed responses", () => {
    expect(
      normalizeAccountRows(
        [{ id: "alert", name: "Errors", enabled: false }],
        "Alerts",
      )[0].status,
    ).toBe("Disabled");
    expect(normalizeAccountRows([], "Members")).toEqual([]);
    expect(() =>
      normalizeAccountRows({ error: "denied" }, "Members"),
    ).toThrow();
  });
  it("scopes member pagination and runs only a read plan", async () => {
    vi.mocked(prepare).mockResolvedValue({ classification: "Read" } as never);
    vi.mocked(runPlan).mockResolvedValue({ success: true, data: [] } as never);
    const context = { accountId: "account", profile: "work" };
    await loadAccountRows(accountSettings[0], context, 2);
    expect(prepare).toHaveBeenCalledWith({
      path: ["accounts", "members", "list"],
      context,
      parameters: { page: 2, per_page: 20 },
    });
    expect(runPlan).toHaveBeenCalledWith(
      { classification: "Read" },
      false,
      false,
    );
    vi.mocked(prepare).mockResolvedValue({ classification: "Modify" } as never);
    vi.mocked(runPlan).mockClear();
    await expect(
      loadAccountRows(accountSettings[0], context, 1),
    ).rejects.toThrow("read command");
    expect(runPlan).not.toHaveBeenCalled();
  });
});
