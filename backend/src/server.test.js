// @vitest-environment node
//
// Exercises the service over a real socket on an ephemeral port, because that
// is how the Worker reaches it. Asserting the handler in isolation would not
// prove the process actually answers HTTP.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  SERVICE_NAME,
  healthPayload,
  resolvePort,
  startServer,
} from "./server.js";

/** @type {import("node:http").Server} */
let server;
/** @type {string} */
let origin;

beforeAll(async () => {
  // Port 0 lets the OS pick a free port, so the suite never collides with a
  // real backend already running on 8000.
  server = await startServer({ port: 0, host: "127.0.0.1" });
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Server did not bind to a TCP address.");
  }
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("GET /health", () => {
  it("responds 200 with the truthful health payload", async () => {
    const response = await fetch(`${origin}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "healthy",
      service: "truthful-backend",
      timestamp: expect.any(String),
    });
  });

  it("returns a JSON content type so the edge can parse the body", async () => {
    const response = await fetch(`${origin}/health`);

    // The Worker's backend-health route falls into its `invalid_response`
    // branch if this body is not JSON.
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns a plain object, which is what the edge bridge spreads", async () => {
    const body = await (await fetch(`${origin}/health`)).json();

    // withBridgeFlag() only merges edge_bridged into a non-array object;
    // anything else gets nested under `backend` instead.
    expect(Array.isArray(body)).toBe(false);
    expect(typeof body).toBe("object");
    expect(body).not.toBeNull();
  });

  it("stamps a real ISO-8601 timestamp", async () => {
    const before = Date.now();
    const { timestamp } = await (await fetch(`${origin}/health`)).json();
    const after = Date.now();

    // Round-tripping proves it parses; the window proves it is generated per
    // request rather than frozen at module load.
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
    expect(new Date(timestamp).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(new Date(timestamp).getTime()).toBeLessThanOrEqual(after + 1000);
  });

  it("answers through a trailing slash and a query string", async () => {
    for (const path of ["/health/", "/health?probe=1"]) {
      const response = await fetch(`${origin}${path}`);
      expect(response.status).toBe(200);
      expect((await response.json()).status).toBe("healthy");
    }
  });

  it("rejects non-GET methods with 405 and an Allow header", async () => {
    const response = await fetch(`${origin}/health`, { method: "POST" });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
  });
});

describe("unknown routes", () => {
  it("returns 404 JSON rather than an empty socket hangup", async () => {
    const response = await fetch(`${origin}/nope`);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      status: "not_found",
      service: SERVICE_NAME,
    });
  });
});

describe("healthPayload", () => {
  it("serializes the injected instant", () => {
    expect(healthPayload(new Date("2026-09-04T12:00:00.000Z"))).toEqual({
      status: "healthy",
      service: "truthful-backend",
      timestamp: "2026-09-04T12:00:00.000Z",
    });
  });
});

describe("resolvePort", () => {
  it("defaults to 8000 when PORT is unset or blank", () => {
    expect(resolvePort({})).toBe(DEFAULT_PORT);
    expect(resolvePort({ PORT: "   " })).toBe(DEFAULT_PORT);
    expect(DEFAULT_PORT).toBe(8000);
  });

  it("honours a valid PORT", () => {
    expect(resolvePort({ PORT: "9001" })).toBe(9001);
  });

  it("throws on a malformed PORT instead of silently using 8000", () => {
    for (const PORT of ["800O", "0", "70000", "8000.5"]) {
      expect(() => resolvePort({ PORT })).toThrow(/Invalid PORT/);
    }
  });
});

describe("defaults", () => {
  it("binds loopback to match BACKEND_ORIGIN", () => {
    expect(`http://${DEFAULT_HOST}:${DEFAULT_PORT}`).toBe("http://127.0.0.1:8000");
  });
});
