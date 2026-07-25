import { describe, it, expect } from "vitest";
import { buildRouteRestoreScript, pickRestoreRoute } from "@/lib/route-memory";

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
    expect(pickRestoreRoute({ pathname: "/", search: "", saved: "/" })).toBeNull();
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

/** Run the generated inline script against mock globals; returns the URL it navigated to, or null. */
function runRestoreScript(opts: {
  standalone?: "ios" | "display" | false;
  pathname: string;
  search: string;
  saved: string | null;
}): string | null {
  let replaced: string | null = null;
  const win = {
    navigator: { standalone: opts.standalone === "ios" ? true : undefined },
    matchMedia: () => ({ matches: opts.standalone === "display" }),
    location: {
      pathname: opts.pathname,
      search: opts.search,
      replace: (url: string) => {
        replaced = url;
      },
    },
    localStorage: { getItem: () => opts.saved },
  };
  // The script is a self-contained IIFE that reads everything off `window`.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function("window", buildRouteRestoreScript()) as (w: unknown) => void;
  run(win);
  return replaced;
}

describe("buildRouteRestoreScript (inline zero-flash restore)", () => {
  it("embeds the real decision function rather than a second copy", () => {
    expect(buildRouteRestoreScript()).toContain(pickRestoreRoute.toString());
  });

  it("restores the remembered route on an iOS standalone cold start", () => {
    expect(
      runRestoreScript({ standalone: "ios", pathname: "/", search: "", saved: "/transactions" })
    ).toBe("/transactions");
  });

  it("restores under the standard display-mode media query (Android/desktop PWA)", () => {
    expect(
      runRestoreScript({ standalone: "display", pathname: "/", search: "", saved: "/budgets" })
    ).toBe("/budgets");
  });

  it("does nothing in a normal (non-standalone) browser tab", () => {
    expect(
      runRestoreScript({ standalone: false, pathname: "/", search: "", saved: "/transactions" })
    ).toBeNull();
  });

  it("does not restore on a deep route or when the entry has a query", () => {
    expect(
      runRestoreScript({
        standalone: "ios",
        pathname: "/budgets",
        search: "",
        saved: "/transactions",
      })
    ).toBeNull();
    expect(
      runRestoreScript({
        standalone: "ios",
        pathname: "/",
        search: "?ref=x",
        saved: "/transactions",
      })
    ).toBeNull();
  });

  it("does nothing without a usable saved route", () => {
    expect(
      runRestoreScript({ standalone: "ios", pathname: "/", search: "", saved: null })
    ).toBeNull();
    expect(
      runRestoreScript({ standalone: "ios", pathname: "/", search: "", saved: "/" })
    ).toBeNull();
  });

  it("refuses to navigate off-site from a tampered value", () => {
    expect(
      runRestoreScript({
        standalone: "ios",
        pathname: "/",
        search: "",
        saved: "https://evil.example",
      })
    ).toBeNull();
    expect(
      runRestoreScript({ standalone: "ios", pathname: "/", search: "", saved: "//evil.example" })
    ).toBeNull();
  });
});
