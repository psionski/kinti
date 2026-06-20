import { test, expect } from "@playwright/test";
import { waitForPageReady } from "./helpers";

test.describe.serial("Onboarding wizard", () => {
  test("redirects / to /settings when no timezone", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/settings");
    await waitForPageReady(page);
  });

  test("settings page shows first-setup UI", async ({ page }) => {
    await page.goto("/settings");
    await waitForPageReady(page);
    await expect(page.getByRole("heading", { name: "Timezone" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  });

  test("set timezone, skip remaining steps, finish setup", async ({ page }) => {
    await page.goto("/settings");
    await waitForPageReady(page);

    // Open the timezone picker popover (button shows auto-detected tz)
    await page.getByRole("button", { name: /Europe|America|Asia|Select timezone/ }).click();
    await page.getByPlaceholder("Search timezones...").fill("Amsterdam");
    await page.getByText("Europe/Amsterdam").click();

    // Click Save — saves timezone, reveals base currency section
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.locator("#base-currency")).toBeVisible({ timeout: 5000 });

    // Pick EUR as the base currency
    await page.locator("#base-currency").click();
    await page.getByPlaceholder("Search currencies...").fill("EUR");
    await page.getByTestId("currency-option-EUR").click();

    // Click Save — saves base currency, reveals cash balance section.
    // Two Save buttons are visible at this point (timezone + base currency);
    // base currency is the last one and disappears after save.
    await page.getByRole("button", { name: "Save" }).last().click();
    await expect(page.getByText("Checking Account Balance")).toBeVisible({ timeout: 5000 });

    // Skip through each onboarding section one by one.
    // Order: cash → savings → investments → providers → backups → done.
    // Most sections have "Skip", providers has "Continue" instead.
    // Click whichever advancement button is available until "Finish Setup" appears.
    const finishButton = page.getByRole("button", { name: "Finish Setup" });
    while (!(await finishButton.isVisible({ timeout: 1000 }).catch(() => false))) {
      const skip = page.getByRole("button", { name: "Skip" }).last();
      if (await skip.isVisible({ timeout: 500 }).catch(() => false)) {
        await skip.click();
      } else {
        // Providers section only has "Continue"
        const cont = page.getByRole("button", { name: "Continue" });
        if (await cont.isVisible({ timeout: 500 }).catch(() => false)) {
          await cont.click();
        }
      }
      await page.waitForTimeout(300);
    }

    // Last section (backups): click "Finish Setup" to complete and redirect to /
    await finishButton.click();
    await page.waitForURL("/", { timeout: 10000 });
  });

  test("dashboard loads empty after onboarding", async ({ page }) => {
    await page.goto("/");
    await waitForPageReady(page);
    // Should NOT have sample data bar
    await expect(page.getByRole("button", { name: "Clear sample data" })).not.toBeVisible();
    // Should NOT have tutorial overlay
    await expect(page.getByText("Welcome to Kinti!")).not.toBeVisible();
    // Page should load without errors
    await expect(page.locator('[data-tour="kpi-cards"]')).toBeVisible();
  });
});
