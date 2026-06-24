```markdown
# edgecase-cockpit Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill teaches you the core development patterns, coding conventions, and common workflows for contributing to the `edgecase-cockpit` codebase. The project is a TypeScript application built with Vite, featuring a modular architecture with React components, API routes, and supporting libraries. It emphasizes clear commit practices, consistent code style, and robust testing using Vitest.

## Coding Conventions

- **File Naming:**  
  Use `camelCase` for file names.  
  Example:  
  ```
  src/components/cockpit/chatPanel.tsx
  src/lib/proxyGuard.server.ts
  ```

- **Import Style:**  
  Use path aliases for imports.  
  Example:  
  ```ts
  import { fetchThreads } from '@/lib/threadApi';
  import ChatPanel from '@/components/cockpit/chatPanel';
  ```

- **Export Style:**  
  Prefer **named exports**.  
  Example:  
  ```ts
  // src/lib/proxyGuard.server.ts
  export function proxyGuard(req: Request) { ... }
  ```

- **Commit Messages:**  
  Use prefixes such as `feat`, `chore`, `fix`, `docs`, `build`.  
  Keep messages concise (average ~40 characters).  
  Example:  
  ```
  feat: add rate limiting to chat proxy endpoint
  fix: correct thread fetching logic
  ```

## Workflows

### Add or Update API Endpoint
**Trigger:** When you want to add a new API route or modify an existing one (e.g., for threads, keys, usage, proxy, etc).  
**Command:** `/new-api-endpoint`

1. Create or update files in `src/routes/api/`  
   Example:  
   ```
   src/routes/api/threads.ts
   src/routes/api/keys/set.ts
   ```
2. Update `src/routeTree.gen.ts` to reflect new or changed routes.
3. Optionally, add or update test files:  
   ```
   src/routes/api/keys.test.ts
   src/routes/api/threads.test.ts
   ```
4. Optionally, update related library files:  
   ```
   src/lib/providers.ts
   src/lib/proxyGuard.server.ts
   ```

### Feature Development Across UI, Lib, and Routes
**Trigger:** When building or improving a user-facing feature (e.g., settings, chat, images, personalization).  
**Command:** `/feature`

1. Update or add React component files in `src/components/cockpit/` and/or subfolders.
2. Update or add React hooks in `src/hooks/`.
3. Update supporting logic in `src/lib/`.
4. Update or add route files in `src/routes/`.
5. Update `src/routeTree.gen.ts` if routes are changed.
6. Optionally, update documentation:  
   ```
   GAPS.md
   docs/product-direction.md
   ```

**Example:**  
```tsx
// src/components/cockpit/settingsPanel.tsx
export function SettingsPanel() { ... }
```
```ts
// src/hooks/useShortcuts.ts
export function useShortcuts() { ... }
```

### Security or Infrastructure Hardening
**Trigger:** When improving backend/API security and reliability (e.g., rate limiting, CSRF, storage limits, CSP headers).  
**Command:** `/security-hardening`

1. Implement or update security logic in `src/lib/`  
   Example:  
   ```
   src/lib/rateLimit.server.ts
   src/lib/proxyGuard.server.ts
   src/lib/storageLimits.server.ts
   src/lib/csp.server.ts
   ```
2. Update affected API route files in `src/routes/api/`.
3. Add or update test files for new security logic:  
   ```
   src/routes/api/rateLimit.test.ts
   ```
4. Update documentation (e.g., `GAPS.md`) to reflect completed work.

### Update or Add Documentation and Roadmap
**Trigger:** When documenting new features, product direction, or project status.  
**Command:** `/update-docs`

1. Create or update markdown files in `docs/`, `GAPS.md`, `README.md`, or `.lovable/plan.md`.
2. Optionally, reference new or updated features in the documentation.

**Example:**  
```
docs/product-direction.md
GAPS.md
README.md
.lovable/plan.md
```

### Add or Update Database Schema
**Trigger:** When introducing new tables, columns, or changing data persistence.  
**Command:** `/new-table`

1. Update `src/lib/db/schema.sql` with new or changed schema.
2. Update `src/lib/db/index.ts` to reflect schema changes.
3. Optionally, update related API endpoints or logic using the schema.

**Example:**  
```sql
-- src/lib/db/schema.sql
CREATE TABLE IF NOT EXISTS user_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  settings JSONB NOT NULL
);
```
```ts
// src/lib/db/index.ts
export function getUserSettings(userId: number) { ... }
```

## Testing Patterns

- **Framework:** [Vitest](https://vitest.dev/)
- **Test File Pattern:** Files end with `.test.ts` and are placed alongside or near the code under test.
- **Example Test File:**
  ```ts
  // src/routes/api/keys.test.ts
  import { describe, it, expect } from 'vitest';
  import { getKeys } from './keys';

  describe('API: keys', () => {
    it('returns all keys', async () => {
      const result = await getKeys();
      expect(result).toBeDefined();
    });
  });
  ```

## Commands

| Command              | Purpose                                                      |
|----------------------|--------------------------------------------------------------|
| /new-api-endpoint    | Add or update an API endpoint under `src/routes/api/`        |
| /feature             | Implement or enhance a user-facing feature                   |
| /security-hardening  | Add or improve security/infrastructure logic                 |
| /update-docs         | Update or add documentation and roadmap files                |
| /new-table           | Add or update database schema and persistence logic          |
```