## Prompt for Lovable: Environmental Sync Configuration

The project `edgecase-cockpit` is now configured for **Cloudflare Workers deployment with D1 database**. This is the source of truth for all environmental configuration. Do not attempt to deploy through Lovable's native hosting — the project is intentionally designed to run on Cloudflare's edge infrastructure.

### 1. Build Configuration (vite.config.ts)

The `nitro` deploy plugin **must be enabled** to generate proper deployment artifacts:

```typescript
export default defineConfig({
  nitro: true, // FORCE-ENABLE — do not remove
  tanstackStart: {
    server: { entry: "server" },
  },
});
```

**Why:** The nitro plugin generates `dist/server/wrangler.json` and `.wrangler/deploy/config.json`, which are required for wrangler to correctly bundle the Worker **and** serve static assets (`/assets/*`). Without this, the deployed Worker serves HTML but returns 404 for all JS/CSS bundles.

### 2. Wrangler Configuration (wrangler.jsonc)

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "edgecase-cockpit",
  "compatibility_date": "2025-09-24",
  "compatibility_flags": ["nodejs_compat"],
  "main": "src/server.ts", // wrangler bundles this at deploy time
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "edgecase-cockpit",
      "database_id": "f89b278d-301f-4a98-a018-b92eeb279449",
    },
  ],
}
```

**Note:** The `main` field points to `src/server.ts` (source), not `dist/server/server.js`. The wrangler CLI handles bundling during `wrangler deploy`. The `dist/server/` output is only for reference — the actual deployment is built by wrangler from source.

### 3. Package.json Side Effects

```json
"sideEffects": ["src/lib/error-capture.ts"]
```

**Why:** Wrangler's bundler strips imports marked as side-effect-free. The error-capture module MUST run at import time (it registers global error/rejection handlers). If stripped, catastrophic SSR errors become silent 500s with no diagnostics.

### 4. D1 Database (Already Provisioned)

- **Database name:** `edgecase-cockpit`
- **Database ID:** `f89b278d-301f-4a98-a018-b92eeb279449`
- **Tables initialized:** `sessions`, `threads`, `provider_stats`, `usage_records`, `vector_docs`, `rate_limits`
- **Schema file:** `src/lib/db/schema.sql`

If schema changes are needed, run:

```bash
wrangler d1 execute edgecase-cockpit --file=src/lib/db/schema.sql
```

### 5. Wrangler Secrets (Required on Cloudflare)

These are set via `wrangler secret put` and are **NOT** in the repo:

| Secret           | Status | Purpose                                              |
| ---------------- | ------ | ---------------------------------------------------- |
| `SESSION_SECRET` | ✅ Set | 32+ char random string for encrypted cookie sessions |

### 6. GitHub Actions Deployment (Auto-Deploy on Push to Main)

File: `.github/workflows/deploy.yml`

Requires these **repository secrets** (Settings → Secrets → Actions):

| Secret          | Value                              | Source                                                                                                     |
| --------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `CF_API_TOKEN`  | (set)                              | Cloudflare API Token with: Workers Scripts:Edit, Workers KV:Edit, D1:Edit, Pages:Edit, Workers Routes:Edit |
| `CF_ACCOUNT_ID` | `27f889362b8e3b48f232084da29c29f4` | Cloudflare Account ID                                                                                      |

**The token must have these scopes:**

- Account Settings:Read
- Workers Scripts:Edit, Workers KV Storage:Edit, Workers Tail:Read, Workers R2 Storage:Edit, Cloudflare Pages:Edit, Workers Builds Configuration:Edit, Workers Agents Configuration:Edit, Workers Observability:Edit, Containers:Edit
- Workers Routes:Edit (All zones)
- User Details:Read, Memberships:Read (All users)

### 7. Local Development vs. Deployment

| Environment | Command           | Notes                                                                                                                |
| ----------- | ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| Local dev   | `bun run dev`     | Uses Vite dev server, D1 simulated locally if configured                                                             |
| Build       | `bun run build`   | Produces `dist/client/` + `dist/server/`, but **do not deploy the dist files directly**                              |
| Deploy      | `wrangler deploy` | Wrangler re-bundles from `src/server.ts` using the nitro-generated config. This is the ONLY correct deployment path. |

### 8. Critical: Do NOT Do These

1. **Do NOT** change `wrangler.jsonc` `main` to `dist/server/server.js` — this breaks the asset bundling flow.
2. **Do NOT** remove `nitro: true` from `vite.config.ts` — static assets will 404 on deploy.
3. **Do NOT** set `sideEffects: false` in `package.json` — error capture will be stripped.
4. **Do NOT** attempt to deploy via Lovable's native hosting — the app requires Cloudflare D1 bindings and Wrangler secrets.

### 9. Verification

After any code change, verify with:

```bash
bun run test && bun run typecheck && bun run lint && bun run build
```

Then push to `main` — the GitHub Action will deploy automatically. The live URL is:
**https://edgecase-cockpit.asher-lewis-knight.workers.dev**

### 10. What "Sync" Means Here

If you are editing this project in the Lovable UI, any changes you make will be reflected in the GitHub repo. However, **Lovable cannot deploy to Cloudflare Workers directly**. After making changes in Lovable:

1. Pull the changes locally: `git pull origin main`
2. Verify the 5 critical configs above (vite.config.ts, wrangler.jsonc, package.json sideEffects, D1 schema, secrets) have not been altered by Lovable's code generation
3. If they were altered, restore them from the above source of truth
4. Push to `main` — GitHub Actions deploys automatically

**In short:** Lovable is the editor, GitHub is the source of truth, Cloudflare is the runtime. Keep these three in sync by preserving the environmental configs above.
