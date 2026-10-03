import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { apiSend } from "@/lib/api-client";
import type { SetBaseCurrencySchema, SetTimezoneSchema } from "@/lib/validators/settings";
import type {
  AssetLotResponse,
  AssetResponse,
  CreateAssetSchema,
  CreateOpeningLotSchema,
} from "@/lib/validators/assets";

export function useSetTimezone() {
  return useMutation({
    mutationFn: (body: z.input<typeof SetTimezoneSchema>) =>
      apiSend<{ timezone: string }>("PUT", "/api/settings/timezone", body),
  });
}

/** Set the base currency. The API refuses to change it once set. */
export function useSetBaseCurrency() {
  return useMutation({
    mutationFn: (body: z.input<typeof SetBaseCurrencySchema>) =>
      apiSend<{ currency: string }>("PUT", "/api/settings/base-currency", body),
  });
}

/** Whether the guided tour starts on the next page load. */
export function useSetTutorial() {
  return useMutation({
    mutationFn: (tutorial: boolean) =>
      apiSend<{ tutorial: boolean }>("PUT", "/api/settings/tutorial", { tutorial }),
  });
}

/**
 * Delete the sample database; the next request starts a fresh, unconfigured
 * one. Cached results for screens not on display describe the deleted
 * database, so they are dropped rather than shown until a refetch lands.
 */
export function useClearSampleData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend<{ cleared: boolean }>("DELETE", "/api/sample-data"),
    onSuccess: () => queryClient.removeQueries({ type: "inactive" }),
  });
}

/** An account or holding the user already has, and the lot that opens it. */
export interface OpeningAsset {
  /** Identifies the holding across attempts, so a retry knows what is already saved. */
  key: string;
  asset: z.input<typeof CreateAssetSchema>;
  lot: z.input<typeof CreateOpeningLotSchema>;
}

/** What earlier attempts saved for one holding. */
interface OpeningProgress {
  /** The asset the API created for it. */
  assetId: number;
  lotBooked: boolean;
}

/**
 * Create each asset with its opening lot, in order — the savings and
 * investments steps of onboarding. Stops at the first request the API refuses.
 *
 * A retry after a failure resumes where the last attempt stopped: holdings
 * already saved are skipped, and one whose asset was created but whose lot was
 * refused books just the lot, on that same asset. `isCreated(key)` says which
 * holdings have an asset already, so the form can stop them being edited away
 * from what was saved.
 */
export function useAddOpeningAssets() {
  const [progress, setProgress] = useState<ReadonlyMap<string, OpeningProgress>>(() => new Map());
  const mutation = useMutation({
    mutationFn: async (holdings: OpeningAsset[]) => {
      const next = new Map(progress);
      try {
        for (const { key, asset, lot } of holdings) {
          let step = next.get(key);
          if (step === undefined) {
            const created = await apiSend<AssetResponse>("POST", "/api/assets", asset);
            step = { assetId: created.id, lotBooked: false };
            next.set(key, step);
          }
          if (!step.lotBooked) {
            await apiSend<AssetLotResponse>("POST", `/api/assets/${step.assetId}/lots`, lot);
            next.set(key, { ...step, lotBooked: true });
          }
        }
      } finally {
        setProgress(next);
      }
    },
  });
  return { ...mutation, isCreated: (key: string) => progress.has(key) };
}
