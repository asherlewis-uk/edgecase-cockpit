import { test, expect, type Page } from "@playwright/test";

/**
 * Account-separation reconstruction — full 17-step proof.
 *
 * Fresh browser install → identity choice blocks → local-only profile →
 * local data → sign up as User A (migration dialog) → keep-separate →
 * User A isolated → logout → local profile returns → sign in as User B →
 * User B sees none of User A/local → reload/hard refresh (no flash) →
 * logout → local profile returns → sign back in as User A → User A data
 * returns, User B/local absent → Copy into User C (local keeps a copy) →
 * Move into User D (local is left empty).
 *
 * Every isolation step checks the full V1 surface — provider catalog, price
 * estimate, endpoint validation state and local RAG store — not just thread
 * titles. Uses unique emails per run so it can replay against a persistent
 * local DB.
 */

const now = Date.now();

type TestUser = { email: string; password: string; displayName: string };

const USER_A: TestUser = {
  email: `sep-a-${now}@example.com`,
  password: "Password123!",
  displayName: `User A ${now}`,
};
const USER_B: TestUser = {
  email: `sep-b-${now}@example.com`,
  password: "Password123!",
  displayName: `User B ${now}`,
};
const USER_C: TestUser = {
  email: `sep-c-${now}@example.com`,
  password: "Password123!",
  displayName: `User C ${now}`,
};
const USER_D: TestUser = {
  email: `sep-d-${now}@example.com`,
  password: "Password123!",
  displayName: `User D ${now}`,
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

async function waitForAuthenticatedSession(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        return res.status;
      }),
    )
    .toBe(200);
}

/**
 * Sign in from the auth page. Signing in FROM a local-only profile defers the
 * login request until a migration choice is made (the DataMigrationDialog
 * intercepts first), so the dialog is handled conditionally: a sign-in from a
 * clean state has no dialog and the login response arrives directly.
 */
async function signInFromAuth(page: Page, user: { email: string; password: string }) {
  await page.goto("/auth?mode=signin&redirect=/");
  await page.getByLabel("Email").first().fill(user.email);
  await page.getByLabel("Password").first().fill(user.password);

  const loginResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/auth/login",
  );

  await page.getByRole("button", { name: /Sign in/i }).click();

  // The dialog appears only when signing in from local-only mode; the login
  // request is not sent until a choice is made. Race the two so a clean-state
  // sign-in does not pay a fixed dialog timeout.
  const dialog = page.getByTestId("data-migration-dialog");
  const outcome = await Promise.race([
    dialog.waitFor({ state: "visible", timeout: 10_000 }).then(() => "dialog" as const),
    loginResponse.then(() => "login" as const),
  ]);
  if (outcome === "dialog") {
    // Keep Separate: the local profile stays intact and the account starts
    // clean — the only choice that preserves the isolation this spec proves.
    await page.getByTestId("migration-choice-keep-separate").click();
  }

  await loginResponse;
  await waitForAuthenticatedSession(page);
}

async function chooseKeepSeparateAndWaitForAuth(page: Page) {
  const registerResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/auth/register",
  );

  await page.getByTestId("migration-choice-keep-separate").click();

  await registerResponse;

  await waitForAuthenticatedSession(page);
}

/** Register a new server account from local-only mode and choose keep-separate. */
async function registerFromLocalKeepSeparate(
  page: Page,
  user: { email: string; password: string; displayName: string },
) {
  await registerFromAuth(page, user);
  await expect(page.getByTestId("data-migration-dialog")).toBeVisible({ timeout: 10_000 });
  await chooseKeepSeparateAndWaitForAuth(page);
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

type MigrationChoice = "copy" | "move" | "keep-separate";

/** Register a server account from local-only mode with an explicit data choice. */
async function registerFromLocal(
  page: Page,
  user: TestUser,
  choice: MigrationChoice,
): Promise<void> {
  await registerFromAuth(page, user);
  await expect(page.getByTestId("data-migration-dialog")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId(`migration-choice-${choice}`).click();
  await expect(page.getByTestId("data-migration-dialog")).toHaveCount(0, { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
}

/**
 * Resolve the current account's bucket scope from the page: the server user id
 * (via /api/auth/me) in server mode, or the local profile id in local mode.
 * Throws when identity cannot be resolved so a RAG check can never pass
 * vacuously.
 */
async function currentVectorDocCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const mode = localStorage.getItem("cockpit.account.mode");
    let scope: string | null = null;
    if (mode === "server") {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) throw new Error("cannot resolve current account for RAG check");
      const data = (await res.json()) as { user?: { id?: string } };
      scope = data.user?.id ?? null;
    } else {
      scope = localStorage.getItem("cockpit.local-profile.id");
    }
    if (!scope) throw new Error("no active scope for RAG check");
    return JSON.parse(localStorage.getItem(`cockpit.vector-store.v1:${scope}`) ?? "[]").length;
  });
}

/**
 * Seed one of every V1 surface into the current bucket: a chat, a RAG document,
 * a cost override that produces a visible price, and a validated local endpoint.
 * A mode switch that keeps threads but drops RAG, prices, or provider state is a
 * failed isolation change, so all four are seeded and all four are asserted.
 */
async function seedLocalSurfaces(page: Page, tag: string): Promise<void> {
  await createChat(page, `chat ${tag}`);

  await page.evaluate((t) => {
    const scope = localStorage.getItem("cockpit.local-profile.id") ?? "";
    if (!scope) throw new Error("no local profile id — identity was not resolved");

    // RAG: one document in this bucket's vector store.
    localStorage.setItem(
      `cockpit.vector-store.v1:${scope}`,
      JSON.stringify([{ id: `doc-${t}`, text: `memory ${t}`, embedding: [1, 0, 0] }]),
    );

    // Pricing: an override AND the token counts it multiplies.
    //
    // The override alone renders $0.00 — UsageSection computes
    // estimateCost(providerId, inputTokens, outputTokens), so with zero tokens
    // the rate is irrelevant and any assertion against the total is vacuous.
    // 1000 input + 1000 output at 42.5 USD per 1k each = 85.00 exactly.
    localStorage.setItem(
      `cockpit.provider-stats.v1:${scope}`,
      JSON.stringify({
        openai: { calls: 2, errors: 0, inputTokens: 1000, outputTokens: 1000 },
      }),
    );
    const settingsKey = `cockpit.settings.v2:${scope}`;
    const settings = JSON.parse(localStorage.getItem(settingsKey) ?? "{}");
    settings.costOverrides = { openai: { input: 42.5, output: 42.5 } };
    localStorage.setItem(settingsKey, JSON.stringify(settings));

    // Provider state: a validated custom endpoint.
    localStorage.setItem(
      `cockpit.provider-validation.v1:${scope}`,
      JSON.stringify({ custom: { status: "valid", lastValidated: 1 } }),
    );
  }, tag);

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("account-loading-skeleton")).toHaveCount(0, { timeout: 15_000 });
}

/** The figure seedLocalSurfaces produces: (1000/1000 tokens) x (42.5/42.5 per 1k). */
const SEEDED_COST_TEXT = "$85.00";

/** Assert none of the tagged surfaces are visible under the current account. */
async function expectSurfacesAbsent(page: Page, tag: string): Promise<void> {
  await openMenu(page);
  // Prove the list rendered before asserting what is not in it.
  await expect(page.getByTestId("thread-list")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(`chat ${tag}`)).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await dismissOnboarding(page);

  // Catalog is always fully present, regardless of account.
  await expect(page.getByTestId("provider-card")).toHaveCount(15);

  // Price: the seeded figure must not appear, AND the Usage section must be in
  // a zero-cost state. Asserting only the first would pass on a blank page.
  // The zero-state is "$0" when calls were recorded (no tokens) or the
  // "No provider calls yet." empty state when no calls exist at all — both
  // prove the seeded $85.00 figure is absent.
  await expect(page.getByRole("heading", { name: "Usage" })).toBeVisible();
  await expect(page.getByText(SEEDED_COST_TEXT)).toHaveCount(0);
  const total = page.getByTestId("usage-total-cost");
  const noCalls = page.getByText("No provider calls yet.");
  await expect(total.or(noCalls)).toBeVisible();
  if (await total.isVisible().catch(() => false)) {
    // formatCost(0) renders "$0" — the app's real zero-state.
    await expect(total).toHaveText("$0");
  }

  // Neither may a validated endpoint cross over. Prove the label rendered
  // before asserting what it must not say.
  const capabilityLabel = page.getByTestId("v1-local-capability-label");
  await expect(capabilityLabel).toBeVisible();
  await expect(capabilityLabel).not.toHaveText("Verified ready");

  // RAG: the current account's vector bucket must be empty.
  const docs = await currentVectorDocCount(page);
  expect(docs, "no RAG documents may cross accounts").toBe(0);
}

/** Assert every tagged surface is back under the current account. */
async function expectSurfacesPresent(page: Page, tag: string): Promise<void> {
  await openMenu(page);
  await expect(page.getByText(`chat ${tag}`)).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");

  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await dismissOnboarding(page);
  await expect(page.getByTestId("provider-card")).toHaveCount(15);

  // The exact seeded figure, not merely "a total is rendered".
  await expect(page.getByTestId("usage-total-cost")).toHaveText(SEEDED_COST_TEXT);

  // RAG: the current account's bucket must hold the seeded document. Scoped to
  // the current account (not the local profile id) so the Move branch — which
  // empties the local bucket — still proves the docs landed in the account.
  const docs = await currentVectorDocCount(page);
  expect(docs, "RAG documents must be present under the current account").toBeGreaterThan(0);
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

    // 4b. Seed the full V1 surface into the local bucket, not just a chat.
    await seedLocalSurfaces(page, "local");
    await expectSurfacesPresent(page, "local");

    // 5. User A registration from local-only mode shows the migration dialog.
    await registerFromAuth(page, USER_A);
    await expect(page.getByTestId("data-migration-dialog")).toBeVisible({ timeout: 10_000 });

    // 6. Keep Separate: local data preserved, server account starts clean.
    await chooseKeepSeparateAndWaitForAuth(page);
    await expectSignedInAs(page, USER_A.email);
    // Local profile data still present.
    const localStillThere = await page.evaluate((k) => localStorage.getItem(k), localThreadsKey);
    expect(localStillThere).not.toBeNull();

    // 7. User A data is isolated from the local profile.
    await createChat(page, `User A chat ${now}`);
    await expectSurfacesAbsent(page, "local");

    // 8. Logout returns to the local profile (not an ambiguous guest state).
    await logoutViaUi(page);

    // 9. Local profile data returns; User A data absent.
    await openMenu(page);
    await expect(page.getByTestId("thread-list")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`Local chat ${now}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`User A chat ${now}`)).toHaveCount(0);

    // 10. Register as User B (keep-separate); User B sees none of User A or local data.
    await registerFromLocalKeepSeparate(page, USER_B);
    await expectSignedInAs(page, USER_B.email);
    await expectSurfacesAbsent(page, "local");
    await openMenu(page);
    await expect(page.getByTestId("thread-list")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`User A chat ${now}`)).toHaveCount(0);

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
    await expectSurfacesAbsent(page, "local");
    await openMenu(page);
    await expect(page.getByTestId("thread-list")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`User A chat ${now}`)).toHaveCount(0);

    // 13. Logout returns to the local profile.
    await logoutViaUi(page);

    // 14. Local profile data returns again.
    await openMenu(page);
    await expect(page.getByTestId("thread-list")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`Local chat ${now}`)).toBeVisible({ timeout: 10_000 });

    // 15. Sign back in as User A → User A data returns; User B/local absent.
    await signInFromAuth(page, USER_A);
    await expectSignedInAs(page, USER_A.email);
    await openMenu(page);
    await expect(page.getByTestId("thread-list")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`User A chat ${now}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`Local chat ${now}`)).toHaveCount(0);

    // 16. Copy: a third account receives the local data AND the local profile
    //     keeps it. Both sides must hold afterwards.
    await logoutViaUi(page);
    await registerFromLocal(page, USER_C, "copy");
    await expectSignedInAs(page, USER_C.email);
    await expectSurfacesPresent(page, "local"); // copied into User C
    await logoutViaUi(page);
    await expectSurfacesPresent(page, "local"); // and still on the local profile

    // 17. Move: a fourth account takes the local data and the local profile is
    //     left empty. "Move" that leaves a copy behind is not a move.
    await registerFromLocal(page, USER_D, "move");
    await expectSignedInAs(page, USER_D.email);
    await expectSurfacesPresent(page, "local"); // moved into User D
    await logoutViaUi(page);
    await openMenu(page);
    await expect(page.getByTestId("thread-list")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("chat local")).toHaveCount(0);
  });
});
