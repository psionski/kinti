import { test, expect } from "@playwright/test";
import { waitForPageReady } from "./helpers";

/**
 * Autocomplete on transaction free-text fields. Self-seeds its precondition
 * (a distinctively-named transaction) so the FTS-backed suggestion endpoint has
 * something to return, then verifies the description dropdown and the tag chips.
 */
test.describe.serial("Autocomplete", () => {
  const DESC = "Autocomplete Groceries";
  const MERCHANT = "Autocomplete Mart";

  test("seed a transaction to source suggestions from", async ({ page }) => {
    await page.goto("/transactions");
    await waitForPageReady(page);

    await page.getByRole("button", { name: "Add Transaction" }).click();
    await page.locator("#tx-amount").fill("9.99");
    await page.locator("#tx-description").fill(DESC);
    await page.locator("#tx-merchant").fill(MERCHANT);
    // Submit (the page trigger button is inert while the dialog is open, so the
    // only "Add Transaction" in the a11y tree is the dialog's submit button).
    await page.getByRole("button", { name: "Add Transaction" }).click();

    await expect(page.locator("#tx-amount")).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator("tr").filter({ hasText: DESC })).toBeVisible();
  });

  test("description field shows most-used values on focus and fills on keyboard select", async ({
    page,
  }) => {
    await page.goto("/transactions");
    await waitForPageReady(page);
    await page.getByRole("button", { name: "Add Transaction" }).click();

    const desc = page.locator("#tx-description");
    // Clicking the empty field must surface most-used values immediately — no
    // typing required (the panel is portaled, so locate options unscoped).
    await desc.click();
    const option = page.locator("[data-testid^='autocomplete-option']").filter({ hasText: DESC });
    await expect(option.first()).toBeVisible({ timeout: 5000 });

    // Typing narrows the same list.
    await desc.pressSequentially("Autocomp", { delay: 20 });
    await expect(option.first()).toBeVisible();

    // Keyboard-select the highlighted suggestion. This must NOT submit the form.
    await desc.press("ArrowDown");
    await desc.press("Enter");

    await expect(desc).toHaveValue(DESC);
    await expect(page.locator("#tx-amount")).toBeVisible(); // dialog still open

    // Discard without saving.
    await page.keyboard.press("Escape");
  });

  test("tags input adds and removes chips", async ({ page }) => {
    await page.goto("/transactions");
    await waitForPageReady(page);
    await page.getByRole("button", { name: "Add Transaction" }).click();

    const tagInput = page.locator("#tx-tags");
    await tagInput.click();
    await tagInput.pressSequentially("holiday", { delay: 20 });
    await tagInput.press("Enter");

    const removeChip = page.getByRole("button", { name: "Remove holiday" });
    await expect(removeChip).toBeVisible();

    await removeChip.click();
    await expect(removeChip).not.toBeVisible();

    await page.keyboard.press("Escape");
  });
});
