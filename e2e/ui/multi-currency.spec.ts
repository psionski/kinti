import { test, expect, type Page } from "@playwright/test";
import { waitForPageReady } from "./helpers";

/**
 * E2E coverage for the Sprint 27 multi-currency feature set:
 *  - Settings: base currency is locked once chosen at onboarding.
 *  - Transactions: a foreign-currency expense renders the native amount in
 *    the table and exposes the base equivalent in a tooltip.
 *  - Recurring: foreign-currency templates round-trip the currency through
 *    create + table render.
 *  - Assets: a foreign-currency investment shows a native+base preview
 *    on the buy dialog and persists base-currency cost basis after a buy.
 *
 * The configured base currency for the test DB is EUR (set during the
 * onboarding spec). de-DE is the display locale, so foreign currencies
 * render as e.g. "12,50 $" (USD) and "15,99 £" (GBP).
 *
 * Network: USD/EUR and GBP/EUR are quoted via Frankfurter for any required
 * write-time FX (transaction creation, asset buy). Frankfurter has been
 * stable for the existing assets/symbol-search specs, so the same provider
 * dependency is reused here rather than introducing a mock.
 */

/**
 * Pick a value from the shared CurrencyPicker by its ISO 4217 code. The
 * picker renders one button with `data-testid="currency-option-{code}"`
 * per option, so this is much more reliable than typing the search box
 * (which can be filled before the option list rehydrates).
 */
async function pickCurrency(page: Page, triggerId: string, code: string): Promise<void> {
  await page.locator(`#${triggerId}`).click();
  await page.getByTestId(`currency-option-${code}`).click();
}

/** YYYY-MM-DD for "now plus N days", computed at runtime so the test stays
 *  green regardless of when it runs. Used to anchor recurring start dates in
 *  the future so the create call doesn't trigger past-date generation (which
 *  would otherwise fan out into per-occurrence FX lookups). */
function isoOffsetFromToday(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Navigate from /assets to a single asset's detail page by name. The asset
 * card on /assets renders the name in a CardTitle and the navigation Link
 * separately (the Link's accessible name is just an arrow icon), so we can't
 * use `getByRole('link', { name })`. Instead we scope by the card subtree
 * containing the title and click its `data-testid="asset-link-{id}"` button.
 */
async function openAssetByName(page: Page, name: string): Promise<void> {
  const cards = page.locator('[data-tour="asset-cards"] > *');
  const card = cards.filter({ hasText: name });
  await expect(card).toHaveCount(1);
  await card.locator("[data-testid^='asset-link-']").click();
  await page.waitForURL("**/assets/**");
  await waitForPageReady(page);
}

test.describe.serial("Multi-currency", () => {
  // ── Settings ─────────────────────────────────────────────────────────────

  test("base currency picker is locked after onboarding", async ({ page }) => {
    await page.goto("/settings");
    await waitForPageReady(page);

    // The picker is rendered, shows EUR (chosen during onboarding), and is
    // `disabled` — that's the primary contract for the immutability rule.
    const picker = page.locator("#base-currency");
    await expect(picker).toBeVisible();
    await expect(picker).toBeDisabled();
    await expect(picker).toContainText("EUR");

    // The pre-save explainer copy contains a "this can't be changed later"
    // warning that is dropped once the currency is saved/locked
    // (settings-client.tsx renders it conditionally on `!baseCurrencyLocked`).
    // Asserting its *absence* is a targeted positive signal for the
    // locked state without depending on fragile DOM scoping.
    await expect(page.getByText(/can't be changed later/i)).toHaveCount(0);
  });

  // ── Transactions ─────────────────────────────────────────────────────────

  test("create USD expense transaction", async ({ page }) => {
    await page.goto("/transactions");
    await waitForPageReady(page);

    await page.getByRole("button", { name: "Add Transaction" }).click();

    await page.locator("#tx-amount").fill("12.50");
    await page.locator("#tx-description").fill("Coffee in NYC");

    // Default is the configured base (EUR). Switch to USD via the picker.
    await pickCurrency(page, "tx-currency", "USD");

    await page.getByRole("button", { name: "Add Transaction" }).click();
    // Dialog closes once the create succeeds (which itself depends on the
    // Frankfurter USD→EUR lookup at write time).
    await expect(page.locator("#tx-amount")).not.toBeVisible({ timeout: 10_000 });

    const row = page.locator("tr").filter({ hasText: "Coffee in NYC" });
    await expect(row).toBeVisible();
    // de-DE renders USD as "12,50 $" with the symbol after the number.
    // The table cell shows the *native* amount; the EUR base equivalent
    // lives in a tooltip and is not part of the cell text by default.
    await expect(row).toContainText("12,50");
    await expect(row).toContainText("$");
    // No EUR symbol in the visible cell — that would mean the table fell
    // back to base-currency rendering.
    await expect(row.locator("td").nth(5)).not.toContainText("€");
  });

  test("USD transaction tooltip shows base-currency equivalent", async ({ page }) => {
    await page.goto("/transactions");
    await waitForPageReady(page);

    const row = page.locator("tr").filter({ hasText: "Coffee in NYC" });
    await expect(row).toBeVisible();

    // The amount span is wrapped in a Radix Tooltip trigger only when the
    // row's currency differs from the base. The trigger uses `asChild`, so
    // the span itself carries `data-slot="tooltip-trigger"` — hover that
    // directly rather than the surrounding cell, since the inline span
    // doesn't fill the cell and a cell-level hover may land on whitespace.
    // Hovering surfaces the "≈ €... (base)" label, which is the user-visible
    // proof that amount_base was computed and stored.
    const amountTrigger = row.locator("[data-slot='tooltip-trigger']").filter({
      hasText: "12,50",
    });
    await expect(amountTrigger).toBeVisible();
    await amountTrigger.hover();
    // Tooltip content is portaled outside the row tree, so query at page level.
    const tooltip = page.locator("[data-slot='tooltip-content']");
    await expect(tooltip).toBeVisible({ timeout: 5_000 });
    await expect(tooltip).toContainText("base");
    await expect(tooltip).toContainText("€");
  });

  // ── Recurring ────────────────────────────────────────────────────────────

  test("create GBP recurring template", async ({ page }) => {
    await page.goto("/recurring");
    await waitForPageReady(page);

    await page.getByRole("button", { name: "Add Recurring" }).click();

    await page.locator("#recurring-description").fill("London rent");
    await page.locator("#recurring-amount").fill("1500");
    // Anchor the start date in the future so the create call doesn't fan out
    // into per-occurrence FX lookups for past months. The currency round-trip
    // through the table render is what we're validating here, not the
    // generation engine.
    await page.locator("#recurring-start").fill(isoOffsetFromToday(30));

    await pickCurrency(page, "recurring-currency", "GBP");

    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.locator("#recurring-description")).not.toBeVisible({ timeout: 10_000 });

    const row = page.locator("[data-testid^='recurring-row-']").filter({ hasText: "London rent" });
    await expect(row).toBeVisible();
    // de-DE GBP formatting: "1.500,00 £" — verify both the digit grouping
    // and the GBP symbol so we know the table read item.currency, not
    // the cached base.
    await expect(row).toContainText("1.500,00");
    await expect(row).toContainText("£");
  });

  // ── Assets ───────────────────────────────────────────────────────────────

  test("create USD investment asset", async ({ page }) => {
    await page.goto("/assets");
    await waitForPageReady(page);

    await page.getByRole("button", { name: "Add Asset" }).click();

    await page.locator("#asset-name").fill("US Tech Holdings");

    // Switch from the default Deposit type to Investment. The asset form
    // does not show the SymbolSearch row for base-currency deposits, but
    // it does for any non-deposit type, so we can leave tracking empty
    // here without breaking layout.
    await page.locator("#asset-type").click();
    await page.locator("[role='option']").filter({ hasText: "Investment" }).click();

    // Open the CurrencyPicker and select USD.
    await page.locator("#asset-currency").click();
    await page.getByPlaceholder("Search currencies...").fill("USD");
    await page.getByTestId("currency-option-USD").click();

    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.locator("#asset-name")).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("US Tech Holdings", { exact: true })).toBeVisible();
  });

  test("create USD deposit asset and deposit foreign cash", async ({ page }) => {
    // Regression: this entire flow was broken before the dialog fix.
    // The deposit dialog used to send `pricePerUnit: rate` for foreign-currency
    // deposits, which AssetLotService.assertDepositPrice (and BuyAssetSchema's
    // documentation) explicitly rejects — for ANY deposit asset, regardless of
    // currency, pricePerUnit must be exactly 1. The fix changes the dialog to
    // always send pricePerUnit: 1 and handle FX via a read-only preview strip
    // that mirrors the server's own toBase() FX call.

    // First, create the asset.
    await page.goto("/assets");
    await waitForPageReady(page);

    await page.getByRole("button", { name: "Add Asset" }).click();
    await page.locator("#asset-name").fill("USD Travel Fund");
    // Default type is Deposit — leave it. Override the EUR currency default.
    await page.locator("#asset-currency").click();
    await page.getByPlaceholder("Search currencies...").fill("USD");
    await page.getByTestId("currency-option-USD").click();
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.locator("#asset-name")).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("USD Travel Fund", { exact: true })).toBeVisible();

    // Navigate into the asset detail page and open the Deposit dialog.
    await openAssetByName(page, "USD Travel Fund");

    await page.getByRole("button", { name: "Deposit", exact: true }).click();

    const dialog = page.getByRole("dialog");
    await dialog.locator("#dep-amount").fill("500");

    // The foreign-currency preview strip is rendered only when the dialog
    // detects asset.currency !== baseCurrency AND /api/financial/convert
    // returns a rate. Its appearance is the public proof that the dialog is
    // hitting the same FX provider chain as the server's toBase().
    const preview = dialog.getByTestId("deposit-base-preview");
    await expect(preview).toBeVisible({ timeout: 10_000 });
    await expect(preview).toContainText(/≈\s*EUR/);
    await expect(preview).toContainText(/Rate:\s*1\s*USD\s*=/);
    await expect(preview).toContainText("€");
    await expect(preview).toContainText("$");

    // Submit. With the fix, this sends pricePerUnit: 1 — which the service
    // accepts. Before the fix, the request would have failed with
    // "USD deposit: pricePerUnit must be 1 ...".
    await dialog.getByRole("button", { name: "Deposit", exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // Holdings card shows the native USD balance directly. Use a strict
    // selector so we don't accidentally match the cost-basis card below.
    const holdingsCard = page
      .locator("div")
      .filter({ has: page.getByText("Holdings", { exact: true }) })
      .first();
    await expect(holdingsCard).toContainText("500");
    await expect(holdingsCard).toContainText("USD");

    // Cost Basis renders the native USD amount with the base-currency
    // equivalent on the line below. Both lines together prove that the lot
    // was created with pricePerUnit=1 (so native cost basis = quantity = 500
    // USD) AND that pricePerUnitBase was snapshotted via the FX chain (so
    // the "≈ €..." line shows up at all).
    const costBasisCard = page
      .locator("div")
      .filter({ has: page.getByText("Cost Basis", { exact: true }) })
      .first();
    await expect(costBasisCard).toContainText("500,00");
    await expect(costBasisCard).toContainText("$");
    await expect(costBasisCard).toContainText("≈");
    await expect(costBasisCard).toContainText("€");
  });

  test("buy USD asset shows native + base preview and persists base cost basis", async ({
    page,
  }) => {
    await page.goto("/assets");
    await waitForPageReady(page);

    // Open the US Tech Holdings detail page via its card link.
    await openAssetByName(page, "US Tech Holdings");

    await page.getByRole("button", { name: "Buy", exact: true }).click();

    const dialog = page.getByRole("dialog");
    await dialog.locator("#lot-quantity").fill("10");
    await dialog.locator("#lot-price").fill("100");

    // The buy dialog triggers /api/financial/convert via useEffect once
    // both quantity and price are filled — wait for the rendered preview
    // strip ("≈ EUR" + the "Rate: 1 USD = ..." line) before submitting.
    // Both lines live inside the same muted box; matching on either is
    // enough proof that the FX lookup completed.
    await expect(dialog.getByText(/≈\s*EUR/)).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/Rate:\s*1\s*USD\s*=/)).toBeVisible();

    await dialog.getByRole("button", { name: "Buy", exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // After the buy, the Cost Basis card on the detail page shows the
    // native USD total (10 × $100 = "1.000,00 $"), with the base-currency
    // equivalent rendered as a smaller "≈ €..." line beneath. Both
    // assertions verify the column-pair: native and base side-by-side.
    const costBasisCard = page
      .locator("div")
      .filter({ has: page.getByText("Cost Basis", { exact: true }) })
      .first();
    await expect(costBasisCard).toContainText("1.000,00");
    await expect(costBasisCard).toContainText("$");
    // The base-currency line is only rendered when costBasisBase !==
    // costBasis (i.e. when the asset is foreign), so its presence is the
    // proof that pricePerUnitBase was snapshotted at lot creation.
    await expect(costBasisCard).toContainText("≈");
    await expect(costBasisCard).toContainText("€");
  });
});
