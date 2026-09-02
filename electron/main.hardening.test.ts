import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const main = readFileSync(resolve(__dirname, "./main.ts"), "utf8");
const preload = readFileSync(resolve(__dirname, "./preload.cjs"), "utf8");

// Strip comments before matching so posture assertions test code, not prose.
// A comment that merely mentions a flag (e.g. the CSP comment in main.ts) must
// not satisfy a positive assertion, and a flip to false with a reassuring
// comment left behind must not survive the negative assertions either.
// The stripper is string-aware: URL patterns like `http://localhost:${port}/*`
// and "app://*/*" contain literal `/*`/`//` inside string literals, which must
// not be mistaken for comments.
const stripComments = (s: string): string => {
  let out = "";
  let i = 0;
  let quote: "'" | '"' | "`" | null = null;
  while (i < s.length) {
    const c = s[i];
    const next = s[i + 1];
    if (quote) {
      out += c;
      if (c === "\\" && next !== undefined) {
        out += next;
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < s.length && s[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
};
const mainCode = stripComments(main);
const preloadCode = stripComments(preload);

describe("electron hardening", () => {
  it("isolates the renderer from Node", () => {
    expect(mainCode).toMatch(/contextIsolation:\s*true/);
    expect(mainCode).toMatch(/nodeIntegration:\s*false/);
    expect(mainCode).not.toMatch(/contextIsolation:\s*false/);
    expect(mainCode).not.toMatch(/nodeIntegration:\s*true/);
  });

  it("sets sandbox and webSecurity explicitly rather than relying on defaults", () => {
    expect(mainCode).toMatch(/sandbox:\s*true/);
    expect(mainCode).toMatch(/webSecurity:\s*true/);
    expect(mainCode).not.toMatch(/sandbox:\s*false/);
    expect(mainCode).not.toMatch(/webSecurity:\s*false/);
  });

  it("sets a Content-Security-Policy on renderer responses", () => {
    expect(mainCode).toMatch(/Content-Security-Policy/);
    expect(mainCode).toMatch(/default-src\s+'self'/);
  });

  it("denies renderer-initiated navigation away from the app origin", () => {
    expect(mainCode).toMatch(/will-navigate/);
  });

  it("opens external links in the system browser, never in-app", () => {
    expect(mainCode).toMatch(/setWindowOpenHandler/);
    expect(mainCode).toMatch(/action:\s*"deny"/);
  });

  it("exposes no bridged API surface from the preload", () => {
    // The preload's explanatory comment mentions exposeInMainWorld as a
    // future possibility; stripComments above removes it so the assertion
    // tests code, not prose.
    expect(preloadCode).not.toMatch(/exposeInMainWorld/);
    expect(preloadCode).not.toMatch(/ipcRenderer/);
  });

  it("scopes the CORS header interceptor to known local provider ports", () => {
    expect(mainCode).toMatch(/LOCAL_PROVIDER_PORTS/);
    expect(mainCode, "the interceptor must never match <all_urls>").not.toMatch(/<all_urls>/);
  });
});
