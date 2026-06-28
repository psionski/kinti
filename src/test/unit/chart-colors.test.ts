// @vitest-environment node
import { describe, it, expect } from "vitest";
import { fallbackColor } from "@/lib/chart-colors";

describe("fallbackColor", () => {
  it("is deterministic for the same index/count", () => {
    expect(fallbackColor(2, 5)).toBe(fallbackColor(2, 5));
  });

  it("spreads hues evenly across the count", () => {
    // 4 slots → 0°, 90°, 180°, 270°.
    expect(fallbackColor(0, 4)).toBe("oklch(0.68 0.15 0.00)");
    expect(fallbackColor(1, 4)).toBe("oklch(0.68 0.15 90.00)");
    expect(fallbackColor(2, 4)).toBe("oklch(0.68 0.15 180.00)");
    expect(fallbackColor(3, 4)).toBe("oklch(0.68 0.15 270.00)");
  });

  it("does not wrap or collide beyond five items (the old palette cap)", () => {
    const colors = Array.from({ length: 8 }, (_, i) => fallbackColor(i, 8));
    expect(new Set(colors).size).toBe(8);
  });

  it("tolerates a zero count without dividing by zero", () => {
    expect(fallbackColor(0, 0)).toBe("oklch(0.68 0.15 0.00)");
  });
});
