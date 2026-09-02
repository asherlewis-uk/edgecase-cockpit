import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "./tokens.css"), "utf8");

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

describe("design tokens", () => {
  for (const [family, tokens] of REQUIRED_FAMILIES) {
    it(`declares the ${family} family`, () => {
      const missing = tokens.filter((t) => !css.includes(`${t}:`));
      expect(missing, `missing ${family} tokens`).toEqual([]);
    });
  }

  it("keeps the reduce-motion escape hatch", () => {
    expect(css).toContain("prefers-reduced-motion");
  });
});
