import { devices, expect, test, type Page, type Route } from "@playwright/test";

type MockModel = { id: string };

type MockModelList =
  | { kind: "success"; models: MockModel[] }
  | { kind: "empty" }
  | { kind: "malformed" }
  | { kind: "abort" };

const SUCCESS_BASE_URL = "http://127.0.0.1:39281";
const EMPTY_BASE_URL = "http://127.0.0.1:39282";
const MALFORMED_BASE_URL = "http://127.0.0.1:39283";
const UNREACHABLE_BASE_URL = "http://127.0.0.1:39284";
const RECOVERY_BASE_URL = "http://127.0.0.1:39285";

const LOCAL_PROVIDER_PORTS = new Set(["11434", "1234", "8080", "8787", "8000", "8081"]);
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Private-Network": "true",
};

function v1Section(page: Page) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: "V1 local endpoint" }),
  });
}

function capability(page: Page) {
  return page.getByTestId("v1-local-capability");
}

function capabilityLabel(page: Page) {
  return page.getByTestId("v1-local-capability-label");
}

function checkModelsButton(page: Page) {
  return page.getByTestId("v1-check-models");
}

function collectForbiddenRequests(page: Page) {
  const forbidden: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (
      /api\.openai\.com|platform\.openai\.com|\/oauth\b|marketplace|signed-native|\/api\/keys\/set|\/api\/keys\/validate|\/api\/proxy\//i.test(
        url,
      )
    ) {
      forbidden.push(url);
    }
  });
  return forbidden;
}

async function installModelListMocks(page: Page, responses: Map<string, MockModelList>) {
  await page.route("**/api/tags", async (route) => {
    await route.abort("failed");
  });

  await page.route("**/v1/models", async (route) => {
    const url = new URL(route.request().url());
    const response = responses.get(url.origin);
    if (response) {
      await fulfillModelList(route, response);
      return;
    }
    if (isKnownLocalProviderProbe(url)) {
      await route.abort("failed");
      return;
    }
    await route.fallback();
  });
}

function isKnownLocalProviderProbe(url: URL) {
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    LOCAL_PROVIDER_PORTS.has(url.port)
  );
}

async function fulfillModelList(route: Route, response: MockModelList) {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: CORS_HEADERS });
    return;
  }

  if (response.kind === "abort") {
    await route.abort("failed");
    return;
  }

  if (response.kind === "malformed") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: CORS_HEADERS,
      body: JSON.stringify({ models: ["not-openai-compatible"] }),
    });
    return;
  }

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: CORS_HEADERS,
    body: JSON.stringify({
      object: "list",
      data: response.kind === "empty" ? [] : response.models.map((model) => ({ id: model.id })),
    }),
  });
}

async function openSettingsAsFreshGuest(page: Page, responses: Map<string, MockModelList>) {
  const forbiddenRequests = collectForbiddenRequests(page);
  await installModelListMocks(page, responses);
  await page.context().clearCookies();
  await page.goto("/settings");
  await expect(page.getByTestId("account-menu-guest")).toBeVisible();
  await expect(v1Section(page)).toContainText("Generic local OpenAI-compatible endpoint");
  await expect(v1Section(page)).toContainText("does not require signing in");
  await expect(v1Section(page)).toContainText("cloud API keys");
  await expect(v1Section(page).locator('[data-testid="provider-auth-prompt"]')).toHaveCount(0);
  await expect(checkModelsButton(page)).toBeVisible();
  await expect(capabilityLabel(page)).toHaveText(
    /Endpoint unreachable|Localhost points at this device|Hosted HTTPS blocks local HTTP|Endpoint needs a base URL|Endpoint URL is invalid/,
  );
  return forbiddenRequests;
}

async function configureEndpoint(page: Page, baseUrl: string, model: string) {
  await page.getByTestId("v1-base-url-input").fill(baseUrl);
  await expect(page.getByTestId("v1-base-url-input")).toHaveValue(baseUrl);
  await page.getByTestId("v1-model-input").fill(model);
  await expect(page.getByTestId("v1-model-input")).toHaveValue(model);
  await expect(capability(page)).toContainText(baseUrl);
  await expect(capability(page)).toContainText(model);
  await expect(checkModelsButton(page)).toBeEnabled();
}

async function checkModels(page: Page) {
  await checkModelsButton(page).click();
}

async function expectNoForbiddenRequests(forbiddenRequests: string[]) {
  expect(
    forbiddenRequests,
    "V1 local loop must not use auth, cloud-key, OAuth, marketplace, native, or proxy routes",
  ).toEqual([]);
}

test.describe("V1 local OpenAI-compatible endpoint loop", () => {
  test("fresh guest can verify models without sign-in, OpenAI, cloud keys, or live providers", async ({
    page,
  }) => {
    const forbiddenRequests = await openSettingsAsFreshGuest(
      page,
      new Map([[SUCCESS_BASE_URL, { kind: "success", models: [{ id: "fixture-alpha" }] }]]),
    );

    await configureEndpoint(page, SUCCESS_BASE_URL, "fixture-alpha");
    await expect(capabilityLabel(page)).toHaveText("Configured/reachable");
    await expect(capability(page)).toContainText("model availability is not verified", {
      ignoreCase: true,
    });

    await checkModels(page);

    await expect(capabilityLabel(page)).toHaveText("Verified ready");
    await expect(capability(page)).toContainText("ready");
    await expect(page.getByTestId("v1-local-capability-models")).toContainText("fixture-alpha");
    await expect(page).not.toHaveURL(/\/auth/);
    await expectNoForbiddenRequests(forbiddenRequests);
  });

  test("empty model list shows no usable models and a retry action", async ({ page }) => {
    const forbiddenRequests = await openSettingsAsFreshGuest(
      page,
      new Map([[EMPTY_BASE_URL, { kind: "empty" }]]),
    );

    await configureEndpoint(page, EMPTY_BASE_URL, "expected-model");
    await checkModels(page);

    await expect(capabilityLabel(page)).toHaveText("No models reported");
    await expect(capability(page)).toContainText("no-models");
    await expect(capability(page)).toContainText("returned no usable models");
    await expect(page.getByTestId("v1-local-capability-next-action")).toContainText(
      "retry the model-list check",
    );
    await expectNoForbiddenRequests(forbiddenRequests);
  });

  test("malformed model-list response shows failed state without provider integration", async ({
    page,
  }) => {
    const forbiddenRequests = await openSettingsAsFreshGuest(
      page,
      new Map([[MALFORMED_BASE_URL, { kind: "malformed" }]]),
    );

    await configureEndpoint(page, MALFORMED_BASE_URL, "expected-model");
    await checkModels(page);

    await expect(capabilityLabel(page)).toHaveText("Model-list response is malformed");
    await expect(capability(page)).toContainText("failed");
    await expect(capability(page)).toContainText("did not match an OpenAI-compatible model-list");
    await expectNoForbiddenRequests(forbiddenRequests);
  });

  test("unreachable endpoint shows failure, clears stale state on config change, and recovers", async ({
    page,
  }) => {
    const responses = new Map<string, MockModelList>([
      [UNREACHABLE_BASE_URL, { kind: "abort" }],
      [RECOVERY_BASE_URL, { kind: "success", models: [{ id: "recovered-model" }] }],
    ]);
    const forbiddenRequests = await openSettingsAsFreshGuest(page, responses);

    await configureEndpoint(page, UNREACHABLE_BASE_URL, "bad-model");
    await checkModels(page);

    await expect(capabilityLabel(page)).toHaveText("Model-list endpoint unreachable");
    await expect(page.getByTestId("v1-local-capability-reason")).toContainText(/failed|fetch/i);
    await expect(page.getByTestId("v1-local-capability-next-action")).toContainText(
      "retry the model-list check",
    );

    await configureEndpoint(page, RECOVERY_BASE_URL, "recovered-model");
    await expect(capability(page)).not.toContainText("Model-list endpoint unreachable");
    await expect(capability(page)).not.toContainText(/failed to fetch/i);
    await expect(capabilityLabel(page)).toHaveText("Configured/reachable");

    await checkModels(page);

    await expect(capabilityLabel(page)).toHaveText("Verified ready");
    await expect(page.getByTestId("v1-local-capability-models")).toContainText("recovered-model");
    await expectNoForbiddenRequests(forbiddenRequests);
  });
});

test.describe("V1 local endpoint browser boundary states", () => {
  test.use({
    viewport: devices["Pixel 5"].viewport,
    userAgent: devices["Pixel 5"].userAgent,
    deviceScaleFactor: devices["Pixel 5"].deviceScaleFactor,
    isMobile: devices["Pixel 5"].isMobile,
    hasTouch: devices["Pixel 5"].hasTouch,
  });

  test("mobile localhost mismatch is visible before any model-list fetch", async ({ page }) => {
    const forbiddenRequests = await openSettingsAsFreshGuest(page, new Map());

    await expect(capabilityLabel(page)).toHaveText("Localhost points at this device");
    await expect(page.getByTestId("v1-local-capability-boundary")).toContainText(
      "localhost points at the mobile device",
    );
    await expect(checkModelsButton(page)).toBeDisabled();
    await expectNoForbiddenRequests(forbiddenRequests);
  });
});
