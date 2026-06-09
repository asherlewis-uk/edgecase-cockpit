// Preload script runs in the renderer process with contextIsolation: true.
// It can expose safe Node.js APIs to the renderer via contextBridge, but
// this app's renderer talks only to the Cloudflare Worker API, so no
// bridge APIs are needed at this stage.
//
// Keep this file present — it is referenced in main.ts webPreferences.preload.
// Add contextBridge.exposeInMainWorld(...) here when/if native file-system
// or platform integration is needed (Phase 4+).

export {};
