import {
  SpendingSummarySchema,
  CategoryStatsSchema,
  BudgetStatsSchema,
  TrendsSchema,
  CategoryTrendsSchema,
  TopMerchantsSchema,
  SpendingSummaryResultSchema,
  CategoryStatsResultSchema,
  BudgetStatsResultSchema,
  TrendsResultSchema,
  CategoryTrendsResultSchema,
  TopMerchantsResultSchema,
} from "@/lib/validators/reports";
import { op } from "./helpers";

const SummaryResult = SpendingSummaryResultSchema.meta({ id: "SpendingSummaryResult" });
const CategoryStatsResult = CategoryStatsResultSchema.meta({ id: "CategoryStatsResult" });
const BudgetStatsResult = BudgetStatsResultSchema.meta({ id: "BudgetStatsResult" });
const TrendsResult = TrendsResultSchema.meta({ id: "TrendsResult" });
const CategoryTrendsResult = CategoryTrendsResultSchema.meta({ id: "CategoryTrendsResult" });
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
      response: BudgetStatsResult,
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
  "/api/reports/category-trends": {
    get: op({
      id: "categoryTrends",
      summary: "Monthly spend by top-level category, ordered by stability (stacked series)",
      tags: ["Reports"],
      query: CategoryTrendsSchema,
      response: CategoryTrendsResult,
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
