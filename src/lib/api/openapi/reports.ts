import { z } from "zod";
import {
  SpendingSummarySchema,
  CategoryStatsSchema,
  BudgetStatsSchema,
  TrendsSchema,
  TopMerchantsSchema,
  SpendingSummaryResultSchema,
  CategoryStatsResultSchema,
  BudgetStatsItemSchema,
  TrendsResultSchema,
  TopMerchantsResultSchema,
} from "@/lib/validators/reports";
import { op } from "./helpers";

const SummaryResult = SpendingSummaryResultSchema.meta({ id: "SpendingSummaryResult" });
const CategoryStatsResult = CategoryStatsResultSchema.meta({ id: "CategoryStatsResult" });
const BudgetStatsItem = BudgetStatsItemSchema.meta({ id: "BudgetStatsItem" });
const TrendsResult = TrendsResultSchema.meta({ id: "TrendsResult" });
const TopMerchantsResult = TopMerchantsResultSchema.meta({ id: "TopMerchantsResult" });

export const reportPaths = {
  "/api/reports/summary": {
    get: op({
      id: "spendingSummary",
      summary: "Spending summary grouped by category, month, or merchant",
      tags: ["Reports"],
      query: SpendingSummarySchema,
      response: SummaryResult,
      errors: [400, 500],
    }),
  },
  "/api/reports/category-stats": {
    get: op({
      id: "getCategoryStats",
      summary: "Per-category spending stats with rollups and category metadata",
      tags: ["Reports"],
      query: CategoryStatsSchema,
      response: CategoryStatsResult,
      errors: [400, 500],
    }),
  },
  "/api/reports/budget-stats": {
    get: op({
      id: "getBudgetStats",
      summary: "Per-category spending stats augmented with budget amounts for a month",
      tags: ["Reports"],
      query: BudgetStatsSchema,
      response: z.object({
        items: z.array(BudgetStatsItem),
        inheritedFrom: z.string().nullable(),
        currency: z.string(),
      }),
      errors: [400, 500],
    }),
  },
  "/api/reports/trends": {
    get: op({
      id: "trends",
      summary: "Month-over-month spending trends",
      tags: ["Reports"],
      query: TrendsSchema,
      response: TrendsResult,
      errors: [400, 500],
    }),
  },
  "/api/reports/top-merchants": {
    get: op({
      id: "topMerchants",
      summary: "Top merchants by spend",
      tags: ["Reports"],
      query: TopMerchantsSchema,
      response: TopMerchantsResult,
      errors: [400, 500],
    }),
  },
};
