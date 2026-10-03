// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useIsMobile } from "@/hooks/use-mobile";

/** jsdom has no media queries; stand in with one whose result the test controls. */
let matches: boolean;
let listeners: Set<() => void>;
let matchMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  matches = false;
  listeners = new Set();
  matchMedia = vi.fn((query: string) => ({
    media: query,
    get matches() {
      return matches;
    },
    addEventListener: (_: "change", listener: () => void) => listeners.add(listener),
    removeEventListener: (_: "change", listener: () => void) => listeners.delete(listener),
  }));
  vi.stubGlobal("matchMedia", matchMedia);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function resize(mobile: boolean): void {
  matches = mobile;
  for (const listener of listeners) listener();
}

describe("useIsMobile", () => {
  it("asks for widths below the 768px breakpoint", () => {
    renderHook(() => useIsMobile());

    expect(matchMedia).toHaveBeenCalledWith("(max-width: 767px)");
  });

  it("reports the viewport the hook mounts in", () => {
    matches = true;

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it("follows the viewport across the breakpoint", () => {
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => resize(true));
    expect(result.current).toBe(true);

    act(() => resize(false));
    expect(result.current).toBe(false);
  });

  it("stops listening once unmounted", () => {
    const { unmount } = renderHook(() => useIsMobile());
    expect(listeners.size).toBe(1);

    unmount();

    expect(listeners.size).toBe(0);
  });
});
