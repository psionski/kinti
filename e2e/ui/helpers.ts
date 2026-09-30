import { expect, type Page } from "@playwright/test";

// ── Page readiness ──

/** Wait for loading skeletons to disappear and hydration to complete. */
export async function waitForPageReady(page: Page): Promise<void> {
  await expect(page.locator('[data-slot="skeleton"]').first()).not.toBeVisible({ timeout: 10_000 });
  await page.waitForLoadState("networkidle");
}

// ── Navigation ──

export async function navigateTo(page: Page, route: string): Promise<void> {
  const link = page.locator(`[data-tour="sidebar-nav"] a[href="${route}"]`);
  await link.click();
  await page.waitForURL(`**${route}`);
  await waitForPageReady(page);
}

// ── Tour helpers ──

export async function waitForTourStep(page: Page, title: string): Promise<void> {
  await expect(page.locator('[data-test-id="joyride-tooltip"]')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(title)).toBeVisible({ timeout: 5000 });
}

export async function clickTourButton(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: label }).click();
}

// ── Toast / feedback assertions ──

export async function expectToastMessage(page: Page, text: string): Promise<void> {
  // The app uses inline success states on buttons rather than a toast library.
  // Look for the text in the page (button label change, inline message, etc.)
  await expect(page.getByText(text)).toBeVisible({ timeout: 5000 });
}

// ── Table helpers ──

export async function expectTableRowCount(page: Page, count: number): Promise<void> {
  await expect(page.locator("tbody tr")).toHaveCount(count);
}

// ── Data creation via UI ──

export async function createCategoryViaUI(
  page: Page,
  opts: { name: string; parent?: string }
): Promise<void> {
  await navigateTo(page, "/categories");
  await page.getByRole("button", { name: "Add Category" }).click();
  await page.locator("#cat-name").fill(opts.name);
  if (opts.parent) {
    await page.locator("#cat-parent").click();
    await page.getByRole("option", { name: opts.parent }).click();
  }
  await page.getByRole("button", { name: "Create" }).click();
  // Wait for dialog to close, then verify category appears in table
  await expect(page.locator("#cat-name")).not.toBeVisible({ timeout: 5000 });
  await expect(page.locator("tbody").getByText(opts.name)).toBeVisible();
}

export async function createTransactionViaUI(
  page: Page,
  opts: {
    amount: string;
    type: "income" | "expense" | "refund";
    description: string;
    category?: string;
    date?: string;
  }
): Promise<void> {
  await navigateTo(page, "/transactions");
  await page.getByRole("button", { name: "Add Transaction" }).click();

  // Select type (capitalize first letter to match button text)
  const typeName = opts.type.charAt(0).toUpperCase() + opts.type.slice(1);
  await page.getByRole("button", { name: typeName, exact: true }).click();

  await page.locator("#tx-amount").fill(opts.amount);
  await page.locator("#tx-description").fill(opts.description);

  if (opts.date) {
    await page.locator("#tx-date").fill(opts.date);
  }

  if (opts.category) {
    await page.locator("#tx-category").click();
    await page.locator("[role='option']").filter({ hasText: opts.category }).click();
  }

  await page.getByRole("button", { name: "Add Transaction" }).click();
  // Wait for dialog to close
  await expect(page.locator("#tx-amount")).not.toBeVisible({ timeout: 5000 });
}

export async function createBudgetViaUI(
  page: Page,
  opts: { category: string; amount: string }
): Promise<void> {
  await navigateTo(page, "/budgets");
  await page.getByRole("button", { name: "Add Budget" }).click();

  await page.locator("#budget-category").click();
  await page.getByRole("option", { name: opts.category }).click();
  await page.locator("#budget-amount").fill(opts.amount);

  await page.getByRole("button", { name: "Set Budget" }).click();
  await expect(page.locator("#budget-amount")).not.toBeVisible({ timeout: 5000 });
}

export async function createRecurringViaUI(
  page: Page,
  opts: {
    description: string;
    amount: string;
    frequency?: string;
    category?: string;
  }
): Promise<void> {
  await navigateTo(page, "/recurring");
  await page.getByRole("button", { name: "Add Recurring" }).click();

  await page.locator("#recurring-description").fill(opts.description);
  await page.locator("#recurring-amount").fill(opts.amount);

  if (opts.frequency) {
    await page.locator("#recurring-frequency").click();
    await page.getByRole("option", { name: opts.frequency }).click();
  }

  if (opts.category) {
    await page.locator("#recurring-category").click();
    await page.getByRole("option", { name: opts.category }).click();
  }

  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.locator("#recurring-description")).not.toBeVisible({ timeout: 5000 });
}

export async function createAssetViaUI(
  page: Page,
  opts: { name: string; type: string }
): Promise<void> {
  await navigateTo(page, "/assets");
  await page.getByRole("button", { name: "Add Asset" }).click();

  await page.locator("#asset-name").fill(opts.name);
  // Select asset type
  await page.getByRole("button", { name: opts.type, exact: true }).click();

  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.locator("#asset-name")).not.toBeVisible({ timeout: 5000 });
}
