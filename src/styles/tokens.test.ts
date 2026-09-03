import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Comments are stripped before every match in this file. A bare substring
 * assertion over raw CSS is satisfied by a comment, so `toContain("--foo")`
 * passes against a stylesheet where `--foo` was deleted and only the prose
 * mentioning it survived. Match the declarations, never the documentation.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The body of the first block whose header matches, brace-balanced. */
function blockBody(source: string, header: RegExp): string | null {
  const match = header.exec(source);
  if (!match) return null;
  const open = source.indexOf("{", match.index);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

const tokensCss = stripComments(readFileSync(resolve(__dirname, "./tokens.css"), "utf8"));
const stylesCss = stripComments(readFileSync(resolve(__dirname, "../styles.css"), "utf8"));

/**
 * The token families from docs/product-direction.md §5. This test is the visual
 * contract: docs/product-direction.md says token names describe product
 * semantics first and raw color second, so each family is asserted by its
 * semantic prefix rather than by any specific color value.
 */
const REQUIRED_FAMILIES: Array<[string, string[]]> = [
  ["base canvas", ["--canvas-void", "--canvas-gradient-from", "--canvas-gradient-to"]],
  [
    "translucent surface",
    [
      "--surface-shell-background",
      "--surface-prompt-background",
      "--surface-sidebar-background",
      "--surface-modal-background",
      "--surface-overlay-scrim",
    ],
  ],
  [
    "elevated panel",
    ["--panel-card-background", "--panel-menu-background", "--panel-input-background"],
  ],
  ["border and hairline", ["--hairline-subtle", "--hairline-edge-highlight", "--hairline-card"]],
  ["glow and accent", ["--glow-ambient", "--glow-accent", "--glow-hover"]],
  [
    "provider status",
    [
      "--provider-active-fill",
      "--provider-inactive-fill",
      "--provider-unavailable-fill",
      "--provider-missing-credentials-border",
      "--provider-local-ready-fill",
      "--provider-cloud-ready-fill",
    ],
  ],
  [
    "severity",
    [
      "--warning-text",
      "--warning-border",
      "--warning-fill",
      "--error-text",
      "--error-border",
      "--error-fill",
      "--success-text",
      "--success-border",
      "--success-fill",
    ],
  ],
  ["focus", ["--focus-ring", "--focus-screenshot-ring", "--focus-hover-ring"]],
  [
    "voice state",
    [
      "--voice-idle-fill",
      "--voice-listening-fill",
      "--voice-recording-fill",
      "--voice-transcribing-fill",
      "--voice-sending-fill",
      "--voice-muted-fill",
      "--voice-unavailable-fill",
    ],
  ],
  [
    "media state",
    [
      "--media-empty-fill",
      "--media-attached-fill",
      "--media-uploading-fill",
      "--media-processing-fill",
      "--media-generated-fill",
      "--media-failed-fill",
      "--media-selected-fill",
    ],
  ],
  [
    "motion and easing",
    [
      "--motion-sidebar-slide",
      "--motion-backdrop-fade",
      "--motion-hover",
      "--motion-status",
      "--motion-voice-cycle",
    ],
  ],
  [
    "blur and saturation",
    ["--blur-backdrop", "--blur-surface", "--blur-elevated", "--saturate-ambient"],
  ],
];

/**
 * Derived from REQUIRED_FAMILIES rather than restated, so a motion token added
 * to the family above cannot escape the reduced-motion check below.
 */
const MOTION_TOKENS = REQUIRED_FAMILIES.find(([family]) => family === "motion and easing")?.[1];

/**
 * Every product-direction token registered in styles.css `@theme inline`, and
 * the token it must resolve to. Tailwind derives an entire utility set from one
 * `--color-*` variable, so each severity role is registered twice: the bare name
 * carries the readable foreground (`text-warning`) and `-fill` carries the
 * 12%-alpha wash (`bg-warning-fill`). Registering the wash under the bare name
 * is what made `text-warning` render at 2.0:1 over --canvas-void: invisible.
 */
const THEME_REGISTRATIONS: Array<[string, string]> = [
  ["--color-provider-active", "--provider-active-fill"],
  ["--color-provider-unavailable", "--provider-unavailable-fill"],
  ["--color-provider-local-ready", "--provider-local-ready-fill"],
  ["--color-provider-cloud-ready", "--provider-cloud-ready-fill"],
  ["--color-warning", "--warning-text"],
  ["--color-warning-fill", "--warning-fill"],
  ["--color-error", "--error-text"],
  ["--color-error-fill", "--error-fill"],
  ["--color-success", "--success-text"],
  ["--color-success-fill", "--success-fill"],
];

describe("design tokens", () => {
  for (const [family, tokens] of REQUIRED_FAMILIES) {
    it(`declares the ${family} family`, () => {
      const missing = tokens.filter((t) => !tokensCss.includes(`${t}:`));
      expect(missing, `missing ${family} tokens`).toEqual([]);
    });
  }

  it("keeps the reduce-motion escape hatch", () => {
    const reduced = blockBody(tokensCss, /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/);
    expect(reduced, "no @media (prefers-reduced-motion: reduce) block").not.toBeNull();

    expect(MOTION_TOKENS, "the motion family disappeared from REQUIRED_FAMILIES").toBeDefined();
    const notZeroed = (MOTION_TOKENS ?? []).filter(
      (token) => !new RegExp(`${token}\\s*:\\s*0m?s\\s*;`).test(reduced ?? ""),
    );
    expect(notZeroed, "motion tokens not re-declared to 0ms under reduced motion").toEqual([]);
  });
});

describe("design token wiring", () => {
  it("imports the token layer into the app stylesheet", () => {
    expect(stylesCss).toMatch(/@import\s+["']\.\/styles\/tokens\.css["']\s*;/);
  });

  it("registers each product-direction token under a usable utility name", () => {
    const theme = blockBody(stylesCss, /@theme\s+inline/);
    expect(theme, "no @theme inline block").not.toBeNull();

    const unregistered = THEME_REGISTRATIONS.filter(
      ([utility, token]) =>
        !new RegExp(`${utility}\\s*:\\s*var\\(\\s*${token}\\s*\\)\\s*;`).test(theme ?? ""),
    ).map(([utility, token]) => `${utility} -> var(${token})`);
    expect(unregistered, "registrations missing or pointing at the wrong token").toEqual([]);
  });

  it("registers only tokens the layer actually declares", () => {
    const dangling = THEME_REGISTRATIONS.map(([, token]) => token).filter(
      (token) => !tokensCss.includes(`${token}:`),
    );
    expect(dangling, "registrations pointing at tokens that do not exist").toEqual([]);
  });
});
