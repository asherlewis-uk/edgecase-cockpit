# edgecase-cockpit

> A local-first/BYOC AI control surface for proving one concrete local runtime control loop.

One calm interface for running, selecting, monitoring, and conversing with AI
model providers — local and cloud — without terminal windows or provider
dashboards.

## Quick start

This project uses **Bun** (`bun.lock`, `bunfig.toml`).

```bash
bun install
cp .env.example .env.local
```

`.env.example` is a template, and copying it is not sufficient on its own.
`SESSION_SECRET` must be at least 32 characters; the placeholder that ships in
`.env.example` is 28, so it does not satisfy the check. Generate a real value
and set it in `.env.local`:

```bash
openssl rand -base64 32   # 44 characters
```

`SESSION_SECRET` is the only variable a local dev server requires.
`ENCRYPTION_KEY` is additionally required in production and whenever a D1
binding is present. Without a valid `SESSION_SECRET` the server answers every
request with HTTP 503 `Server misconfigured`.

```bash
bun run dev
```

Before opening a change, and again before pushing it, run the full gate:

```bash
bun run test && bun run typecheck && bun run lint && bun run build
```

Normal tests are credential-free — no provider API keys are required. Live
provider tests are opt-in; see [docs/development.md](docs/development.md).

## Where things are

| I want to...                        | Read                                                   |
| ----------------------------------- | ------------------------------------------------------ |
| Understand the architecture         | [docs/architecture.md](docs/architecture.md)           |
| Add or configure a provider         | [docs/providers.md](docs/providers.md)                 |
| Set up a dev environment, run tests | [docs/development.md](docs/development.md)             |
| Deploy, migrate, manage secrets     | [docs/deployment.md](docs/deployment.md)               |
| Cut a native release                | [docs/native-release.md](docs/native-release.md)       |
| Know what V1 promises               | [docs/v1-contract.md](docs/v1-contract.md)             |
| Know where the product is going     | [docs/product-direction.md](docs/product-direction.md) |
| Work in this repo as an agent       | [AGENTS.md](AGENTS.md)                                 |
| See current implementation plans    | [docs/superpowers/plans/](docs/superpowers/plans/)     |
| Read superseded plans and audits    | [docs/archive/](docs/archive/)                         |

## Status

The browser/web runtime is the V1 proof surface and builds today; the Cloudflare
Workers backend and D1 are configured. Native shells — Electron for macOS,
Capacitor for iOS and Android — have verified builds, but signing, notarization,
and store submission are post-V1 distribution work. Account isolation across
local and server buckets and the generic local OpenAI-compatible endpoint
contract are the work currently in flight; the active plan is in
[docs/superpowers/plans/](docs/superpowers/plans/).
