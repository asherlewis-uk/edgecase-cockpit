import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Search,
  MessageSquare,
  Boxes,
  Settings,
  Keyboard,
  FileText,
  Image as ImgIcon,
  Video,
  LayoutGrid,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { store, useStore, PROVIDERS } from "@/lib/cockpit-store";
import type { ProviderDef } from "@/lib/providers";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenShortcutHelp: () => void;
  displayMod: string;
};

export function CommandPalette({ open, onOpenChange, onOpenShortcutHelp, displayMod }: Props) {
  const navigate = useNavigate();
  const threads = useStore((s) => s.threads);
  const settings = useStore((s) => s.settings);
  const activeThreadId = useStore((s) => s.activeThreadId);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filteredThreads = query
    ? threads.filter((t) => t.title.toLowerCase().includes(query.toLowerCase()) && !t.temporary)
    : [];

  const filteredProviders = query
    ? PROVIDERS.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.id.toLowerCase().includes(query.toLowerCase()),
      )
    : [];

  const showThreads = filteredThreads.length > 0;
  const showProviders = filteredProviders.length > 0;
  const showActions = !query || query.length < 3 || (!showThreads && !showProviders);

  function selectThread(id: string) {
    store.selectThread(id);
    onOpenChange(false);
  }

  function selectProvider(id: string) {
    store.setActiveProvider(id);
    onOpenChange(false);
  }

  function newThread() {
    store.newThread();
    onOpenChange(false);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Type a command or search…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {showThreads && (
          <CommandGroup heading="Threads">
            {filteredThreads.slice(0, 8).map((t) => (
              <CommandItem key={t.id} value={t.title} onSelect={() => selectThread(t.id)}>
                <MessageSquare className="size-4 text-white/60" />
                <span className="truncate">{t.title}</span>
                {t.id === activeThreadId && (
                  <span className="ml-auto text-[10px] text-emerald-400">Active</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {showProviders && (
          <CommandGroup heading="Providers">
            {filteredProviders.map((p) => (
              <CommandItem
                key={p.id}
                value={`provider ${p.name}`}
                onSelect={() => selectProvider(p.id)}
              >
                <span
                  className={`grid size-5 place-items-center rounded-full bg-gradient-to-br text-[9px] font-semibold text-black ${p.accent}`}
                >
                  {p.badge}
                </span>
                <span>{p.name}</span>
                {p.id === settings.activeProviderId && (
                  <span className="ml-auto text-[10px] text-emerald-400">Active</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(showThreads || showProviders) && showActions && <CommandSeparator />}

        {showActions && (
          <CommandGroup heading="Actions">
            <CommandItem onSelect={newThread}>
              <MessageSquare className="size-4 text-white/60" />
              <span>New Thread</span>
              <CommandShortcut>{displayMod}N</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                navigate({ to: "/settings" });
                onOpenChange(false);
              }}
            >
              <Settings className="size-4 text-white/60" />
              <span>Settings</span>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                navigate({ to: "/library" });
                onOpenChange(false);
              }}
            >
              <LayoutGrid className="size-4 text-white/60" />
              <span>Library</span>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                navigate({ to: "/images" });
                onOpenChange(false);
              }}
            >
              <ImgIcon className="size-4 text-white/60" />
              <span>Images</span>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                navigate({ to: "/videos" });
                onOpenChange(false);
              }}
            >
              <Video className="size-4 text-white/60" />
              <span>Videos</span>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                onOpenShortcutHelp();
              }}
            >
              <Keyboard className="size-4 text-white/60" />
              <span>Keyboard Shortcuts</span>
              <CommandShortcut>{displayMod}/</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
