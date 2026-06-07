import { useCallback, useEffect, useState } from "react";

export type ShortcutCallbacks = {
  onNewThread?: () => void;
  onSendMessage?: () => void;
  onStopGeneration?: () => void;
  onCloseDrawer?: () => void;
  isStreaming?: boolean;
  drawerOpen?: boolean;
};

export function useKeyboardShortcuts(callbacks: ShortcutCallbacks = {}) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);

  const isMac =
    typeof navigator !== "undefined"
      ? (navigator.platform?.toUpperCase().includes("MAC") ?? false)
      : false;

  const mod = useCallback((e: KeyboardEvent) => (isMac ? e.metaKey : e.ctrlKey), [isMac]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const modifier = mod(e);

      // Cmd/Ctrl+K → Command palette
      if (modifier && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Cmd/Ctrl+N → New thread
      if (modifier && e.key === "n") {
        e.preventDefault();
        callbacks.onNewThread?.();
        return;
      }

      // Cmd/Ctrl+Enter → Send message
      if (modifier && e.key === "Enter") {
        e.preventDefault();
        callbacks.onSendMessage?.();
        return;
      }

      // Cmd/Ctrl+/ → Keyboard shortcut help overlay
      if (modifier && e.key === "/") {
        e.preventDefault();
        setShortcutHelpOpen((prev) => !prev);
        return;
      }

      // Escape → Stop generation OR close drawer
      if (e.key === "Escape") {
        // Don't interfere with other Escape handlers
        if (callbacks.isStreaming) {
          e.preventDefault();
          callbacks.onStopGeneration?.();
          return;
        }
        if (callbacks.drawerOpen) {
          e.preventDefault();
          callbacks.onCloseDrawer?.();
          return;
        }
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
          return;
        }
        if (shortcutHelpOpen) {
          setShortcutHelpOpen(false);
          return;
        }
      }
    },
    [mod, callbacks, commandPaletteOpen, shortcutHelpOpen],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const displayMod = isMac ? "⌘" : "Ctrl";

  return {
    commandPaletteOpen,
    setCommandPaletteOpen,
    shortcutHelpOpen,
    setShortcutHelpOpen,
    displayMod,
  };
}
