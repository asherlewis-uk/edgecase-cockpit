import { test, expect } from "@playwright/test";

const runtime = process.env.E2E_RUNTIME ?? "dev";

test.describe("logout session invalidation", () => {
  test("logout persists across navigation and refresh", async ({ page, context }) => {
    const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const user = {
      email: `logout-test-${runtime}-${runId}@example.com`,
      password: "Password123!",
      displayName: `Logout Test ${runId}`,
    };

    // 1. Register a new account and land on /settings signed in.
    await page.goto("/auth?mode=register&redirect=/settings");
    await page.getByLabel(/email/i).fill(user.email);
    await page.getByLabel(/display name/i).fill(user.displayName);
    await page.getByLabel(/^password$/i).fill(user.password);
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForURL("/settings", { timeout: 15_000 });
    await expect(page.getByTestId("account-menu-signed-in")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("account-menu-email")).toHaveText(user.email);

    // 2. Log out and confirm the UI flips to guest immediately.
    await page.getByRole("button", { name: /log out/i }).click();
    await expect(page.getByTestId("account-menu-guest")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("account-menu-signed-in")).not.toBeVisible();

    // 3. The server-side session must be unauthenticated.
    const me = await context.request.get("/api/auth/me");
    expect(me.status()).toBe(401);

    // 4. Direct /settings navigation after logout remains guest.
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("account-menu-guest")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("account-menu-signed-in")).not.toBeVisible();
    await expect(page.getByText(user.email)).not.toBeVisible();

    // 5. Hard refresh after logout still remains guest.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("account-menu-guest")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("account-menu-signed-in")).not.toBeVisible();
    await expect(page.getByText(user.email)).not.toBeVisible();
  });
});
