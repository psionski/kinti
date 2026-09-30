import { test, expect } from "@playwright/test";
import { createCategoryViaUI, createTransactionViaUI, waitForPageReady } from "./helpers";

test.describe.serial("Transactions", () => {
  test("create a category as precondition", async ({ page }) => {
    await page.goto("/");
    await waitForPageReady(page);
    await createCategoryViaUI(page, { name: "Groceries" });
  });

  test("add expense transaction", async ({ page }) => {
    await page.goto("/transactions");
    await waitForPageReady(page);
    await page.getByRole("button", { name: "Add Transaction" }).click();

    await page.locator("#tx-amount").fill("12.50");
    await page.locator("#tx-description").fill("Lunch at cafe");

    await page.getByRole("button", { name: "Add Transaction" }).click();
    await expect(page.locator("#tx-amount")).not.toBeVisible({ timeout: 5000 });
    const expenseRow = page.locator("tr").filter({ hasText: "Lunch at cafe" });
    await expect(expenseRow).toBeVisible();
    await expect(expenseRow).toContainText("12,50");
  });

  test("add income transaction", async ({ page }) => {
    await page.goto("/transactions");
    await waitForPageReady(page);
    await page.getByRole("button", { name: "Add Transaction" }).click();

    await page.getByRole("button", { name: "Income", exact: true }).click();
    await page.locator("#tx-amount").fill("3000");
    await page.locator("#tx-description").fill("Monthly salary");

    await page.getByRole("button", { name: "Add Transaction" }).click();
    await expect(page.locator("#tx-amount")).not.toBeVisible({ timeout: 5000 });
    const incomeRow = page.locator("tr").filter({ hasText: "Monthly salary" });
    await expect(incomeRow).toBeVisible();
    await expect(incomeRow).toContainText("3.000,00");
  });

  test("edit a transaction", async ({ page }) => {
    await page.goto("/transactions");
    await waitForPageReady(page);
    const row = page.locator("tr").filter({ hasText: "Lunch at cafe" });
    await expect(row).toBeVisible();
    await row.getByLabel("Transaction actions").click();
    await page.getByRole("menuitem", { name: "Edit" }).click();

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    await page.locator("#tx-amount").fill("15.00");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });
    const editedRow = page.locator("tr").filter({ hasText: "Lunch at cafe" });
    await expect(editedRow).toContainText("15,00");
  });

  test("add, reopen and filter a refund", async ({ page }) => {
    await page.goto("/");
    await waitForPageReady(page);
    await createTransactionViaUI(page, {
      type: "refund",
      amount: "4.25",
      description: "Bottle deposit returned",
      category: "Groceries",
    });

    // Shown as money back: positive amount and a refund marker.
    const refundRow = page.locator("tr").filter({ hasText: "Bottle deposit returned" });
    await expect(refundRow).toContainText("4,25");
    await expect(refundRow.getByTestId("refund-icon")).toBeVisible();

    // Editing reopens it as a refund with the amount still positive. Opened by clicking the
    // row: a dialog opened from the actions menu and dismissed while the menu is still
    // animating closed leaves Radix's body pointer-events lock behind, which only a test is
    // fast enough to hit.
    await refundRow.getByText("Bottle deposit returned").click();
    await expect(page.getByText("Category of the purchase")).toBeVisible();
    await expect(page.locator("#tx-amount")).toHaveValue("4.25");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });

    // The Refunds filter narrows the list to refunds.
    await page.getByRole("combobox").filter({ hasText: "All types" }).click();
    await page.locator("[role='option']").filter({ hasText: "Refunds" }).click();
    await expect(refundRow).toBeVisible();
    await expect(page.locator("tr").filter({ hasText: "Lunch at cafe" })).not.toBeVisible();
  });

  test("delete a transaction", async ({ page }) => {
    await page.goto("/transactions");
    await waitForPageReady(page);
    const row = page.locator("tr").filter({ hasText: "Monthly salary" });
    await row.getByRole("checkbox").click();

    // Wait for bulk action bar to appear, then click Delete
    await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
    await page.getByRole("button", { name: "Delete" }).click();

    // Confirm in the dialog
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("Monthly salary")).not.toBeVisible({ timeout: 5000 });
  });

  test("filter transactions by category", async ({ page }) => {
    await page.goto("/transactions");
    await waitForPageReady(page);

    // Add a categorized transaction
    await page.getByRole("button", { name: "Add Transaction" }).click();
    await page.locator("#tx-amount").fill("8.50");
    await page.locator("#tx-description").fill("Groceries run");
    await page.getByRole("button", { name: "Add Transaction" }).click();
    await expect(page.locator("#tx-amount")).not.toBeVisible({ timeout: 5000 });

    await expect(page.getByText("Groceries run")).toBeVisible();
  });
});
