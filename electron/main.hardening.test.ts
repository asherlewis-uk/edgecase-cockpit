import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const main = readFileSync(resolve(__dirname, "./main.ts"), "utf8");
const preload = readFileSync(resolve(__dirname, "./preload.cjs"), "utf8");

describe("electron hardening", () => {
  it("isolates the renderer from Node", () => {
    expect(main).toMatch(/contextIsolation:\s*true/);
    expect(main).toMatch(/nodeIntegration:\s*false/);
  });

  it("sets sandbox and webSecurity explicitly rather than relying on defaults", () => {
    expect(main).toMatch(/sandbox:\s*true/);
    expect(main).toMatch(/webSecurity:\s*true/);
  });

  it("sets a Content-Security-Policy on renderer responses", () => {
    expect(main).toMatch(/Content-Security-Policy/);
    expect(main).toMatch(/default-src\s+'self'/);
  });

  it("denies renderer-initiated navigation away from the app origin", () => {
    expect(main).toMatch(/will-navigate/);
  });

  it("opens external links in the system browser, never in-app", () => {
    expect(main).toMatch(/setWindowOpenHandler/);
    expect(main).toMatch(/action:\s*"deny"/);
  });

  it("exposes no bridged API surface from the preload", () => {
    // The preload's explanatory comment mentions exposeInMainWorld as a
    // future possibility; strip comments so the assertion tests code, not prose.
    const stripComments = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const preloadCode = stripComments(preload);

    expect(preloadCode).not.toMatch(/exposeInMainWorld/);
    expect(preloadCode).not.toMatch(/ipcRenderer/);
  });

  it("scopes the CORS header interceptor to known local provider ports", () => {
    expect(main).toMatch(/LOCAL_PROVIDER_PORTS/);
    expect(main, "the interceptor must never match <all_urls>").not.toMatch(/<all_urls>/);
  });
});
