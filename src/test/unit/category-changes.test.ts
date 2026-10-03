import { describe, it, expect } from "vitest";
import { spendingChanges } from "@/components/reports/category-changes-card";
import type { SpendingGroup } from "@/lib/validators/reports";

function group(key: string, total: number, compareTotal?: number): SpendingGroup {
  return { key, total, count: 1, compareTotal };
}

describe("spendingChanges", () => {
  it("lists a change of a few units, which a cents-era threshold would hide", () => {
    const [row] = spendingChanges([group("Coffee", 45, 30)]);

    expect(row).toEqual({ name: "Coffee", current: 45, previous: 30, delta: 15, deltaPercent: 50 });
  });

  it("drops a change under one unit of the base currency", () => {
    expect(spendingChanges([group("Bread", 10.4, 10)])).toEqual([]);
  });

  it("keeps a change of exactly one unit", () => {
    expect(spendingChanges([group("Milk", 3, 2)])).toHaveLength(1);
  });

  it("orders changes by size, whichever direction they go", () => {
    const rows = spendingChanges([
      group("Fuel", 120, 100),
      group("Rent", 900, 1000),
      group("Books", 12, 10),
    ]);

    expect(rows.map((r) => r.name)).toEqual(["Rent", "Fuel", "Books"]);
  });

  it("skips groups with nothing to compare against", () => {
    expect(spendingChanges([group("New", 50)])).toEqual([]);
  });
});
