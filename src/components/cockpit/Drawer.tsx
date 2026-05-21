import { useStore, store } from "@/lib/cockpit-store";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Pencil,
  Search,
  Gem,
  Plus,
  FileText,
  Settings as SettingsIcon,
  Trash2,
  X,
  Pin,
} from "lucide-react";
import { useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenSettings: () => void;
};

const navItems = [
  { id: "new", label: "New chat", icon: Pencil, active: true },
  { id: "search", label: "Search chats", icon: Search },
  { id: "gems", label: "Endpoints", icon: Gem },
];

export function Drawer({ open, onOpenChange, onOpenSettings }: Props) {
  const threads = useStore((s) => s.threads);
  const settings = useStore((s) => s.settings);
  const active = useStore((s) => s.activeThreadId);
  const [filter, setFilter] = useState("");

  const filtered = threads.filter((t) =>
    t.title.toLowerCase().includes(filter.toLowerCase()),
  );
  const pinned = settings.endpoints.filter((e) => e.pinned);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[88vw] max-w-[420px] border-0 bg-black p-0 text-white [&>button]:hidden"
      >
        <SheetHeader className="flex flex-row items-center justify-between px-6 pb-2 pt-6">
          <SheetTitle className="text-2xl font-normal tracking-tight text-white">
            Cockpit
          </SheetTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="grid size-10 place-items-center rounded-full bg-white/[0.06] text-white/80 transition hover:bg-white/[0.12]"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </SheetHeader>

        <nav className="flex flex-col gap-1 px-3 pt-4">
          {navItems.map((it) => {
            const Icon = it.icon;
            const isNew = it.id === "new";
            return (
              <button
                key={it.id}
                onClick={() => {
                  if (it.id === "new") {
                    store.newThread();
                    onOpenChange(false);
                  }
                  if (it.id === "gems") {
                    onOpenChange(false);
                    onOpenSettings();
                  }
                }}
                className={`flex w-full items-center gap-5 rounded-full px-5 py-3.5 text-left text-[17px] transition ${
                  isNew ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
                }`}
              >
                <Icon className="size-[22px] shrink-0 text-white/85" strokeWidth={1.6} />
                <span className="text-white/95">{it.label}</span>
              </button>
            );
          })}
        </nav>

        {pinned.length > 0 && (
          <div className="px-3 pt-5">
            <div className="px-5 pb-1 text-sm text-white/45">Pinned endpoints</div>
            <div className="flex flex-col gap-1">
              {pinned.map((e) => {
                const isDefault = settings.defaultEndpointId === e.id;
                return (
                  <button
                    key={e.id}
                    onClick={() => {
                      store.updateSettings({ defaultEndpointId: e.id });
                      onOpenChange(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-full px-5 py-2.5 text-left transition ${
                      isDefault ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <Pin className="size-4 shrink-0 text-amber-300" strokeWidth={1.8} />
                    <span className="text-[15px] text-white/90">{e.label}</span>
                    <span className="ml-auto truncate text-xs text-white/40">
                      {e.method} · {e.path}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="px-3 pt-6">
          <div className="px-5 pb-1 text-sm text-white/45">Recent</div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter recent…"
            className="mb-2 w-full rounded-full bg-white/[0.04] px-5 py-2 text-sm text-white/90 placeholder:text-white/30 focus:outline-none"
          />
          <div className="max-h-[40vh] overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-5 py-3 text-sm text-white/40">No chats yet.</div>
            )}
            {filtered.map((t) => (
              <div
                key={t.id}
                className={`group flex items-center gap-3 rounded-full px-3 py-2 transition ${
                  active === t.id ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
                }`}
              >
                <FileText className="ml-2 size-4 shrink-0 text-white/60" strokeWidth={1.6} />
                <button
                  onClick={() => {
                    store.selectThread(t.id);
                    onOpenChange(false);
                  }}
                  className="flex-1 truncate text-left text-[15px] text-white/85"
                >
                  {t.title || "Untitled"}
                </button>
                <button
                  onClick={() => store.deleteThread(t.id)}
                  className="opacity-0 transition group-hover:opacity-100"
                  aria-label="Delete thread"
                >
                  <Trash2 className="size-4 text-white/50 hover:text-white/90" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 border-t border-white/5 bg-black px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-rose-400 via-amber-400 to-emerald-400 text-sm font-semibold text-black">
              {(settings.userName || "U").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="text-[15px] text-white/95">{settings.userName || "User"}</div>
              <div className="text-xs text-white/45">Cockpit · /v1</div>
            </div>
            <button
              onClick={() => {
                onOpenChange(false);
                onOpenSettings();
              }}
              className="grid size-10 place-items-center rounded-full text-white/70 transition hover:bg-white/10"
              aria-label="Settings"
            >
              <SettingsIcon className="size-5" strokeWidth={1.6} />
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export const __unused = { Plus };