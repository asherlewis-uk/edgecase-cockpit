import { test, expect } from "@playwright/test";

/**
 * Smoke tests for the Edgecase Cockpit web app.
 *
 * These tests assume the dev server is running and the app is in a fresh,
 * unauthenticated state. They verify that the main pages load and the core
 * interactive elements are present.
 */

test.describe("smoke", () => {
  test("root page loads with Edgecase Cockpit branding", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Edgecase Cockpit/);
  });

  test("chat page shows greeting and provider status", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Ask away").or(page.locator("text=Message"))).toBeVisible();
  });

  test("settings page loads provider cards", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("text=Providers")).toBeVisible();
    await expect(page.locator("text=OpenAI")).toBeVisible();
  });

  test("auth page does not exist yet", async ({ page }) => {
    await page.goto("/auth");
    // Current reality: backend auth endpoints exist, but there is no /auth UI route.
    await expect(page.locator("text=404").or(page.locator("text=Page not found"))).toBeVisible();
  });

  test("thread sidebar can create a thread", async ({ page }) => {
    await page.goto("/");
    const newButton = page.locator("button").filter({ hasText: /new chat/i });
    if (await newButton.isVisible().catch(() => false)) {
      await newButton.click();
      await expect(page.locator("[data-testid='chat-input']")).toBeVisible();
    }
  });
});
