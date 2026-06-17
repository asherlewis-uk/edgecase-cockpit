import { deriveInitials, useStore, store, PROVIDERS } from "@/lib/cockpit-store";
import { getProvider } from "@/lib/providers";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useNavigate } from "@tanstack/react-router";
import { ProviderStatus } from "@/components/cockpit/ProviderStatus";
import {
  Pencil,
  Search,
  Image as ImgIcon,
  Video,
  LayoutGrid,
  Boxes,
  FileText,
  Settings as SettingsIcon,
  Trash2,
  X,
  Pin,
} from "lucide-react";
import { AccountMenu } from "@/components/cockpit/AccountMenu";
import { useRef, useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenSettings: () => void;
};

const navItems = [
  { id: "new", label: "New chat", icon: Pencil, active: true },
  { id: "search", label: "Search chats", icon: Search },
  { id: "images", label: "Images", icon: ImgIcon },
  { id: "videos", label: "Videos", icon: Video },
  { id: "library", label: "Library", icon: LayoutGrid },
  { id: "providers", label: "Providers", icon: Boxes },
];

export function Drawer({ open, onOpenChange, onOpenSettings }: Props) {
  const threads = useStore((s) => s.threads);
  const settings = useStore((s) => s.settings);
  const active = useStore((s) => s.activeThreadId);
  const [filter, setFilter] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const navigate = useNavigate();
  const filterRef = useRef<HTMLInputElement>(null);

  const filtered = threads.filter((t) => t.title.toLowerCase().includes(filter.toLowerCase()));
  const pinned = settings.pinnedProviderIds
    .map((id) => PROVIDERS.find((p) => p.id === id))
    .filter((p): p is (typeof PROVIDERS)[number] => !!p);
  const activeProvider = getProvider(settings.activeProviderId);
  const assistantName = settings.personalization.assistantName.trim() || "Cockpit";
  const displayName = settings.profile.displayName || "User";
  const initials = settings.profile.initials || deriveInitials(displayName);
  const profileContext = settings.profile.roleLabel
    ? `${settings.profile.roleLabel} · ${activeProvider.name}`
    : activeProvider.name;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[88vw] max-w-[420px] border-0 bg-black p-0 text-white [&>button]:hidden"
      >
        <SheetHeader className="flex flex-row items-center justify-between px-6 pb-2 pt-6">
          <SheetTitle className="text-2xl font-normal tracking-tight text-white">
            {assistantName}
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
                    setSearchActive(false);
                    setFilter("");
                  }
                  if (it.id === "providers") navigate({ to: "/settings" });
                  if (it.id === "images") navigate({ to: "/images" });
                  if (it.id === "videos") navigate({ to: "/videos" });
                  if (it.id === "library") navigate({ to: "/library" });
                  if (it.id === "search") {
                    setSearchActive(true);
                    window.requestAnimationFrame(() => {
                      filterRef.current?.focus();
                      filterRef.current?.scrollIntoView({ block: "center" });
                    });
                    return; // keep drawer open
                  }
                  onOpenChange(false);
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
            <div className="px-5 pb-1 text-sm text-white/45">Pinned providers</div>
            <div className="flex flex-col gap-1">
              {pinned.map((p) => {
                const isActive = settings.activeProviderId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      store.setActiveProvider(p.id);
                      onOpenChange(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-full px-5 py-2.5 text-left transition ${
                      isActive ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <span
                      className={`grid size-7 place-items-center rounded-full bg-gradient-to-br text-[10px] font-semibold text-black ${p.accent}`}
                    >
                      {p.badge}
                    </span>
                    <span className="text-[15px] text-white/90">{p.name}</span>
                    <Pin className="ml-auto size-3.5 text-amber-300" strokeWidth={1.8} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="px-3 pt-6">
          <div className="flex items-center justify-between px-5 pb-1">
            <div className="text-sm text-white/45">{searchActive ? "Search chats" : "Recent"}</div>
            {searchActive && filter && (
              <button
                onClick={() => setFilter("")}
                className="text-xs text-white/45 hover:text-white/80"
                aria-label="Clear chat search"
              >
                Clear
              </button>
            )}
          </div>
          <input
            ref={filterRef}
            value={filter}
            onFocus={() => setSearchActive(true)}
            onChange={(e) => {
              setSearchActive(true);
              setFilter(e.target.value);
            }}
            placeholder={searchActive ? "Search chats…" : "Filter recent…"}
            className="mb-2 w-full rounded-full bg-white/[0.04] px-5 py-2 text-sm text-white/90 placeholder:text-white/30 focus:outline-none"
          />
          <div className="max-h-[40vh] overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-5 py-3 text-sm text-white/40">
                {threads.length === 0 ? "No chats yet." : "No matching chats."}
              </div>
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
                    navigate({ to: "/thread/$id", params: { id: t.id } });
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
          <div className="mb-3">
            <ProviderStatus
              variant="bar"
              onOpenSettings={() => {
                onOpenChange(false);
                onOpenSettings();
              }}
            />
          </div>
          <AccountMenu variant="drawer" onAction={() => onOpenChange(false)} />
          <button
            onClick={() => {
              onOpenChange(false);
              navigate({ to: "/settings" });
            }}
            className="mt-3 grid w-full place-items-center rounded-full border border-white/10 bg-white/[0.03] py-2 text-sm text-white/70 transition hover:bg-white/10"
            aria-label="Open settings page"
          >
            <SettingsIcon className="mr-2 inline size-4" strokeWidth={1.6} />
            Open settings
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
