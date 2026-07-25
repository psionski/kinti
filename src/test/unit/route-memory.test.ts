import { describe, it, expect } from "vitest";
import { pickRestoreRoute, START_URL } from "@/lib/route-memory";

describe("pickRestoreRoute", () => {
  it("restores a saved deep route when cold-starting on the start URL", () => {
    expect(pickRestoreRoute({ pathname: "/", search: "", saved: "/transactions" })).toBe(
      "/transactions"
    );
  });

  it("preserves query strings and nested paths in the saved route", () => {
    expect(
      pickRestoreRoute({ pathname: "/", search: "", saved: "/transactions?month=2026-07" })
    ).toBe("/transactions?month=2026-07");
    expect(pickRestoreRoute({ pathname: "/", search: "", saved: "/assets/42" })).toBe("/assets/42");
  });

  it("does nothing when there is no saved route", () => {
    expect(pickRestoreRoute({ pathname: "/", search: "", saved: null })).toBeNull();
    expect(pickRestoreRoute({ pathname: "/", search: "", saved: undefined })).toBeNull();
    expect(pickRestoreRoute({ pathname: "/", search: "", saved: "" })).toBeNull();
  });

  it("does nothing when the saved route is already the start URL", () => {
    expect(pickRestoreRoute({ pathname: "/", search: "", saved: START_URL })).toBeNull();
  });

  it("does not hijack an intentional deep entry point", () => {
    expect(
      pickRestoreRoute({ pathname: "/budgets", search: "", saved: "/transactions" })
    ).toBeNull();
  });

  it("does not restore when the entry URL carries its own query", () => {
    expect(
      pickRestoreRoute({ pathname: "/", search: "?ref=email", saved: "/transactions" })
    ).toBeNull();
  });

  it("ignores non-internal saved routes to avoid off-site navigation", () => {
    expect(
      pickRestoreRoute({ pathname: "/", search: "", saved: "https://evil.example" })
    ).toBeNull();
    expect(pickRestoreRoute({ pathname: "/", search: "", saved: "//evil.example" })).toBeNull();
  });
});
