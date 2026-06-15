import { describe, it, expect, beforeEach, vi } from "vitest";
import { store, defaultSettings } from "./cockpit-store";
import { __resetHydration } from "./cockpit-store";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

describe("cockpit-store onboarding state", () => {
  beforeEach(() => {
    __resetHydration();
    // Clear localStorage before each test
    window.localStorage.clear();
    // Reset to default state
    store.updateSettings(defaultSettings);
  });

  it("should initialize with onboardingCompleted as false", () => {
    const state = store.getState();
    expect(state.settings.onboardingCompleted).toBe(false);
  });

  it("should complete onboarding", () => {
    store.completeOnboarding();
    const state = store.getState();
    expect(state.settings.onboardingCompleted).toBe(true);
  });

  it("should skip onboarding", () => {
    store.skipOnboarding();
    const state = store.getState();
    expect(state.settings.onboardingCompleted).toBe(true);
  });

  it("should reset onboarding", () => {
    // First complete onboarding
    store.completeOnboarding();
    let state = store.getState();
    expect(state.settings.onboardingCompleted).toBe(true);

    // Then reset
    store.resetOnboarding();
    state = store.getState();
    expect(state.settings.onboardingCompleted).toBe(false);
  });

  it("should persist completeOnboarding state after reload", () => {
    store.completeOnboarding();
    const state1 = store.getState();
    expect(state1.settings.onboardingCompleted).toBe(true);

    // Simulate page reload by resetting hydration and reading from localStorage
    __resetHydration();
    const state2 = store.getState();
    expect(state2.settings.onboardingCompleted).toBe(true);
  });

  it("should persist skipOnboarding state after reload", () => {
    store.skipOnboarding();
    const state1 = store.getState();
    expect(state1.settings.onboardingCompleted).toBe(true);

    // Simulate page reload by resetting hydration and reading from localStorage
    __resetHydration();
    const state2 = store.getState();
    expect(state2.settings.onboardingCompleted).toBe(true);
  });
});
