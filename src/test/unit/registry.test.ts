// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeTestDb } from "../helpers";
import { SettingsService } from "@/lib/services/settings";
import { ProviderNameSchema } from "@/lib/providers/types";

// Stub global fetch so health checks don't hit real APIs
vi.stubGlobal(
  "fetch",
  vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })))
);
import {
  getProviderMeta,
  getAllProviderNames,
  getProvidersByAssetType,
  getProvider,
  getAllProviders,
  getUnconfiguredProviders,
  getProviderStatuses,
} from "@/lib/providers/registry";

describe("Provider Registry", () => {
  let settings: SettingsService;

  beforeEach(() => {
    const db = makeTestDb();
    settings = new SettingsService(db);
  });

  describe("getProviderMeta", () => {
    it("returns metadata for every known provider", () => {
      for (const name of ProviderNameSchema.options) {
        const meta = getProviderMeta(name);
        expect(meta.name).toBe(name);
        expect(Array.isArray(meta.assetTypes)).toBe(true);
        expect(meta.assetTypes.length).toBeGreaterThan(0);
        expect(["none", "optional", "required"]).toContain(meta.apiKeyRequired);
        expect(typeof meta.create).toBe("function");
      }
    });

    it("throws for unknown provider name", () => {
      expect(() => getProviderMeta("unknown" as never)).toThrow("Unknown provider");
    });
  });

  describe("getAllProviderNames", () => {
    it("returns all names from ProviderNameSchema in order", () => {
      const names = getAllProviderNames();
      expect(names).toHaveLength(ProviderNameSchema.options.length);
      for (const name of ProviderNameSchema.options) {
        expect(names).toContain(name);
      }
    });
  });

  describe("getProvidersByAssetType", () => {
    it("returns crypto providers for crypto asset type", () => {
      const providers = getProvidersByAssetType(settings, "crypto");
      const names = providers.map((p) => p.name);
      expect(names).toContain("coingecko");
      // alpha-vantage requires a key — not returned without one
      expect(names).not.toContain("frankfurter");
      expect(names).not.toContain("ecb");
    });

    it("returns deposit providers for deposit asset type", () => {
      const providers = getProvidersByAssetType(settings, "deposit");
      const names = providers.map((p) => p.name);
      expect(names).toContain("frankfurter");
      expect(names).toContain("ecb");
      expect(names).not.toContain("coingecko");
    });

    it("returns investment providers when key is set", () => {
      settings.set("provider.alpha-vantage.key", "test-key");
      const providers = getProvidersByAssetType(settings, "investment");
      const names = providers.map((p) => p.name);
      expect(names).toContain("alpha-vantage");
      expect(names).not.toContain("frankfurter");
      expect(names).not.toContain("coingecko");
    });

    it("includes alpha-vantage for crypto when key is set", () => {
      settings.set("provider.alpha-vantage.key", "test-key");
      const providers = getProvidersByAssetType(settings, "crypto");
      const names = providers.map((p) => p.name);
      expect(names).toContain("coingecko");
      expect(names).toContain("alpha-vantage");
    });

    it("returns all providers when assetType is undefined", () => {
      const all = getAllProviders(settings);
      const filtered = getProvidersByAssetType(settings);
      expect(filtered.map((p) => p.name)).toEqual(all.map((p) => p.name));
    });
  });

  describe("getProvider", () => {
    it("returns provider for no-key providers", () => {
      const provider = getProvider("frankfurter", settings);
      expect(provider).not.toBeNull();
      expect(provider!.name).toBe("frankfurter");
    });

    it("returns provider for optional-key provider without key", () => {
      const provider = getProvider("coingecko", settings);
      expect(provider).not.toBeNull();
      expect(provider!.name).toBe("coingecko");
    });

    it("returns null for required-key provider without key", () => {
      expect(getProvider("alpha-vantage", settings)).toBeNull();
      expect(getProvider("open-exchange-rates", settings)).toBeNull();
    });

    it("returns provider for required-key provider with key set", () => {
      settings.set("provider.alpha-vantage.key", "test-key");
      const provider = getProvider("alpha-vantage", settings);
      expect(provider).not.toBeNull();
      expect(provider!.name).toBe("alpha-vantage");
    });
  });

  describe("getAllProviders", () => {
    it("skips required-key providers without keys", () => {
      const providers = getAllProviders(settings);
      const names = providers.map((p) => p.name);
      expect(names).toContain("frankfurter");
      expect(names).toContain("ecb");
      expect(names).toContain("coingecko");
      expect(names).not.toContain("open-exchange-rates");
      expect(names).not.toContain("alpha-vantage");
    });

    it("includes required-key providers when keys are set", () => {
      settings.set("provider.alpha-vantage.key", "test-key");
      settings.set("provider.open-exchange-rates.key", "test-key");
      const providers = getAllProviders(settings);
      const names = providers.map((p) => p.name);
      expect(names).toContain("alpha-vantage");
      expect(names).toContain("open-exchange-rates");
    });
  });

  describe("getUnconfiguredProviders", () => {
    it("returns providers that need keys but don't have them", () => {
      const missing = getUnconfiguredProviders(settings);
      expect(missing).toContain("open-exchange-rates");
      expect(missing).toContain("alpha-vantage");
      expect(missing).toContain("coingecko");
      expect(missing).not.toContain("frankfurter");
      expect(missing).not.toContain("ecb");
    });

    it("excludes providers once their key is set", () => {
      settings.set("provider.alpha-vantage.key", "test-key");
      const missing = getUnconfiguredProviders(settings);
      expect(missing).not.toContain("alpha-vantage");
      expect(missing).toContain("open-exchange-rates");
    });

    it("returns empty when all keys are configured", () => {
      settings.set("provider.alpha-vantage.key", "k");
      settings.set("provider.open-exchange-rates.key", "k");
      settings.set("provider.coingecko.key", "k");
      settings.set("provider.exchangerate-api.key", "k");
      settings.set("provider.twelve-data.key", "k");
      settings.set("provider.finnhub.key", "k");
      settings.set("provider.coinmarketcap.key", "k");
      expect(getUnconfiguredProviders(settings)).toHaveLength(0);
    });
  });

  describe("getProviderStatuses", () => {
    it("returns status for ALL providers regardless of key state", async () => {
      const statuses = await getProviderStatuses(settings);
      expect(statuses).toHaveLength(ProviderNameSchema.options.length);

      const names = statuses.map((s) => s.name);
      for (const name of ProviderNameSchema.options) {
        expect(names).toContain(name);
      }
    });

    it("reports correct metadata and key state", async () => {
      settings.set("provider.alpha-vantage.key", "test-key");
      const statuses = await getProviderStatuses(settings);
      const byName = Object.fromEntries(statuses.map((s) => [s.name, s]));

      // Asset types
      expect(byName["frankfurter"]!.assetTypes).toEqual(["deposit"]);
      expect(byName["coingecko"]!.assetTypes).toEqual(["crypto"]);
      expect(byName["alpha-vantage"]!.assetTypes).toEqual(["investment", "crypto"]);

      // Key requirements
      expect(byName["frankfurter"]!.apiKeyRequired).toBe("none");
      expect(byName["coingecko"]!.apiKeyRequired).toBe("optional");
      expect(byName["alpha-vantage"]!.apiKeyRequired).toBe("required");

      // Key state
      expect(byName["frankfurter"]!.apiKeySet).toBe(true);
      expect(byName["open-exchange-rates"]!.apiKeySet).toBe(false);
      expect(byName["alpha-vantage"]!.apiKeySet).toBe(true);

      // Health is always populated (boolean or false on failure)
      for (const s of statuses) {
        expect(typeof s.healthy).toBe("boolean");
      }
    });
  });
});
