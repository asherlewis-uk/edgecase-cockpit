import {
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

type RuntimeName = "dev" | "preview" | "deployed" | string;

type AuditEvent = {
  at: string;
  type: string;
  message?: string;
  method?: string;
  url?: string;
  status?: number;
  statusText?: string;
  failure?: string;
};

type ElementSummary = {
  text: string;
  ariaLabel: string | null;
  disabled: boolean;
  href?: string;
  placeholder?: string;
  type?: string;
  valueLength?: number;
};

type StorageSnapshot = {
  localStorage: Record<string, unknown>;
  sessionStorage: Record<string, unknown>;
  cookies: Array<{
    name: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: string;
    valueLength: number;
  }>;
};

type Snapshot = StorageSnapshot & {
  name: string;
  at: string;
  url: string;
  title: string;
  screenshot: string;
  visibleText: string;
  buttons: ElementSummary[];
  links: ElementSummary[];
  inputs: ElementSummary[];
  identity: {
    appearsGuest: boolean;
    appearsSignedIn: boolean;
    accountEmail: string | null;
    accountText: string | null;
  };
};

type AuditReport = {
  runtime: RuntimeName;
  baseURL: string;
  viewport: string;
  startedAt: string;
  finishedAt?: string;
  actions: string[];
  snapshots: Snapshot[];
  consoleErrors: AuditEvent[];
  failedRequests: AuditEvent[];
  httpErrors: AuditEvent[];
  missingFlows: string[];
  notes: string[];
};

const runtime = process.env.E2E_RUNTIME ?? "dev";
const baseURL = process.env.E2E_BASE_URL ?? "";
const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const viewports = [
  { name: "desktop", width: 1440, height: 960 },
  { name: "mobile", width: 390, height: 844 },
];

test.setTimeout(240_000);

for (const viewport of viewports) {
  test(`runtime audit observes onboarding/auth/provider setup (${runtime}, ${viewport.name})`, async ({
    page,
    context,
  }, testInfo) => {
    const report: AuditReport = {
      runtime,
      baseURL: testInfo.project.use.baseURL ?? baseURL,
      viewport: viewport.name,
      startedAt: new Date().toISOString(),
      actions: [],
      snapshots: [],
      consoleErrors: [],
      failedRequests: [],
      httpErrors: [],
      missingFlows: [],
      notes: [],
    };
    const artifactDir = path.join(
      process.cwd(),
      "test-results",
      "runtime-audit",
      runtime,
      viewport.name,
    );
    await fs.mkdir(artifactDir, { recursive: true });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        report.consoleErrors.push({
          at: new Date().toISOString(),
          type: "console-error",
          message: msg.text(),
        });
      }
    });
    page.on("requestfailed", (request) => {
      report.failedRequests.push({
        at: new Date().toISOString(),
        type: "requestfailed",
        method: request.method(),
        url: scrubUrl(request.url()),
        failure: request.failure()?.errorText,
      });
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        report.httpErrors.push({
          at: new Date().toISOString(),
          type: "http-error",
          method: response.request().method(),
          url: scrubUrl(response.url()),
          status: response.status(),
          statusText: response.statusText(),
        });
      }
    });

    const tracePath = path.join(artifactDir, "trace.zip");
    await context.clearCookies();
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

    try {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await runRuntimeAudit(page, context, report, artifactDir);
    } finally {
      report.finishedAt = new Date().toISOString();
      const summaryPath = path.join(artifactDir, "summary.json");
      await writeAuditReport(summaryPath, report);
      await context.tracing.stop({ path: tracePath }).catch((error) => {
        report.notes.push(
          `Trace stop failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      await writeAuditReport(summaryPath, report);
      await testInfo.attach(`runtime-audit-${runtime}-${viewport.name}`, {
        path: summaryPath,
        contentType: "application/json",
      });
      await testInfo.attach(`runtime-audit-trace-${runtime}-${viewport.name}`, {
        path: tracePath,
        contentType: "application/zip",
      });
    }
  });
}

async function runRuntimeAudit(
  page: Page,
  context: BrowserContext,
  report: AuditReport,
  artifactDir: string,
) {
  const user = {
    email: `runtime-audit-${runtime}-${runId}-${report.viewport}@example.com`,
    password: "Password123!",
    displayName: `Runtime ${report.viewport} ${runId}`,
  };

  await gotoAndSettle(page, "/");
  await snapshot(page, context, report, artifactDir, "01-fresh-first-launch");

  const getStarted = await clickButton(page, [/^get started$/i]);
  if (getStarted.clicked) {
    report.actions.push("Clicked onboarding Get Started.");
    await settle(page);
    await snapshot(page, context, report, artifactDir, "02-onboarding-provider-choice");
    const selectedProvider = await clickButton(page, [/^openai$/i, /openai/i]);
    if (selectedProvider.clicked) {
      report.actions.push(`Clicked provider control: ${selectedProvider.label}.`);
      await settle(page);
      await snapshot(page, context, report, artifactDir, "03-onboarding-provider-setup");
    } else {
      report.missingFlows.push("Provider choice control not present in onboarding runtime.");
    }
    const openedSettings = await clickButton(page, [/open settings/i, /go to settings/i]);
    if (openedSettings.clicked) {
      report.actions.push(`Clicked onboarding settings control: ${openedSettings.label}.`);
      await settle(page);
    } else {
      report.missingFlows.push("Onboarding settings transition control not present in runtime.");
      await gotoAndSettle(page, "/settings");
    }
  } else {
    const skipped = await clickButton(page, [/skip for now/i, /^close$/i]);
    if (skipped.clicked) {
      report.actions.push(`Clicked guest onboarding control: ${skipped.label}.`);
      await settle(page);
    } else {
      report.missingFlows.push("Onboarding guest entry control not present in runtime.");
    }
    await gotoAndSettle(page, "/settings");
  }

  await snapshot(page, context, report, artifactDir, "04-settings-as-guest");
  await editDisplayNameIfAvailable(page, `Guest ${report.viewport} ${runId}`, report);
  await snapshot(page, context, report, artifactDir, "05-guest-settings-edited");

  await createLocalThreadIfAvailable(page, context, report, artifactDir);

  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
  await settle(page);
  await snapshot(page, context, report, artifactDir, "07-refresh-as-guest");

  await gotoAndSettle(page, "/settings");
  await exerciseProviderSetup(page, report, "guest");
  await snapshot(page, context, report, artifactDir, "08-provider-setup-as-guest");

  await gotoAndSettle(page, "/auth?mode=register&redirect=/settings");
  await snapshot(page, context, report, artifactDir, "09-create-account-route");
  const registrationSubmitted = await submitCreateAccountIfAvailable(page, user, report);
  await snapshot(page, context, report, artifactDir, "10-after-create-account");
  let registered = registrationSubmitted && (await hasVisibleAccountState(page, user.email));
  if (registrationSubmitted && !registered) {
    await gotoAndSettle(page, "/settings");
    registered = await hasVisibleAccountState(page, user.email);
  }
  if (registrationSubmitted && !registered) {
    report.missingFlows.push("Create-account submission did not produce visible account state.");
  }

  if (registered) {
    await gotoAndSettle(page, "/settings");
    await exerciseProviderSetup(page, report, "signed-in");
    await snapshot(page, context, report, artifactDir, "11-provider-setup-signed-in");
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
    await settle(page);
    await snapshot(page, context, report, artifactDir, "12-refresh-signed-in");
  }

  await gotoAndSettle(page, "/settings");
  const loggedOut = await clickButton(page, [/log out/i]);
  if (loggedOut.clicked) {
    report.actions.push("Clicked Log out.");
    await settle(page);
  } else {
    report.missingFlows.push("Logout control not present in runtime.");
  }
  await snapshot(page, context, report, artifactDir, "13-after-logout");

  await gotoAndSettle(page, "/settings");
  await snapshot(page, context, report, artifactDir, "14-return-after-logout");

  if (registered) {
    await gotoAndSettle(page, "/auth?mode=signin&redirect=/settings");
    await snapshot(page, context, report, artifactDir, "15-login-route");
    await loginIfAvailable(page, user, report);
    await snapshot(page, context, report, artifactDir, "16-after-login");
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
    await settle(page);
    await snapshot(page, context, report, artifactDir, "17-refresh-after-login");
  } else {
    report.missingFlows.push("Login replay skipped because account creation was not observed.");
  }
}

async function createLocalThreadIfAvailable(
  page: Page,
  context: BrowserContext,
  report: AuditReport,
  artifactDir: string,
) {
  await gotoAndSettle(page, "/");
  const openedMenu = await clickButton(page, [/open menu/i, /^menu$/i]);
  if (!openedMenu.clicked) {
    report.missingFlows.push("Thread drawer/menu control not present in runtime.");
    await snapshot(page, context, report, artifactDir, "06-guest-thread-menu-missing");
    return;
  }

  const newThread = await clickButton(page, [/new chat/i]);
  if (newThread.clicked) {
    report.actions.push("Created guest local thread from visible control.");
  } else {
    report.missingFlows.push("New chat control not present after opening menu.");
  }
  await settle(page);
  await snapshot(page, context, report, artifactDir, "06-guest-thread-attempt");
}

async function exerciseProviderSetup(
  page: Page,
  report: AuditReport,
  scope: "guest" | "signed-in",
) {
  const saveEmpty = await clickButton(page, [/^save$/i]);
  if (saveEmpty.clicked) {
    report.actions.push(`Clicked provider Save with empty input as ${scope}.`);
  } else if (saveEmpty.reason) {
    report.notes.push(`Provider empty-input Save as ${scope}: ${saveEmpty.reason}.`);
  } else {
    report.missingFlows.push(`Provider Save control not present as ${scope}.`);
  }

  const keyInput = await firstVisible(page.locator('input[type="password"]'));
  if (!keyInput) {
    report.missingFlows.push(`Provider API key input not present as ${scope}.`);
    return;
  }

  await keyInput.fill(`sk-invalid-runtime-audit-${runId}`);
  const savedFake = await clickButton(page, [/^save$/i]);
  if (savedFake.clicked) {
    report.actions.push(`Clicked provider Save with fake key as ${scope}.`);
    await settle(page);
  } else {
    report.notes.push(`Provider fake-key Save as ${scope}: ${savedFake.reason ?? "not clicked"}.`);
  }

  const validate = await clickButton(page, [/validate api key/i]);
  if (validate.clicked) {
    report.actions.push(`Clicked provider validation with fake key as ${scope}.`);
    await settle(page);
  }
}

async function submitCreateAccountIfAvailable(
  page: Page,
  user: { email: string; password: string; displayName: string },
  report: AuditReport,
): Promise<boolean> {
  const emailFilled = await fillByLabel(page, [/email/i], user.email);
  const nameFilled = await fillByLabel(page, [/display name/i, /^name$/i], user.displayName);
  const passwordFilled = await fillByLabel(page, [/password/i], user.password);
  if (!emailFilled || !passwordFilled) {
    report.missingFlows.push("Create-account form inputs not present in runtime.");
    return false;
  }
  if (!nameFilled) report.notes.push("Create-account display-name input not present.");

  const submitted = await clickButton(page, [/^create account$/i], "last");
  if (!submitted.clicked) {
    report.missingFlows.push("Create-account submit control not present in runtime.");
    return false;
  }
  report.actions.push("Submitted create-account form with runtime-audit user.");
  await settle(page, 5000);
  return true;
}

async function hasVisibleAccountState(page: Page, email: string): Promise<boolean> {
  if (
    await page
      .getByTestId("account-menu-signed-in")
      .isVisible({ timeout: 500 })
      .catch(() => false)
  ) {
    return true;
  }
  const visibleEmail = await page
    .getByTestId("account-menu-email")
    .innerText({ timeout: 500 })
    .catch(() => "");
  if (visibleEmail.includes(email)) return true;
  return page
    .getByText(email, { exact: true })
    .isVisible({ timeout: 500 })
    .catch(() => false);
}

async function loginIfAvailable(
  page: Page,
  user: { email: string; password: string },
  report: AuditReport,
) {
  const emailFilled = await fillByLabel(page, [/email/i], user.email);
  const passwordFilled = await fillByLabel(page, [/password/i], user.password);
  if (!emailFilled || !passwordFilled) {
    report.missingFlows.push("Login form inputs not present in runtime.");
    return;
  }
  const submitted = await clickButton(page, [/^sign in$/i], "last");
  if (submitted.clicked) {
    report.actions.push("Submitted login form with runtime-audit user.");
    await settle(page, 5000);
  } else {
    report.missingFlows.push("Login submit control not present in runtime.");
  }
}

async function editDisplayNameIfAvailable(page: Page, value: string, report: AuditReport) {
  const filled = await fillByLabel(page, [/display name/i], value);
  if (filled) {
    report.actions.push("Edited visible display-name setting as guest.");
    await page.keyboard.press("Tab").catch(() => undefined);
    await settle(page);
  } else {
    report.missingFlows.push("Display-name settings input not present for guest.");
  }
}

async function snapshot(
  page: Page,
  context: BrowserContext,
  report: AuditReport,
  artifactDir: string,
  name: string,
) {
  const screenshotName = `${String(report.snapshots.length + 1).padStart(2, "0")}-${slug(name)}.png`;
  const screenshotPath = path.join(artifactDir, screenshotName);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
  const storage = await collectStorage(page, context);
  const visible = await collectVisibleElements(page);
  report.snapshots.push({
    name,
    at: new Date().toISOString(),
    url: page.url(),
    title: await page.title().catch(() => ""),
    screenshot: screenshotPath,
    visibleText: await visibleText(page),
    buttons: visible.buttons,
    links: visible.links,
    inputs: visible.inputs,
    identity: await identityState(page),
    ...storage,
  });
}

async function collectStorage(page: Page, context: BrowserContext): Promise<StorageSnapshot> {
  const storage = await page
    .evaluate(() => {
      const read = (source: Storage) =>
        Object.fromEntries(
          Array.from({ length: source.length }, (_, index) => {
            const key = source.key(index) ?? "";
            return [key, source.getItem(key)];
          }).sort(([a], [b]) => a.localeCompare(b)),
        );
      return {
        localStorage: read(window.localStorage),
        sessionStorage: read(window.sessionStorage),
      };
    })
    .catch(() => ({ localStorage: {}, sessionStorage: {} }));

  const cookies = (await context.cookies().catch(() => [])).map((cookie) => ({
    name: cookie.name,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    valueLength: cookie.value.length,
  }));

  return {
    localStorage: redactStorage(storage.localStorage),
    sessionStorage: redactStorage(storage.sessionStorage),
    cookies,
  };
}

async function collectVisibleElements(page: Page): Promise<{
  buttons: ElementSummary[];
  links: ElementSummary[];
  inputs: ElementSummary[];
}> {
  return page
    .evaluate(() => {
      const isVisible = (el: Element) => {
        const node = el as HTMLElement;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const textFor = (el: Element) =>
        ((el as HTMLInputElement).value || el.textContent || el.getAttribute("aria-label") || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 300);
      const summarize = (el: Element): ElementSummary => {
        const input = el as HTMLInputElement;
        return {
          text: textFor(el),
          ariaLabel: el.getAttribute("aria-label"),
          disabled: input.disabled || el.getAttribute("aria-disabled") === "true",
          href: el instanceof HTMLAnchorElement ? el.href : undefined,
          placeholder: input.placeholder || undefined,
          type: input.type || undefined,
          valueLength: input.value ? input.value.length : undefined,
        };
      };
      return {
        buttons: Array.from(
          document.querySelectorAll('button, [role="button"], input[type="submit"]'),
        )
          .filter(isVisible)
          .map(summarize),
        links: Array.from(document.querySelectorAll("a")).filter(isVisible).map(summarize),
        inputs: Array.from(document.querySelectorAll("input, textarea, select"))
          .filter(isVisible)
          .map(summarize),
      };
    })
    .catch(() => ({ buttons: [], links: [], inputs: [] }));
}

async function visibleText(page: Page): Promise<string> {
  return page
    .locator("body")
    .innerText({ timeout: 1000 })
    .then((text) => text.replace(/\s+/g, " ").trim().slice(0, 12000))
    .catch(() => "");
}

async function identityState(page: Page): Promise<Snapshot["identity"]> {
  const appearsGuest =
    (await page
      .getByTestId("account-menu-guest")
      .isVisible({ timeout: 500 })
      .catch(() => false)) ||
    (await page
      .getByText(/using cockpit as a guest/i)
      .isVisible({ timeout: 500 })
      .catch(() => false));
  const appearsSignedIn = await page
    .getByTestId("account-menu-signed-in")
    .isVisible({ timeout: 500 })
    .catch(() => false);
  const accountEmail = await page
    .getByTestId("account-menu-email")
    .innerText({ timeout: 500 })
    .catch(() => null);
  const accountText = await page
    .getByTestId(appearsSignedIn ? "account-menu-signed-in" : "account-menu-guest")
    .innerText({ timeout: 500 })
    .catch(() => null);
  return { appearsGuest, appearsSignedIn, accountEmail, accountText };
}

async function gotoAndSettle(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => undefined);
  await settle(page);
}

async function settle(page: Page, timeout = 2500) {
  await page.waitForLoadState("networkidle", { timeout }).catch(() => undefined);
}

async function firstVisible(locator: Locator): Promise<Locator | null> {
  const count = await locator.count().catch(() => 0);
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i);
    if (await item.isVisible({ timeout: 500 }).catch(() => false)) return item;
  }
  return null;
}

async function clickButton(
  page: Page,
  names: RegExp[],
  preference: "first" | "last" = "first",
): Promise<{ clicked: boolean; label?: string; reason?: string }> {
  for (const name of names) {
    const locator = page.getByRole("button", { name });
    const count = await locator.count().catch(() => 0);
    const indexes = Array.from({ length: count }, (_, index) => index);
    if (preference === "last") indexes.reverse();
    for (const index of indexes) {
      const item = locator.nth(index);
      if (!(await item.isVisible({ timeout: 500 }).catch(() => false))) continue;
      const label = await item.innerText({ timeout: 500 }).catch(() => name.toString());
      if (!(await item.isEnabled({ timeout: 500 }).catch(() => false))) {
        return { clicked: false, label, reason: `Visible button "${label}" is disabled` };
      }
      await item.click().catch(() => undefined);
      return { clicked: true, label };
    }
  }
  return { clicked: false };
}

async function fillByLabel(page: Page, labels: RegExp[], value: string): Promise<boolean> {
  for (const label of labels) {
    const locator = page.getByLabel(label);
    const item = await firstVisible(locator);
    if (!item) continue;
    await item.fill(value).catch(() => undefined);
    return true;
  }
  return false;
}

function redactStorage(storage: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(storage).map(([key, value]) => {
      const text = typeof value === "string" ? value : JSON.stringify(value);
      if (/secret|token|password|api[_-]?key/i.test(key)) {
        return [key, { redacted: true, valueLength: text?.length ?? 0 }];
      }
      return [key, redactText(text ?? "")];
    }),
  );
}

function redactText(value: string) {
  return value
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-<redacted>")
    .replace(/(password["':\s]+)[^"',}\s]+/gi, "$1<redacted>");
}

function scrubUrl(raw: string) {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}${url.search ? "?<query>" : ""}`;
  } catch {
    return raw;
  }
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function writeAuditReport(filePath: string, report: AuditReport) {
  await fs.writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
