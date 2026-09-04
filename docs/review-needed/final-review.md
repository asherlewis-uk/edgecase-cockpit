# Final Branch Review: fix/v1-isolation-and-contract

This is the final review for `fix/v1-isolation-and-contract` against the V1 account isolation and surface contract plan.

## Findings

### Task 5: `saveValidationStatus` during server-mode hydration window
**FAIL**  
`getActiveScope()` resolves its key using `state.user?.id ?? state.localProfileId ?? null`. In the server-mode hydration window (before `hydrateAsync` completes), `state.user` is null but `state.localProfileId` holds the local ID. As a result, a `saveValidationStatus()` call during this window incorrectly writes the server account's validation status into the local profile's bucket.  
**Actor:** implementer

**Update:** Task 5 is fixed at ea1a6df (this review file predates the fix).

### R11: Task 4 fixed one bug, not two
**PASS**  
Task 4 fixes the in-flight-response bug. No secondary bug resolution is falsely claimed.  
**Actor:** owner

### R26: No name-based SSRF overclaim
**PASS**  
The branch closes IP-literal and wildcard DNS SSRF without making inaccurate claims about mitigating name-based SSRF via `*.local`.  
**Actor:** owner

### R30: `window.$_TSR` / `script-src 'unsafe-inline'` still required follow-up
**FAIL**  
`window.$_TSR` is still present in `index.html`, and `script-src 'unsafe-inline'` remains active in the CSP configuration (both in `electron/main.ts` and `src/lib/csp.server.ts`).  
**Actor:** implementer

### R48/R49: Copy/move onto an account that already has settings
**PASS**  
The settings load is successfully suppressed on a migration entry. `enterServerMode` now accepts a `skipSettingsLoad` option, which is correctly passed when migrating local data (copy/move) to prevent a server settings fetch from clobbering the migrated bucket.  
**Actor:** owner

### Task 12 Leftover Token Items (I4 and minors)
The following items remain open:

- **I4:** The elevation ladder is monotonic in alpha, but not in perceived elevation (e.g. sidebar at `L=0.12` is darker than prompt at `L=0.16` despite higher alpha).  
  **PROMOTE:** Perceptual elevation inconsistencies should be resolved.  
  **Actor:** implementer
- **M1:** `--voice-muted-fill` contrast is below the 3:1 non-text contrast floor.  
  **KEEP DEFERRED:** Muted states are intentionally low-contrast to signify inactivity.
- **M2:** The header comment's exemplar token (`--provider-warning-border`) does not exist.  
  **PROMOTE:** Trivial documentation drift that should be corrected.  
  **Actor:** implementer
- **M4:** The provider family is the only one with a mixed suffix convention.  
  **KEEP DEFERRED:** Low-value stylistic refactor.
- **M5:** The token layer is implicitly dark-only.  
  **KEEP DEFERRED:** Light mode is outside the scope of V1.

### Task 18: `SESSION_SECRET` front door closed
**PASS**  
Commit `04aa2b2` correctly documents in `README.md` that `SESSION_SECRET` requires a minimum of 32 characters, and provides the necessary `openssl rand -base64 32` command to generate it.  
**Actor:** owner

---

## Observations (Unverified Items)

The following items cannot be checked via static review and are therefore not treated as actionable findings:

- **CI has never been observed going red on this branch's gates (Task 15):** The pipeline has not been pushed to verify that it actually fails when the new E2E or hardening gates are broken.
- **The Electron app has never been launched and visually checked (Task 14, R28):** While static analysis indicates the CSP does not block anything, `npm run native:desktop:dev` completely disables CSP. The packaged production app must be launched manually to verify that no runtime assets are blocked.
