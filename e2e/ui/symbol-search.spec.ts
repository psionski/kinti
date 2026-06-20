import { test, expect } from "@playwright/test";
import { waitForPageReady } from "./helpers";

/** Helper: open asset creation dialog with a given type. */
async function openAssetDialogWithType(
  page: import("@playwright/test").Page,
  type: string
): Promise<void> {
  await page.goto("/assets");
  await waitForPageReady(page);
  await page.getByRole("button", { name: "Add Asset" }).click();
  await page.locator("#asset-name").fill("Test Asset");

  if (type !== "Deposit") {
    await page.locator("#asset-type").click();
    await page.locator("[role='option']").filter({ hasText: type }).click();
  }
}

/** Helper: open the symbol search dialog from within the asset form. */
async function openSymbolSearchDialog(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("heading", { name: "Search Symbols" })).toBeVisible();
}

test.describe.serial("Symbol Search — provider filtering", () => {
  test("crypto asset search only shows crypto providers", async ({ page }) => {
    await openAssetDialogWithType(page, "Crypto");

    await openSymbolSearchDialog(page);
    await page.getByPlaceholder("Search by name or symbol").fill("bitcoin");

    const results = page.locator("[data-testid='symbol-search-results']");
    await expect(results.getByText("CoinGecko")).toBeVisible({ timeout: 10_000 });
    await expect(results.getByText("Frankfurter")).not.toBeVisible();
    await expect(results.getByText("ECB")).not.toBeVisible();
    await expect(results.getByText("crypto").first()).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("deposit asset with non-EUR currency shows only currency providers", async ({ page }) => {
    await page.goto("/assets");
    await waitForPageReady(page);
    await page.getByRole("button", { name: "Add Asset" }).click();
    await page.locator("#asset-name").fill("USD Savings");
    await page.locator("#asset-currency").click();
    await page.getByPlaceholder("Search currencies...").fill("USD");
    await page.getByTestId("currency-option-USD").click();

    await openSymbolSearchDialog(page);
    await page.getByPlaceholder("Search by name or symbol").fill("USD");

    const results = page.locator("[data-testid='symbol-search-results']");
    // Wait for at least one currency result (either Frankfurter or ECB may respond first)
    await expect(results.getByText("currency").first()).toBeVisible({ timeout: 10_000 });
    // Crypto providers must be filtered out for deposit assets
    await expect(results.getByText("CoinGecko")).not.toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
  });
});

test.describe("Symbol Search — SSE parsing (mocked)", () => {
  function sseEvent(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  test("correctly parses multi-provider SSE response", async ({ page }) => {
    const body =
      sseEvent("results", {
        provider: "frankfurter",
        results: [{ provider: "frankfurter", symbol: "USD", name: "US Dollar", type: "currency" }],
      }) +
      sseEvent("results", {
        provider: "coingecko",
        results: [
          { provider: "coingecko", symbol: "bitcoin", name: "Bitcoin (BTC)", type: "crypto" },
        ],
      }) +
      sseEvent("done", {});

    await page.route("**/api/financial/search-symbol**", (route) =>
      route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
        body,
      })
    );

    await openAssetDialogWithType(page, "Other");
    await page.locator("#asset-currency").click();
    await page.getByPlaceholder("Search currencies...").fill("USD");
    await page.getByTestId("currency-option-USD").click();

    await openSymbolSearchDialog(page);
    await page.getByPlaceholder("Search by name or symbol").fill("test query");

    const results = page.locator("[data-testid='symbol-search-results']");
    await expect(results.getByText("Frankfurter")).toBeVisible({ timeout: 5_000 });
    await expect(results.getByText("US Dollar")).toBeVisible();
    await expect(results.getByText("CoinGecko")).toBeVisible();
    await expect(results.getByText("Bitcoin (BTC)")).toBeVisible();

    await expect(results.getByText("currency")).toBeVisible();
    await expect(results.getByText("crypto")).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
  });
});
