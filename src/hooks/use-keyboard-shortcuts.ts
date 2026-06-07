import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardShortcuts } from "@/lib/cockpit-store";

export type ShortcutCallbacks = {
  onNewThread?: () => void;
  onSendMessage?: () => void;
  onStopGeneration?: () => void;
  onCloseDrawer?: () => void;
  isStreaming?: boolean;
  drawerOpen?: boolean;
};

export function useKeyboardShortcuts(
  callbacks: ShortcutCallbacks = {},
  config?: KeyboardShortcuts,
) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);

  const enabled = useMemo(
    () =>
      config?.enabled ?? {
        commandPalette: true,
        newThread: true,
        sendMessage: true,
        help: true,
        escapeActions: true,
      },
    [config?.enabled],
  );

  const isMac =
    typeof navigator !== "undefined"
      ? (navigator.platform?.toUpperCase().includes("MAC") ?? false)
      : false;

  const useCtrl = config?.forceCtrl ?? false;
  const mod = useCallback(
    (e: KeyboardEvent) => (isMac && !useCtrl ? e.metaKey : e.ctrlKey),
    [isMac, useCtrl],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const modifier = mod(e);

      // Cmd/Ctrl+K → Command palette
      if (enabled.commandPalette && modifier && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Cmd/Ctrl+N → New thread
      if (enabled.newThread && modifier && e.key === "n") {
        e.preventDefault();
        callbacks.onNewThread?.();
        return;
      }

      // Cmd/Ctrl+Enter → Send message
      if (enabled.sendMessage && modifier && e.key === "Enter") {
        e.preventDefault();
        callbacks.onSendMessage?.();
        return;
      }

      // Cmd/Ctrl+/ → Keyboard shortcut help overlay
      if (enabled.help && modifier && e.key === "/") {
        e.preventDefault();
        setShortcutHelpOpen((prev) => !prev);
        return;
      }

      // Escape → Stop generation OR close drawer
      if (enabled.escapeActions && e.key === "Escape") {
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
    [mod, callbacks, commandPaletteOpen, shortcutHelpOpen, enabled],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const displayMod = isMac && !useCtrl ? "⌘" : "Ctrl";

  return {
    commandPaletteOpen,
    setCommandPaletteOpen,
    shortcutHelpOpen,
    setShortcutHelpOpen,
    displayMod,
  };
}
