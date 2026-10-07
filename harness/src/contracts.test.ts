import { describe, it, expect } from "vitest";
import { assertSameRefs, safeRemote, startSchema } from "./contracts";
describe("repository and run boundaries", () => {
  it("refuses unsupported providers and malformed model identifiers", () => {
    const base = { prompt: "Build an app", requestId: crypto.randomUUID() };
    expect(startSchema.parse(base).provider).toBe("cloudflare");
    expect(() => startSchema.parse({ ...base, provider: "openai" })).toThrow();
    expect(() =>
      startSchema.parse({ ...base, model: "https://evil.test" }),
    ).toThrow();
    expect(() => startSchema.parse({ ...base, prompt: " " })).toThrow();
  });
  it("rejects credential-bearing remotes and lookalike hosts", () => {
    for (const url of [
      "https://github.com.evil.test/a/b",
      "https://token@github.com/a/b",
      "http://github.com/a/b",
      "https://github.com/a/b?token=secret",
    ])
      expect(() => safeRemote(url, "github")).toThrow();
    expect(safeRemote("https://github.com/a/b.git", "github")).toBe(
      "https://github.com/a/b.git",
    );
  });
  it("requires every branch and tag to retain its exact object ID", () => {
    const refs = { "refs/heads/main": "abc", "refs/tags/v1": "def" };
    expect(() => assertSameRefs(refs, { ...refs })).not.toThrow();
    expect(() => assertSameRefs(refs, { "refs/heads/main": "abc" })).toThrow();
    expect(() =>
      assertSameRefs(refs, { ...refs, "refs/tags/v1": "changed" }),
    ).toThrow();
    expect(() => assertSameRefs({}, {})).toThrow();
  });
});
