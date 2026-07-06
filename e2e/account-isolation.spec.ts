import { test, expect } from "@playwright/test";

/**
 * End-to-end proof that signed-in accounts are isolated on the same browser/device.
 *
 * User A signs up through the UI, saves settings, and creates a local chat.
 * After signing out, User B signs up on the same device and must not see User A's data.
 * User A signs back in and their data is restored.
 *
 * This spec uses unique email addresses per run so it can be replayed against the
 * persistent local dev database without manual cleanup.
 */

const now = Date.now();
const USER_A = {
  email: `e2e-user-a-${now}@example.com`,
  password: "Password123!",
  displayName: `User A ${now}`,
};

const USER_B = {
  email: `e2e-user-b-${now}@example.com`,
  password: "Password123!",
  displayName: `User B ${now}`,
};

async function registerUser(page, user) {
  await page.goto("/auth?mode=register");
  await page.getByLabel("Email").first().fill(user.email);
  await page.getByLabel("Display name").first().fill(user.displayName);
  await page.getByLabel("Password").first().fill(user.password);
  await page.getByRole("button", { name: /Create account/i }).click();
  await page.waitForURL("/settings");
}

async function loginUser(page, user) {
  await page.goto("/auth?mode=signin");
  await page.getByLabel("Email").first().fill(user.email);
  await page.getByLabel("Password").first().fill(user.password);
  await page.getByRole("button", { name: /Sign in/i }).click();
  await page.waitForURL("/settings");
}

async function logoutViaUi(page) {
  await page.goto("/settings");
  await page.getByRole("button", { name: /Log out/i }).click();
  // Logout now returns to the local-only profile, not an ambiguous guest state.
  await expect(page.getByTestId("account-menu-local")).toBeVisible({ timeout: 10_000 });
}

async function completeOnboardingForCurrentUser(page) {
  // If the onboarding modal is visible here, dismiss it via skipOnboarding.
  const close = page.getByTestId("onboarding-close");
  if (await close.isVisible().catch(() => false)) {
    await close.click({ timeout: 2_000 }).catch(() => {});
    await page.waitForTimeout(200);
    return;
  }
  // Otherwise persist onboardingCompleted for the active identity. openMenu()
  // later also dismisses the modal via skipOnboarding if it appears on /.
  const me = await page.evaluate(async () => {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return null;
    return res.json().catch(() => null);
  });
  if (me?.user) {
    await page.evaluate(async () => {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingCompleted: true }),
      });
    });
  } else {
    await page.evaluate(() => {
      const id = localStorage.getItem("cockpit.local-profile.id");
      const key = id ? `cockpit.settings.v2:${id}` : "cockpit.settings.v2:guest";
      const existing = JSON.parse(localStorage.getItem(key) ?? "{}");
      localStorage.setItem(key, JSON.stringify({ ...existing, onboardingCompleted: true }));
    });
  }
}

async function saveDisplayName(page, name) {
  const displayNameInput = page.locator("input#display-name");
  await displayNameInput.fill(name);
  await displayNameInput.press("Tab");
  await page.waitForTimeout(300);
}

async function openMenu(page) {
  await expect(page.getByTestId("account-loading-skeleton")).toHaveCount(0, { timeout: 10_000 });
  const onboardingClose = page.getByTestId("onboarding-close");
  if (await onboardingClose.isVisible().catch(() => false)) {
    await onboardingClose.click({ timeout: 2_000 }).catch(() => {});
    await page.waitForTimeout(200);
  }
  await page.getByRole("button", { name: /Open menu/i }).click();
}

async function createChat(page, message) {
  await page.goto("/");
  await openMenu(page);
  await page.getByRole("button", { name: /New chat/i }).click();
  const input = page.getByTestId("chat-input");
  await input.fill(message);
  await input.press("Enter");
  await page.waitForTimeout(500);
}

// Superseded by e2e/account-separation.spec.ts (canonical 17-step account-separation flow).
// Retained only as legacy coverage/reference. The legacy flow assumed the old
// guest-bucket model: direct registration from /auth, account-menu-guest after
// logout, and a second registration with no DataMigrationDialog. Under the
// reconstruction, logout returns to the local-only profile and registering from
// local-only mode presents the DataMigrationDialog this spec does not drive.
test.describe.skip("account isolation (superseded by account-separation.spec.ts)", () => {
  test.setTimeout(180_000);
  test("User A and User B do not share settings, chats, or provider state on the same device", async ({
    page,
  }) => {
    // Clear any stale cookies from a prior local run.
    await page.context().clearCookies();

    await registerUser(page, USER_A);
    await expect(page.getByTestId("account-menu-signed-in")).toBeVisible();
    await expect(page.getByTestId("account-menu-email")).toHaveText(USER_A.email);
    await completeOnboardingForCurrentUser(page);

    await saveDisplayName(page, USER_A.displayName);
    await expect(page.locator("input#display-name")).toHaveValue(USER_A.displayName);

    await createChat(page, `Hello from ${USER_A.displayName}`);

    await page.goto("/");
    await openMenu(page);
    await expect(page.getByText(/No chats yet/i)).not.toBeVisible();

    // Return to settings and sign out through the UI so the browser session is cleared.
    await page.goto("/settings");
    await logoutViaUi(page);
    await completeOnboardingForCurrentUser(page);

    // Verify the server-side session was actually cleared by reloading.
    await page.goto("/settings");
    await expect(page.getByTestId("account-menu-local")).toBeVisible();

    await registerUser(page, USER_B);
    await expect(page.getByTestId("account-menu-signed-in")).toBeVisible();
    await expect(page.getByTestId("account-menu-email")).toHaveText(USER_B.email);
    await completeOnboardingForCurrentUser(page);

    await expect(page.locator("input#display-name")).not.toHaveValue(USER_A.displayName);

    await page.goto("/");
    await openMenu(page);
    await expect(page.getByText(USER_A.displayName)).not.toBeVisible();
    await expect(page.getByText(/No chats yet/i)).toBeVisible();

    await page.goto("/settings");
    const openaiStatus = page.getByTestId("provider-status-openai");
    await expect(openaiStatus).toHaveText(/Needs API key/i);
    await expect(page.locator('[data-testid="provider-auth-prompt"]:visible')).toHaveCount(0);

    await saveDisplayName(page, USER_B.displayName);
    await expect(page.locator("input#display-name")).toHaveValue(USER_B.displayName);

    await logoutViaUi(page);
    await completeOnboardingForCurrentUser(page);

    await loginUser(page, USER_A);
    await expect(page.getByTestId("account-menu-signed-in")).toBeVisible();
    await expect(page.getByTestId("account-menu-email")).toHaveText(USER_A.email);
    await completeOnboardingForCurrentUser(page);

    await expect(page.locator("input#display-name")).toHaveValue(USER_A.displayName);
    await expect(page.locator("input#display-name")).not.toHaveValue(USER_B.displayName);

    await page.goto("/");
    await openMenu(page);
    await expect(page.getByText(/No chats yet/i)).not.toBeVisible();
    await expect(
      page.getByRole("button", {
        name: `Hello from ${USER_A.displayName}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: `Hello from ${USER_B.displayName}`,
        exact: true,
      }),
    ).toHaveCount(0);
  });
});
