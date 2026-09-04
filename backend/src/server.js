// Truthful Linux backend service.
//
// This is the process that sits at BACKEND_ORIGIN. The Cloudflare Worker's
// backendFetch() reaches it over plain HTTP; nothing here knows about D1, the
// Worker, or the edge.
//
// Zero dependencies on purpose. An operator must be able to drop this directory
// onto a bare Ubuntu host and run `node src/server.js` -- no build step, no
// package install, nothing to keep in sync with the front end's toolchain.
import { createServer } from "node:http";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const SERVICE_NAME = "truthful-backend";
export const DEFAULT_PORT = 8000;

// Loopback by default. BACKEND_ORIGIN is http://127.0.0.1:8000, so binding to
// all interfaces would expose the service more widely than the contract asks
// for. Widening it is an explicit HOST=0.0.0.0 decision.
export const DEFAULT_HOST = "127.0.0.1";

/**
 * The /health response body.
 *
 * `now` is injectable so a test can assert the exact timestamp rather than
 * asserting a loose "looks like a date" shape.
 *
 * @param {Date} [now]
 * @returns {{ status: string, service: string, timestamp: string }}
 */
export function healthPayload(now = new Date()) {
  return {
    status: "healthy",
    service: SERVICE_NAME,
    timestamp: now.toISOString(),
  };
}

/**
 * Read a port from an environment-shaped record.
 *
 * Throws rather than falling back on a malformed value: silently serving on
 * 8000 when the unit file said PORT=800O is exactly the kind of untruth this
 * service exists to avoid.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {number}
 */
export function resolvePort(env = process.env) {
  const raw = env.PORT?.trim();
  if (raw === undefined || raw === "") return DEFAULT_PORT;

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${JSON.stringify(raw)} (expected an integer 1-65535).`);
  }
  return port;
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} statusCode
 * @param {unknown} body
 * @param {Record<string, string>} [headers]
 */
function sendJson(res, statusCode, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    // A health check that can be cached is not a health check.
    "Cache-Control": "no-store",
    ...headers,
  });
  // Node drops the body itself on HEAD, so this is correct for GET and HEAD.
  res.end(payload);
}

/**
 * Route a request. Exported so tests can exercise it without a live socket.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export function handleRequest(req, res) {
  // Compare on the path alone: a query string or a trailing slash must not
  // decide whether the health check answers.
  const path = (req.url ?? "/").split("?")[0].replace(/\/+$/, "") || "/";

  if (path !== "/health") {
    sendJson(res, 404, { status: "not_found", service: SERVICE_NAME, path });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(
      res,
      405,
      { status: "method_not_allowed", service: SERVICE_NAME, method: req.method },
      { Allow: "GET, HEAD" },
    );
    return;
  }

  sendJson(res, 200, healthPayload());
}

/**
 * Build an unbound server. The caller listens, so tests can bind port 0.
 *
 * @returns {import("node:http").Server}
 */
export function createHealthServer() {
  return createServer(handleRequest);
}

/**
 * Bind the service.
 *
 * @param {{ port?: number, host?: string }} [options]
 * @returns {Promise<import("node:http").Server>}
 */
export function startServer({
  port = resolvePort(),
  host = process.env.HOST || DEFAULT_HOST,
} = {}) {
  const server = createHealthServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve(server);
    });
  });
}

// Only self-start when run directly (`node src/server.js`), never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startServer();
  const address = server.address();
  const bound =
    typeof address === "object" && address !== null
      ? `${address.address}:${address.port}`
      : String(address);
  console.log(`[${SERVICE_NAME}] listening on http://${bound} (GET /health)`);

  // systemd stops units with SIGTERM; exit cleanly so restarts are not
  // reported as failures.
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.once(signal, () => {
      console.log(`[${SERVICE_NAME}] ${signal} received, shutting down.`);
      server.close(() => process.exit(0));
    });
  }
}
