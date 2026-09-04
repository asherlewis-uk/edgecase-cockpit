# Truthful Backend Service

The Linux service that answers at `BACKEND_ORIGIN`. The Cloudflare Worker's
`backendFetch()` (`src/lib/backend-client.server.ts`) reaches this process over
plain HTTP; the diagnostic route `/api/backend-health` is its first consumer.

This service knows nothing about D1, Cloudflare, or the Worker. It is the
truthful half of the bridge: if it answers, the backend is genuinely up.

## Contract

`GET /health` → `200`, `application/json; charset=utf-8`, `Cache-Control: no-store`:

```json
{
  "status": "healthy",
  "service": "truthful-backend",
  "timestamp": "2026-09-04T08:08:13.357Z"
}
```

`timestamp` is generated per request, so a frozen or cached response is
detectable. The body is a plain object on purpose — the Worker's
`withBridgeFlag()` merges `edge_bridged: true` into an object, but nests an
array or scalar under `backend` instead.

Other behaviour:

| Request                            | Response                                           |
| ---------------------------------- | -------------------------------------------------- |
| `GET /health/`, `?query=1`         | `200`, same payload (path is matched, not the URL) |
| `HEAD /health`                     | `200`, headers only                                |
| `POST /health` (or any other verb) | `405` with `Allow: GET, HEAD`                      |
| Any other path                     | `404` JSON, never a socket hangup                  |

## Requirements

Node.js **22 or newer**. Nothing else — the service has **zero dependencies**,
no build step, and no `npm install`. That is deliberate: the deployable unit is
this directory, copied as-is.

## Run it locally

```bash
node backend/src/server.js
```

Then, from another shell:

```bash
curl -s http://127.0.0.1:8000/health
```

### Configuration

| Variable | Default     | Notes                                                               |
| -------- | ----------- | ------------------------------------------------------------------- |
| `PORT`   | `8000`      | A malformed value throws at startup rather than silently using 8000 |
| `HOST`   | `127.0.0.1` | Loopback by default; set `0.0.0.0` only if you intend to expose it  |

The defaults match `BACKEND_ORIGIN=http://127.0.0.1:8000` in `.env.example`, so
an unconfigured local run already satisfies the Worker.

## Deploy to `prod-web-01` (port 8000)

`prod-web-01` runs Ubuntu 26.04.1 LTS as user `asher`. Run these from your
workstation and on the host as noted.

### 1. Install Node 22 (skip if `node --version` already reports v22+)

```bash
ssh asher@prod-web-01 'curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs'
```

### 2. Copy the service

```bash
ssh asher@prod-web-01 'sudo mkdir -p /opt/edgecase-cockpit && sudo chown asher:asher /opt/edgecase-cockpit'
rsync -av --delete backend/ asher@prod-web-01:/opt/edgecase-cockpit/backend/
```

### 3. Confirm it runs before installing the unit

```bash
ssh asher@prod-web-01 'cd /opt/edgecase-cockpit/backend && timeout 5 node src/server.js'
```

Expect `[truthful-backend] listening on http://127.0.0.1:8000 (GET /health)`.

### 4. Install and start the systemd unit

`deploy/truthful-backend.service` pins `HOST=127.0.0.1`, `PORT=8000`, and
`ExecStart=/usr/bin/node`. **Check the interpreter path first** — a node
installed via nvm or fnm is not at `/usr/bin/node`:

```bash
ssh asher@prod-web-01 'command -v node'
```

Then:

```bash
ssh asher@prod-web-01 '
  sudo cp /opt/edgecase-cockpit/backend/deploy/truthful-backend.service /etc/systemd/system/ &&
  sudo systemctl daemon-reload &&
  sudo systemctl enable --now truthful-backend
'
```

### 5. Verify

On the host:

```bash
ssh asher@prod-web-01 'systemctl is-active truthful-backend && curl -s http://127.0.0.1:8000/health'
```

Through the edge, once the Worker has `BACKEND_ORIGIN` set:

```bash
curl -s https://<your-worker-host>/api/backend-health
```

A healthy bridge returns the payload above plus `"edge_bridged": true` and
`"backend_status": 200`.

## Operating

```bash
sudo systemctl status truthful-backend     # state
sudo journalctl -u truthful-backend -f     # logs
sudo systemctl restart truthful-backend    # restart
```

The service handles `SIGTERM` and `SIGINT`, closing its listener and exiting 0,
so `systemctl stop` and `restart` are clean rather than reported as failures.

## Troubleshooting

| Symptom                                        | Cause                                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `/api/backend-health` → `503 unconfigured`     | `BACKEND_ORIGIN` is unset on the Worker, not a backend fault           |
| `/api/backend-health` → `502 unreachable`      | Worker cannot reach the origin — check the unit is active and the port |
| `/api/backend-health` → `502 invalid_response` | Something that is not this service is answering on 8000                |
| `status=203/EXEC` in journal                   | `ExecStart` interpreter path is wrong; fix it to `command -v node`     |
| Unit fails with a permissions error            | `WorkingDirectory` is under `/home` while `ProtectHome=true` is set    |

## Tests

Covered by the repo's root suite (`backend/**/*.test.js` is in
`vitest.config.ts`), so CI runs it:

```bash
bun run test
```

Or just this service:

```bash
npx vitest run backend/src/server.test.js
```

The suite binds the server to an ephemeral port and drives it over real HTTP,
so it proves the process answers rather than only that the handler returns an
object.
