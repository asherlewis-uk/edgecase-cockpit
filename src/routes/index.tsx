import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Menu,
  ChevronDown,
  SquarePen,
  Mic,
  AudioLines,
  Square,
  MoreHorizontal,
  Database,
  AlertCircle,
  Copy,
  RefreshCw,
  WifiOff,
  Clock,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { Sparkle } from "@/components/cockpit/Sparkle";
import { Drawer } from "@/components/cockpit/Drawer";
import { SettingsDialog } from "@/components/cockpit/SettingsDialog";
import {
  useStore,
  store,
  type Message,
  getEndpointStats,
  subscribeEndpointStats,
} from "@/lib/cockpit-store";
import { useChat } from "@/hooks/use-chat";
import { useSyncExternalStore } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cockpit — unified /v1 console" },
      {
        name: "description",
        content:
          "A bleeding-edge unbranded cockpit for any /v1 endpoint. Cacheable, labeled, instant.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const settings = useStore((s) => s.settings);
  useSyncExternalStore(
    subscribeEndpointStats,
    () => JSON.stringify(getEndpointStats()),
    () => "{}",
  );
  const stats = getEndpointStats();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeEndpointId, setActiveEndpointId] = useState<string>(
    settings.defaultEndpointId,
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isStreaming,
    error,
    sendMessage,
    stop,
    regenerate,
    retry,
    isOnline,
    queueSize,
    cooldownSeconds,
    isCoolingDown,
  } = useChat({
    endpointId: activeEndpointId,
    onAuthError: () => {
      toast.error("Invalid API key", {
        description: "Update your credentials in settings.",
      });
      setSettingsOpen(true);
    },
  });

  useEffect(() => {
    setActiveEndpointId(settings.defaultEndpointId);
  }, [settings.defaultEndpointId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, isStreaming]);

  const accentGrad: Record<string, string> = {
    indigo:
      "radial-gradient(ellipse 90% 60% at 50% 0%, rgba(76,99,255,0.55) 0%, rgba(20,24,55,0.55) 38%, rgba(0,0,0,1) 75%)",
    emerald:
      "radial-gradient(ellipse 90% 60% at 50% 0%, rgba(34,197,94,0.45) 0%, rgba(15,40,30,0.55) 38%, rgba(0,0,0,1) 75%)",
    rose: "radial-gradient(ellipse 90% 60% at 50% 0%, rgba(244,63,94,0.45) 0%, rgba(45,15,25,0.55) 38%, rgba(0,0,0,1) 75%)",
    amber:
      "radial-gradient(ellipse 90% 60% at 50% 0%, rgba(245,158,11,0.45) 0%, rgba(45,30,10,0.55) 38%, rgba(0,0,0,1) 75%)",
  };

  async function handleSend() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || isStreaming) return;
    if (isCoolingDown) return;
    setInput("");
    const a = attachments;
    setAttachments([]);
    await sendMessage(text, a);
  }

  async function ingestFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;
    const datas = await Promise.all(
      arr.map(
        (f) =>
          new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result as string);
            fr.onerror = reject;
            fr.readAsDataURL(f);
          }),
      ),
    );
    setAttachments((prev) => [...prev, ...datas].slice(0, 6));
  }

  const endpoint = settings.endpoints.find((e) => e.id === activeEndpointId);

  return (
    <div
      className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-black text-white"
      style={{ background: accentGrad[settings.accent] }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer?.files?.length) ingestFiles(e.dataTransfer.files);
      }}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-3 z-50 grid place-items-center rounded-3xl border-2 border-dashed border-white/40 bg-black/40 backdrop-blur">
          <p className="text-sm text-white/80">Drop images to attach</p>
        </div>
      )}
      {(!isOnline || queueSize > 0) && (
        <div className="relative z-20 mx-3 mt-2 flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs text-amber-100">
          <WifiOff className="size-3.5" />
          <span>
            {isOnline ? "Back online" : "You're offline"}
            {queueSize > 0 && ` — ${queueSize} queued`}
          </span>
        </div>
      )}
      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-3 pt-3">
        <button
          onClick={() => setDrawerOpen(true)}
          className="relative grid size-11 place-items-center rounded-full bg-white/[0.06] backdrop-blur transition hover:bg-white/[0.12]"
          aria-label="Open menu"
        >
          <Menu className="size-5 text-white/90" strokeWidth={1.8} />
          <span className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-sky-400" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full bg-white/[0.04] px-4 py-2.5 text-[15px] backdrop-blur transition hover:bg-white/[0.08]">
              <span className="font-medium text-white">Cockpit</span>
              <span className="text-white/55">
                {endpoint?.label ?? "endpoint"}
              </span>
              <ChevronDown className="size-4 text-white/70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="border-white/10 bg-zinc-950 text-white">
            {settings.endpoints.map((e) => (
              <DropdownMenuItem
                key={e.id}
                onClick={() => setActiveEndpointId(e.id)}
                className="gap-2 focus:bg-white/10"
              >
                <span className="font-medium">{e.label}</span>
                <span className="text-xs text-white/50">{e.path}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  {(stats[e.id]?.hits || stats[e.id]?.misses) ? (
                    <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums text-white/70">
                      <span className="text-emerald-300">{stats[e.id]?.hits ?? 0}</span>
                      <span className="text-white/30">/</span>
                      <span className="text-amber-300">{stats[e.id]?.misses ?? 0}</span>
                    </span>
                  ) : null}
                  {e.cacheTtlSec > 0 && (
                    <Database className="size-3 text-emerald-400" />
                  )}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-2">
          <button
            onClick={() => store.newThread()}
            className="grid size-11 place-items-center rounded-full bg-white/[0.06] backdrop-blur transition hover:bg-white/[0.12]"
            aria-label="New chat"
          >
            <SquarePen className="size-5 text-white/90" strokeWidth={1.6} />
          </button>
          {messages.length > 0 && (
            <button
              onClick={() => setSettingsOpen(true)}
              className="grid size-11 place-items-center rounded-full bg-white/[0.06] backdrop-blur transition hover:bg-white/[0.12]"
              aria-label="More"
            >
              <MoreHorizontal className="size-5 text-white/90" />
            </button>
          )}
        </div>
      </header>

      {/* Body */}
      <div ref={scrollRef} className="relative z-0 flex-1 overflow-y-auto px-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center pb-32">
            <Sparkle size={56} />
            <h1 className="mt-6 text-3xl font-light tracking-tight text-white/90">
              Ask away, {settings.userName || "friend"}!
            </h1>
            <p className="mt-3 max-w-xs text-center text-sm text-white/45">
              Routing to{" "}
              <span className="text-white/70">
                {settings.baseUrl || "no base url"}
              </span>
              {endpoint && (
                <>
                  {" "}
                  via{" "}
                  <span className="text-white/70">{endpoint.path}</span>
                </>
              )}
              .
            </p>
            {!settings.apiKey && (
              <button
                onClick={() => setSettingsOpen(true)}
                className="mt-5 flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-200"
              >
                <AlertCircle className="size-3.5" /> No API key set — open settings
              </button>
            )}
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-5 py-8">
            {messages.map((m) => (
              <MessageRow
                key={m.id}
                m={m}
                streaming={isStreaming}
                onRegenerate={regenerate}
              />
            ))}
            {error && (
              <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                {isCoolingDown ? (
                  <Clock className="size-4" />
                ) : (
                  <AlertCircle className="size-4" />
                )}
                <span className="flex-1 truncate">{error}</span>
                {isCoolingDown ? (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs tabular-nums text-white">
                    {cooldownSeconds}s
                  </span>
                ) : (
                  <button
                    onClick={retry}
                    className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
                  >
                    <RefreshCw className="size-3" /> Retry
                  </button>
                )}
              </div>
            )}
            {!isStreaming && !error && messages.length > 0 && messages[messages.length - 1]?.role === "assistant" && (
              <button
                onClick={regenerate}
                className="self-start flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.12]"
              >
                <RefreshCw className="size-3" /> Regenerate
              </button>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="relative z-10 px-3 pb-6 pt-2">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 rounded-3xl border border-white/10 bg-white/[0.04] px-2 py-2 backdrop-blur">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2 pt-1">
              {attachments.map((src, i) => (
                <div key={i} className="relative">
                  <img
                    src={src}
                    alt="attachment"
                    className="size-14 rounded-lg object-cover ring-1 ring-white/15"
                  />
                  <button
                    onClick={() =>
                      setAttachments((p) => p.filter((_, j) => j !== i))
                    }
                    className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-black/80 text-white ring-1 ring-white/20"
                    aria-label="Remove attachment"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) ingestFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/85 transition hover:bg-white/[0.12]"
            aria-label="Attach image"
          >
            <ImageIcon className="size-5" strokeWidth={1.6} />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData?.files ?? []);
              if (files.length) {
                e.preventDefault();
                ingestFiles(files);
              }
            }}
            placeholder={`Ask ${endpoint?.label ?? "/v1"}…`}
            className="flex-1 bg-transparent px-2 py-2 text-[17px] text-white placeholder:text-white/40 focus:outline-none"
          />
          {isCoolingDown ? (
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-xs tabular-nums text-white/80">
              {cooldownSeconds}
            </div>
          ) : isStreaming ? (
            <button
              className={`grid size-10 shrink-0 place-items-center rounded-full text-white ${accentBtn(settings.accent)}`}
              aria-label="Stop"
              onClick={stop}
            >
              <Square className="size-4 fill-white" strokeWidth={0} />
            </button>
          ) : input.trim() || attachments.length > 0 ? (
            <button
              onClick={handleSend}
              className={`grid size-10 shrink-0 place-items-center rounded-full text-white ${accentBtn(settings.accent)}`}
              aria-label="Send"
            >
              <AudioLines className="size-5" strokeWidth={1.8} />
            </button>
          ) : (
            <>
              <button
                className="grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/85 transition hover:bg-white/[0.12]"
                aria-label="Voice"
              >
                <Mic className="size-5" strokeWidth={1.6} />
              </button>
              <button
                className={`grid size-10 shrink-0 place-items-center rounded-full text-white ${accentBtn(settings.accent)}`}
                aria-label="Live"
              >
                <AudioLines className="size-5" strokeWidth={1.8} />
              </button>
            </>
          )}
          </div>
        </div>
        <p className="mt-2 text-center text-[11px] text-white/35">
          Cockpit may hallucinate. Verify critical info.
        </p>
      </div>

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function accentBtn(a: string) {
  switch (a) {
    case "emerald":
      return "bg-emerald-500 hover:bg-emerald-400";
    case "rose":
      return "bg-rose-500 hover:bg-rose-400";
    case "amber":
      return "bg-amber-500 hover:bg-amber-400";
    default:
      return "bg-indigo-500 hover:bg-indigo-400";
  }
}

function MessageRow({
  m,
  streaming,
  onRegenerate,
}: {
  m: Message;
  streaming: boolean;
  onRegenerate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[82%] flex-col items-end gap-2">
          {m.attachments && m.attachments.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2">
              {m.attachments.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="size-24 rounded-2xl object-cover ring-1 ring-white/10"
                />
              ))}
            </div>
          )}
          {m.content && (
            <div className="whitespace-pre-wrap rounded-3xl bg-white/[0.08] px-5 py-3 text-[16px] text-white">
              {m.content}
            </div>
          )}
        </div>
      </div>
    );
  }
  const isEmpty = !m.content && (m.pending || streaming);
  const finishedEmpty = !m.pending && !streaming && !m.content && !m.error;
  const lines = m.content ? m.content.split("\n") : [];
  const isLong = lines.length > 10;
  const visible = !isLong || expanded ? m.content : lines.slice(0, 10).join("\n");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider">
        {m.endpointLabel && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/70">
            {m.endpointLabel}
          </span>
        )}
        {m.cached && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
            <Database className="size-3" /> cached
          </span>
        )}
        {m.error && (
          <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-red-300">
            <AlertCircle className="size-3" /> error
          </span>
        )}
      </div>
      {isEmpty ? (
        <PulsingDot />
      ) : finishedEmpty ? (
        <div className="flex flex-col items-start gap-2">
          <p className="italic text-white/60">The model returned no content.</p>
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3 py-1.5 text-xs text-white/80 hover:bg-white/[0.15]"
          >
            <RefreshCw className="size-3" /> Regenerate
          </button>
        </div>
      ) : (
        <div className="group relative max-w-[92%] whitespace-pre-wrap break-words text-[16px] leading-relaxed text-white/95">
          {visible}
          {isLong && !expanded && (
            <>
              <span className="text-white/40">…</span>
              <button
                onClick={() => setExpanded(true)}
                className="mt-2 flex items-center gap-1 rounded-full bg-white/[0.08] px-3 py-1 text-xs text-white/70 hover:bg-white/[0.15]"
              >
                <ChevronDown className="size-3" />
                Show {lines.length - 10} more lines
              </button>
            </>
          )}
          {isLong && expanded && (
            <button
              onClick={() => setExpanded(false)}
              className="mt-2 flex items-center gap-1 rounded-full bg-white/[0.08] px-3 py-1 text-xs text-white/70 hover:bg-white/[0.15]"
            >
              Collapse
            </button>
          )}
          {m.pending && m.content && (
            <span className="ml-1 inline-block size-2 -translate-y-0.5 animate-pulse rounded-full bg-white/80 align-middle" />
          )}
          {!m.error && m.content && (
            <button
              onClick={() => navigator.clipboard?.writeText(m.content)}
              className="ml-2 inline-flex size-7 -translate-y-0.5 items-center justify-center rounded-full text-white/40 opacity-0 transition hover:text-white group-hover:opacity-100"
              aria-label="Copy"
            >
              <Copy className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PulsingDot() {
  return (
    <div className="flex items-center gap-2 pl-1">
      <span className="size-2.5 animate-pulse rounded-full bg-white/80" />
      <span className="text-xs text-white/40">thinking…</span>
    </div>
  );
}
