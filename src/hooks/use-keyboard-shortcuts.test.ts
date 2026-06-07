import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

describe("useKeyboardShortcuts", () => {
  const callbacks = {
    onNewThread: vi.fn(),
    onSendMessage: vi.fn(),
    onStopGeneration: vi.fn(),
    onCloseDrawer: vi.fn(),
    isStreaming: false,
    drawerOpen: false,
  };

  beforeEach(() => {
    vi.stubGlobal(
      "navigator",
      { platform: "MacIntel" }, // Default to Mac for tests
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function fireKey(
    key: string,
    options?: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean },
  ) {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...(options ?? {}),
    });
    window.dispatchEvent(event);
    return event;
  }

  it("returns initial state", () => {
    const { result } = renderHook(() => useKeyboardShortcuts());
    expect(result.current.commandPaletteOpen).toBe(false);
    expect(result.current.shortcutHelpOpen).toBe(false);
    expect(result.current.displayMod).toBe("⌘");
  });

  it("uses Ctrl on non-Mac platforms", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("navigator", { platform: "Win32" });
    const { result } = renderHook(() => useKeyboardShortcuts());
    expect(result.current.displayMod).toBe("Ctrl");
  });

  it("toggles command palette on Cmd+K / Ctrl+K", () => {
    const { result } = renderHook(() => useKeyboardShortcuts());

    act(() => {
      fireKey("k", { metaKey: true });
    });
    expect(result.current.commandPaletteOpen).toBe(true);

    act(() => {
      fireKey("k", { metaKey: true });
    });
    expect(result.current.commandPaletteOpen).toBe(false);
  });

  it("calls onNewThread on Cmd+N / Ctrl+N", () => {
    renderHook(() => useKeyboardShortcuts(callbacks));

    act(() => {
      fireKey("n", { metaKey: true });
    });
    expect(callbacks.onNewThread).toHaveBeenCalledTimes(1);
  });

  it("calls onSendMessage on Cmd+Enter / Ctrl+Enter", () => {
    renderHook(() => useKeyboardShortcuts(callbacks));

    act(() => {
      fireKey("Enter", { metaKey: true });
    });
    expect(callbacks.onSendMessage).toHaveBeenCalledTimes(1);
  });

  it("toggles shortcut help on Cmd+/ / Ctrl+/", () => {
    const { result } = renderHook(() => useKeyboardShortcuts());

    act(() => {
      fireKey("/", { metaKey: true });
    });
    expect(result.current.shortcutHelpOpen).toBe(true);

    act(() => {
      fireKey("/", { metaKey: true });
    });
    expect(result.current.shortcutHelpOpen).toBe(false);
  });

  it("calls onStopGeneration on Escape when streaming", () => {
    renderHook(() => useKeyboardShortcuts({ ...callbacks, isStreaming: true }));

    act(() => {
      fireKey("Escape");
    });
    expect(callbacks.onStopGeneration).toHaveBeenCalledTimes(1);
  });

  it("calls onCloseDrawer on Escape when drawer is open", () => {
    renderHook(() => useKeyboardShortcuts({ ...callbacks, isStreaming: false, drawerOpen: true }));

    act(() => {
      fireKey("Escape");
    });
    expect(callbacks.onCloseDrawer).toHaveBeenCalledTimes(1);
  });

  it("closes command palette on Escape when open", () => {
    const { result } = renderHook(() => useKeyboardShortcuts(callbacks));

    act(() => {
      fireKey("k", { metaKey: true });
    });
    expect(result.current.commandPaletteOpen).toBe(true);

    act(() => {
      fireKey("Escape");
    });
    expect(result.current.commandPaletteOpen).toBe(false);
  });

  it("closes shortcut help on Escape when open", () => {
    const { result } = renderHook(() => useKeyboardShortcuts(callbacks));

    act(() => {
      fireKey("/", { metaKey: true });
    });
    expect(result.current.shortcutHelpOpen).toBe(true);

    act(() => {
      fireKey("Escape");
    });
    expect(result.current.shortcutHelpOpen).toBe(false);
  });

  it("prevents default for handled modifier shortcuts", () => {
    renderHook(() => useKeyboardShortcuts(callbacks));

    let event: KeyboardEvent;
    act(() => {
      event = fireKey("k", { metaKey: true });
    });
    expect(event!.defaultPrevented).toBe(true);
  });

  it("does not prevent default for unhandled keys", () => {
    renderHook(() => useKeyboardShortcuts(callbacks));

    const event = fireKey("x", { metaKey: true });
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not call callbacks when they are undefined", () => {
    const { result } = renderHook(() => useKeyboardShortcuts());

    act(() => {
      fireKey("n", { metaKey: true });
    });
    expect(result.current.commandPaletteOpen).toBe(false);
  });

  it("uses Ctrl key on Windows for shortcuts", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("navigator", { platform: "Win32" });
    renderHook(() => useKeyboardShortcuts(callbacks));

    act(() => {
      fireKey("k", { ctrlKey: true });
    });
    expect(callbacks.onNewThread).not.toHaveBeenCalled();
  });

  it("handles SSR where navigator is undefined", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("navigator", undefined);

    const { result } = renderHook(() => useKeyboardShortcuts());
    expect(result.current.displayMod).toBe("Ctrl");
  });
});
