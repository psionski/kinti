// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb } from "../helpers";
import { SettingsService } from "@/lib/services/settings";

let service: SettingsService;

beforeEach(() => {
  // Settings tests need a pristine settings table — skip the auto-seeded
  // base_currency row that other tests rely on.
  service = new SettingsService(makeTestDb({ seedBaseCurrency: false }));
});

describe("get", () => {
  it("returns null for a missing key", () => {
    expect(service.get("nonexistent")).toBeNull();
  });

  it("returns the value for an existing key", () => {
    service.set("theme", "dark");
    expect(service.get("theme")).toBe("dark");
  });
});

describe("set", () => {
  it("creates a new setting", () => {
    service.set("foo", "bar");
    expect(service.get("foo")).toBe("bar");
  });

  it("upserts an existing setting", () => {
    service.set("foo", "bar");
    service.set("foo", "baz");
    expect(service.get("foo")).toBe("baz");
    expect(service.list()).toHaveLength(1);
  });
});

describe("delete", () => {
  it("returns false for a missing key", () => {
    expect(service.delete("nonexistent")).toBe(false);
  });

  it("deletes an existing key and returns true", () => {
    service.set("to-delete", "value");
    expect(service.delete("to-delete")).toBe(true);
    expect(service.get("to-delete")).toBeNull();
  });
});

describe("list", () => {
  it("returns empty array when no settings", () => {
    expect(service.list()).toEqual([]);
  });

  it("returns all settings", () => {
    service.set("a", "1");
    service.set("b", "2");
    const all = service.list();
    expect(all).toHaveLength(2);
    expect(all.map((s) => s.key).sort()).toEqual(["a", "b"]);
  });
});

describe("getTimezone", () => {
  it("returns null when no timezone is configured", () => {
    expect(service.getTimezone()).toBeNull();
  });

  it("returns the configured timezone", () => {
    service.setTimezone("Europe/Amsterdam");
    expect(service.getTimezone()).toBe("Europe/Amsterdam");
  });

  it("can be updated", () => {
    service.setTimezone("America/New_York");
    expect(service.getTimezone()).toBe("America/New_York");

    service.setTimezone("Asia/Tokyo");
    expect(service.getTimezone()).toBe("Asia/Tokyo");
  });
});

describe("setTimezone", () => {
  it("accepts valid IANA timezone identifiers", () => {
    expect(() => service.setTimezone("UTC")).not.toThrow();
    expect(() => service.setTimezone("Europe/Amsterdam")).not.toThrow();
    expect(() => service.setTimezone("America/Los_Angeles")).not.toThrow();
    expect(() => service.setTimezone("Asia/Kolkata")).not.toThrow();
    expect(() => service.setTimezone("Pacific/Auckland")).not.toThrow();
  });

  it("rejects invalid timezone identifiers", () => {
    expect(() => service.setTimezone("Not/A/Timezone")).toThrow("Invalid IANA timezone");
    expect(() => service.setTimezone("")).toThrow("Invalid IANA timezone");
  });

  it("stores timezone in settings table", () => {
    service.setTimezone("Europe/Berlin");
    expect(service.get("timezone")).toBe("Europe/Berlin");
  });
});
