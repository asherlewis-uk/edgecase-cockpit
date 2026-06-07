import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ShortcutEntry = {
  keys: string;
  description: string;
};

type ShortcutCategory = {
  name: string;
  shortcuts: ShortcutEntry[];
};

export function ShortcutHelp({
  open,
  onOpenChange,
  displayMod,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayMod: string;
}) {
  const categories: ShortcutCategory[] = [
    {
      name: "Navigation",
      shortcuts: [
        { keys: `${displayMod} K`, description: "Command palette" },
        { keys: `${displayMod} N`, description: "New thread" },
        { keys: `${displayMod} /`, description: "Keyboard shortcuts help" },
        { keys: "Escape", description: "Close drawer or stop generation" },
      ],
    },
    {
      name: "Chat",
      shortcuts: [
        { keys: "Enter", description: "Send message" },
        { keys: `${displayMod} Enter`, description: "Send message (anywhere)" },
        { keys: "Shift Enter", description: "New line" },
        { keys: "Escape", description: "Stop generating" },
      ],
    },
    {
      name: "General",
      shortcuts: [
        { keys: `${displayMod} C`, description: "Copy" },
        { keys: `${displayMod} V`, description: "Paste" },
        { keys: "Tab", description: "Next field" },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-zinc-950 text-white sm:rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium text-white">Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {categories.map((category) => (
            <div key={category.name}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-white/40">
                {category.name}
              </h3>
              <div className="space-y-1.5">
                {category.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.keys + shortcut.description}
                    className="flex items-center justify-between rounded-md px-3 py-2 text-sm"
                  >
                    <span className="text-white/80">{shortcut.description}</span>
                    <kbd className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/[0.06] px-2 py-0.5 text-xs text-white/70">
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
