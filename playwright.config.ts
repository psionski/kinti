import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e/ui",
  timeout: 15_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:4001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "cross-env DATABASE_URL=./data/test-e2e.db tsx e2e/ui/prepare-db.ts && cross-env DATABASE_URL=./data/test-e2e.db npx next dev -p 4001",
    url: "http://localhost:4001",
    reuseExistingServer: false,
    stdout: "pipe",
    timeout: 120_000,
  },
  projects: [
    {
      name: "seed-and-tour",
      testMatch: "seed-and-tour.spec.ts",
    },
    {
      name: "onboarding",
      testMatch: "onboarding.spec.ts",
      dependencies: ["seed-and-tour"],
    },
    {
      name: "main",
      testMatch: [
        "transactions.spec.ts",
        "categories.spec.ts",
        "budgets.spec.ts",
        "recurring.spec.ts",
        "assets.spec.ts",
        "multi-currency.spec.ts",
        "symbol-search.spec.ts",
        "reports.spec.ts",
        "navigation.spec.ts",
      ],
      dependencies: ["onboarding"],
    },
  ],
});
