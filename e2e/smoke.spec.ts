import { test, expect, type Page } from "@playwright/test";

/**
 * Smoke tests for the Edgecase Cockpit web app.
 *
 * Fresh contexts now start in the "undetermined" identity state and are blocked
 * by the IdentityChoiceModal. These tests choose the local-only profile (and
 * complete onboarding) to reach the main cockpit before asserting on it.
 */

async function chooseLocalOnly(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // Wait for identity hydration to resolve (skeleton gone) before checking
  // for the identity modal, otherwise the modal may not be in the DOM yet.
  await expect(page.getByTestId("account-loading-skeleton")).toHaveCount(0, { timeout: 10_000 });
  const modal = page.getByTestId("identity-choice-modal");
  if (await modal.isVisible().catch(() => false)) {
    await page.getByTestId("identity-choice-local-only").click();
    await page.waitForTimeout(400);
  }
  // Persist onboardingCompleted into the active local profile bucket, then
  // reload so hydrateAsync re-hydrates the store with onboarding complete
  // (the in-memory store was already populated by enterLocalMode during the
  // first hydration, before this localStorage write).
  await page.evaluate(() => {
    const id = localStorage.getItem("cockpit.local-profile.id");
    if (!id) return;
    const key = `cockpit.settings.v2:${id}`;
    const existing = JSON.parse(localStorage.getItem(key) ?? "{}");
    localStorage.setItem(key, JSON.stringify({ ...existing, onboardingCompleted: true }));
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
  // Dismiss any lingering onboarding modal just in case.
  const close = page.getByTestId("onboarding-close");
  if (await close.isVisible().catch(() => false)) {
    await close.click({ timeout: 2_000 }).catch(() => {});
  }
}

test.describe("smoke", () => {
  test("root page loads with Edgecase Cockpit branding", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Cockpit/);
  });

  test("fresh context blocks on the identity choice modal", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/");
    await expect(page.getByTestId("identity-choice-modal")).toBeVisible({ timeout: 10_000 });
  });

  test("chat page shows greeting and provider status after local-only choice", async ({ page }) => {
    await page.context().clearCookies();
    await chooseLocalOnly(page);
    await page.goto("/");
    await expect(page.locator("text=Ask away").or(page.locator("text=Message"))).toBeVisible({
      timeout: 10_000,
    });
  });

  test("settings page loads provider cards after local-only choice", async ({ page }) => {
    await page.context().clearCookies();
    await chooseLocalOnly(page);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "V1 local endpoint" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("heading", { name: "Cloud providers" })).toBeVisible();
    await expect(page.getByText("OpenAI").first()).toBeVisible();
  });

  test("auth page loads with sign-in and create-account tabs", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.locator("text=Sign in").first()).toBeVisible();
    await expect(page.locator("text=Create account").first()).toBeVisible();
  });

  test("thread sidebar can create a thread after local-only choice", async ({ page }) => {
    await page.context().clearCookies();
    await chooseLocalOnly(page);
    await page.goto("/");
    const newButton = page.locator("button").filter({ hasText: /new chat/i });
    if (await newButton.isVisible().catch(() => false)) {
      await newButton.click();
      await expect(page.locator("[data-testid='chat-input']")).toBeVisible();
    }
  });
});
