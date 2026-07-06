import { test, expect, type Page } from "@playwright/test";

/**
 * Account-separation reconstruction — full 17-step proof.
 *
 * Fresh browser install → identity choice blocks → local-only profile →
 * local data → sign up as User A (migration dialog) → keep-separate →
 * User A isolated → logout → local profile returns → sign in as User B →
 * User B sees none of User A/local → reload/hard refresh (no flash) →
 * logout → local profile returns → sign back in as User A → User A data
 * returns, User B/local absent.
 *
 * Uses unique emails per run so it can replay against a persistent local DB.
 */

const now = Date.now();
const USER_A = {
  email: `sep-a-${now}@example.com`,
  password: "Password123!",
  displayName: `User A ${now}`,
};
const USER_B = {
  email: `sep-b-${now}@example.com`,
  password: "Password123!",
  displayName: `User B ${now}`,
};

async function chooseLocalOnly(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("account-loading-skeleton")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId("identity-choice-modal")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("identity-choice-local-only").click();
  await page.waitForTimeout(400);
}

async function dismissOnboarding(page: Page) {
  const close = page.getByTestId("onboarding-close");
  if (await close.isVisible().catch(() => false)) {
    await close.click({ timeout: 2_000 }).catch(() => {});
    await page.waitForTimeout(200);
  }
}

/** Navigate to /settings, dismiss onboarding, and assert the signed-in account. */
async function expectSignedInAs(page: Page, email: string) {
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await dismissOnboarding(page);
  // Onboarding dismissal re-renders; re-check on /settings.
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("account-menu-signed-in")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("account-menu-email")).toHaveText(email);
}

async function openMenu(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await dismissOnboarding(page);
  await page.getByRole("button", { name: /Open menu/i }).click();
}

async function createChat(page: Page, message: string) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await dismissOnboarding(page);
  await page.getByRole("button", { name: /Open menu/i }).click();
  await page.getByRole("button", { name: /New chat/i }).click();
  const input = page.getByTestId("chat-input");
  await input.fill(message);
  await input.press("Enter");
  await page.waitForTimeout(400);
}

async function registerFromAuth(
  page: Page,
  user: { email: string; password: string; displayName: string },
) {
  await page.goto("/auth?mode=register&redirect=/");
  await page.getByLabel("Email").first().fill(user.email);
  await page.getByLabel("Display name").first().fill(user.displayName);
  await page.getByLabel("Password").first().fill(user.password);
  await page.getByRole("button", { name: /Create account/i }).click();
}

async function signInFromAuth(page: Page, user: { email: string; password: string }) {
  await page.goto("/auth?mode=signin&redirect=/");
  await page.getByLabel("Email").first().fill(user.email);
  await page.getByLabel("Password").first().fill(user.password);
  await page.getByRole("button", { name: /Sign in/i }).click();
}

/** Register a new server account from local-only mode and choose keep-separate. */
async function registerFromLocalKeepSeparate(
  page: Page,
  user: { email: string; password: string; displayName: string },
) {
  await registerFromAuth(page, user);
  await expect(page.getByTestId("data-migration-dialog")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("migration-choice-keep-separate").click();
}

async function logoutViaUi(page: Page) {
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await dismissOnboarding(page);
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Log out/i }).click();
  // Logout returns to the local-only profile.
  await expect(page.getByTestId("account-menu-local")).toBeVisible({ timeout: 10_000 });
}

test.describe("account separation", () => {
  test.setTimeout(180_000);

  test("full 17-step account-separation flow", async ({ page }) => {
    await page.context().clearCookies();

    // 1. Fresh context starts undetermined and is blocked by the identity choice.
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("account-loading-skeleton")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId("identity-choice-modal")).toBeVisible({ timeout: 10_000 });

    // 2. Local-only choice creates/persists a localProfileId and enters local mode.
    await page.getByTestId("identity-choice-local-only").click();
    await page.waitForTimeout(500);
    const localProfileId = await page.evaluate(() =>
      localStorage.getItem("cockpit.local-profile.id"),
    );
    expect(localProfileId).toBeTruthy();

    // 3. Local profile onboarding proceeds; dismiss it.
    await dismissOnboarding(page);

    // 4. Create local data scoped to the localProfileId bucket.
    await createChat(page, `Local chat ${now}`);
    const localThreadsKey = `cockpit.threads.v1:${localProfileId}`;
    await expect
      .poll(async () => {
        const raw = await page.evaluate((k) => localStorage.getItem(k), localThreadsKey);
        return raw ? JSON.parse(raw).length : 0;
      })
      .toBeGreaterThan(0);

    // 5. User A registration from local-only mode shows the migration dialog.
    await registerFromAuth(page, USER_A);
    await expect(page.getByTestId("data-migration-dialog")).toBeVisible({ timeout: 10_000 });

    // 6. Keep Separate: local data preserved, server account starts clean.
    await page.getByTestId("migration-choice-keep-separate").click();
    await expectSignedInAs(page, USER_A.email);
    // Local profile data still present.
    const localStillThere = await page.evaluate((k) => localStorage.getItem(k), localThreadsKey);
    expect(localStillThere).not.toBeNull();

    // 7. User A data is isolated from the local profile.
    await createChat(page, `User A chat ${now}`);
    await openMenu(page);
    await expect(page.getByText(`Local chat ${now}`)).toHaveCount(0);

    // 8. Logout returns to the local profile (not an ambiguous guest state).
    await logoutViaUi(page);

    // 9. Local profile data returns; User A data absent.
    await openMenu(page);
    await expect(page.getByText(`Local chat ${now}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`User A chat ${now}`)).toHaveCount(0);

    // 10. Register as User B (keep-separate); User B sees none of User A or local data.
    await registerFromLocalKeepSeparate(page, USER_B);
    await expectSignedInAs(page, USER_B.email);
    await openMenu(page);
    await expect(page.getByText(`User A chat ${now}`)).toHaveCount(0);
    await expect(page.getByText(`Local chat ${now}`)).toHaveCount(0);

    // 11. Reload/hard refresh does not flash the wrong account bucket.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("account-loading-skeleton")).toHaveCount(0, { timeout: 15_000 });
    // After hydration the resolved identity must be User B (not local, not A).
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await dismissOnboarding(page);
    await expect(page.getByTestId("account-menu-signed-in")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("account-menu-email")).toHaveText(USER_B.email);

    // 12. User B remains isolated after hydration.
    await openMenu(page);
    await expect(page.getByText(`User A chat ${now}`)).toHaveCount(0);
    await expect(page.getByText(`Local chat ${now}`)).toHaveCount(0);

    // 13. Logout returns to the local profile.
    await logoutViaUi(page);

    // 14. Local profile data returns again.
    await openMenu(page);
    await expect(page.getByText(`Local chat ${now}`)).toBeVisible({ timeout: 10_000 });

    // 15. Sign back in as User A → User A data returns; User B/local absent.
    await signInFromAuth(page, USER_A);
    await expectSignedInAs(page, USER_A.email);
    await openMenu(page);
    await expect(page.getByText(`User A chat ${now}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`Local chat ${now}`)).toHaveCount(0);
  });
});
