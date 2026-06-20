import { test, expect } from "@playwright/test";
import { waitForPageReady } from "./helpers";

test.describe.serial("Seed data & interactive tour", () => {
  test("dashboard loads with sample data", async ({ page }) => {
    await page.goto("/");
    await waitForPageReady(page);
    // KPI cards should have content (seeded data)
    await expect(page.locator('[data-tour="kpi-cards"]')).toBeVisible();
  });

  test("tutorial auto-starts after page load", async ({ page }) => {
    await page.goto("/");
    await waitForPageReady(page);
    // Joyride overlay should appear within a reasonable time (500ms delay + render)
    await expect(page.getByText("Welcome to Kinti!")).toBeVisible({ timeout: 5000 });
  });

  test("tutorial can navigate and be skipped", async ({ page }) => {
    await page.goto("/");
    await waitForPageReady(page);
    // Wait for the tour to start
    await expect(page.getByText("Welcome to Kinti!")).toBeVisible({ timeout: 5000 });

    // Click Next through a few steps (use testid to avoid conflict with Next.js Dev Tools button)
    await page.getByTestId("button-primary").click();
    // Should show "At a Glance" step (KPI cards)
    await expect(page.getByText("At a Glance")).toBeVisible({ timeout: 5000 });

    await page.getByTestId("button-primary").click();
    // Should show "Spending Charts" step
    await expect(page.getByText("Spending Charts")).toBeVisible({ timeout: 5000 });

    // Close the tour via the close button (X) — ends the tour completely
    // Wait for the PUT that persists tutorial=false to complete before this test ends,
    // otherwise the next test may load the page before the setting is saved.
    const settingsSaved = page.waitForResponse(
      (resp) => resp.url().includes("/api/settings/tutorial") && resp.request().method() === "PUT"
    );
    await page.getByTestId("button-close").click();
    await settingsSaved;

    // Tour should disappear — the overlay/tooltip should be gone
    await expect(page.getByText("Welcome to Kinti!")).not.toBeVisible({ timeout: 5000 });
    // Should be back on dashboard
    await expect(page).toHaveURL("/");
  });

  test("sample data bar shows after tour completes", async ({ page }) => {
    await page.goto("/");
    await waitForPageReady(page);
    // Tour was completed in previous test (tutorial setting set to false),
    // so bar should be visible immediately (initiallyHidden=false)
    await expect(page.getByText("You're viewing")).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear sample data" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear sample data" })).toBeEnabled();
  });

  test("clear sample data deletes DB and redirects to /settings", async ({ page }) => {
    await page.goto("/");
    await waitForPageReady(page);

    // Dismiss the tutorial first (it may have restarted since this is a new page instance,
    // but tutorial setting was updated to false in previous test — check if it shows)
    const skipButton = page.getByRole("button", { name: "Skip tour" });
    if (await skipButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipButton.click();
    }

    // Accept the native confirm dialog
    page.on("dialog", (dialog) => dialog.accept());

    // Click clear sample data
    await page.getByRole("button", { name: "Clear sample data" }).click();

    // Should redirect to /settings after DB is cleared and page refreshes
    await page.waitForURL("**/settings", { timeout: 15000 });

    // Verify we're on the first-setup page (no timezone configured)
    await expect(page.getByRole("heading", { name: "Timezone" })).toBeVisible();
  });
});
