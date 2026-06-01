import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  AlertCircle,
  Copy,
  RefreshCw,
  WifiOff,
  Clock,
  X,
  Image as ImageIcon,
  MessageSquareDashed,
  Check,
  Pencil,
  Trash2,
  Link as LinkIcon,
  Settings as SettingsIcon,
} from "lucide-react";
import { Sparkle } from "@/components/cockpit/Sparkle";
import { Drawer } from "@/components/cockpit/Drawer";
import {
  useStore,
  store,
  PROVIDERS,
  resolveProvider,
  type Message,
} from "@/lib/cockpit-store";
import { useChat } from "@/hooks/use-chat";
import { transcribeAudioViaProxy } from "@/lib/providers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cockpit — provider-native AI console" },
      {
        name: "description",
        content:
          "Provider-native cockpit for cloud and local AI. Switch providers, not endpoints.",
      },
    ],
  }),
  component: Cockpit,
});

export function Cockpit() {
  const settings = useStore((s) => s.settings);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [temporary, setTemporary] = useState(false);
  const [recording, setRecording] = useState<"idle" | "recording" | "transcribing">("idle");
  const [recordMode, setRecordMode] = useState<"mic" | "live">("mic");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
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
    onAuthError: () => {
      toast.error("Invalid API key", {
        description: "Update your provider credentials.",
      });
      navigate({ to: "/settings" });
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, isStreaming]);

  const uiState: keyof typeof PULSE = !isOnline
    ? "offline"
    : error
      ? "error"
      : isCoolingDown
        ? "cooldown"
        : isStreaming
          ? "streaming"
          : "idle";
  const pulse = PULSE[uiState];
  const hueStyle = {
    animation: `cockpit-hue-cycle ${pulse.cycleMs}ms linear infinite`,
  } as React.CSSProperties;

  async function handleSend() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || isStreaming) return;
    if (isCoolingDown) return;
    if (temporary && !store.getState().activeThreadId) {
      store.newThread({ temporary: true });
    }
    setInput("");
    const a = attachments;
    setAttachments([]);
    await sendMessage(text, a);
  }

  async function ingestFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
    );
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

  async function startRecording(mode: "mic" | "live") {
    if (recording !== "idle") return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Microphone not available in this browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        if (blob.size < 500) {
          setRecording("idle");
          return;
        }
        setRecording("transcribing");
        try {
          const { text } = await transcribeAudioViaProxy(provider.id, blob);
          if (text && text.trim()) {
            if (mode === "live") {
              setInput("");
              await sendMessage(text.trim(), []);
            } else {
              setInput((prev) => (prev ? prev + " " + text.trim() : text.trim()));
            }
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Transcription failed");
        } finally {
          setRecording("idle");
        }
      };
      mediaRecorderRef.current = mr;
      setRecordMode(mode);
      setRecording("recording");
      mr.start();
    } catch {
      toast.error("Microphone permission denied");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  }

  const { provider, apiKey, model } = resolveProvider(settings);
  const cloudProviders = PROVIDERS.filter((p) => p.type === "cloud");
  const localProviders = PROVIDERS.filter((p) => p.type === "local");

  return (
    <div
      className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-black text-white"
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
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0"
        style={hueStyle}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 90% 60% at 50% 0%,
              hsl(var(--cockpit-hue) 90% 60% / ${pulse.bright}) 0%,
              hsl(var(--cockpit-hue) 60% 18% / ${pulse.mid}) 38%,
              rgba(0,0,0,1) 75%)`,
            animation: `cockpit-breathe ${pulse.breatheMs}ms ease-in-out infinite`,
          }}
        />
        <div
          className="absolute inset-x-0 top-0 h-[60vh] blur-3xl"
          style={{
            background: `radial-gradient(ellipse 60% 40% at 50% 0%,
              hsl(var(--cockpit-hue) 95% 65% / ${pulse.glow}) 0%, transparent 70%)`,
            animation: `cockpit-pulse ${pulse.breatheMs}ms ease-in-out infinite`,
          }}
        />
      </div>
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

      <header className="relative z-10 flex items-center justify-between px-3 pt-3">
        <button
          onClick={() => setDrawerOpen(true)}
          className="relative grid size-11 place-items-center rounded-full bg-white/[0.06] backdrop-blur transition hover:bg-white/[0.12]"
          aria-label="Open menu"
        >
          <Menu className="size-5 text-white/90" strokeWidth={1.8} />
          <span
            className="absolute right-2.5 top-2.5 size-1.5 rounded-full"
            style={{
              backgroundColor: `hsl(var(--cockpit-hue) 95% 65%)`,
              boxShadow: `0 0 8px hsl(var(--cockpit-hue) 95% 65% / 0.8)`,
              animation: `cockpit-hue-cycle ${pulse.cycleMs}ms linear infinite, cockpit-pulse ${pulse.breatheMs}ms ease-in-out infinite`,
            }}
          />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-2 text-[15px] backdrop-blur transition hover:bg-white/[0.08]">
              <span className={`grid size-6 place-items-center rounded-full bg-gradient-to-br text-[10px] font-semibold text-black ${provider.accent}`}>
                {provider.badge}
              </span>
              <span className="font-medium text-white">{provider.name}</span>
              <ChevronDown className="size-4 text-white/70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72 border-white/10 bg-zinc-950 text-white">
            <DropdownMenuLabel className="text-xs uppercase tracking-wider text-white/40">
              Cloud
            </DropdownMenuLabel>
            {cloudProviders.map((p) => (
              <ProviderRow
                key={p.id}
                p={p}
                active={p.id === provider.id}
                onSelect={() => store.setActiveProvider(p.id)}
              />
            ))}
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuLabel className="text-xs uppercase tracking-wider text-white/40">
              Local
            </DropdownMenuLabel>
            {localProviders.map((p) => (
              <ProviderRow
                key={p.id}
                p={p}
                active={p.id === provider.id}
                onSelect={() => store.setActiveProvider(p.id)}
              />
            ))}
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem
              onClick={() => navigate({ to: "/settings" })}
              className="focus:bg-white/10"
            >
              <span className="text-xs text-white/70">Manage providers…</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-2">
          {messages.length === 0 ? (
            <button
              onClick={() => {
                const next = !temporary;
                setTemporary(next);
                const id = store.getState().activeThreadId;
                if (id) store.setThreadTemporary(id, next);
                else if (next) store.newThread({ temporary: true });
              }}
              className={`grid size-11 place-items-center rounded-full backdrop-blur transition ${
                temporary
                  ? "bg-white/20 text-white ring-1 ring-white/40"
                  : "bg-white/[0.06] text-white/90 hover:bg-white/[0.12]"
              }`}
              aria-label="Temporary chat"
              aria-pressed={temporary}
              title={temporary ? "Temporary chat on — won't be saved" : "Temporary chat"}
            >
              <MessageSquareDashed className="size-5" strokeWidth={1.6} />
            </button>
          ) : (
            <button
              onClick={() => {
                store.selectThread(null);
                setTemporary(false);
              }}
              className="grid size-11 place-items-center rounded-full bg-white/[0.06] backdrop-blur transition hover:bg-white/[0.12]"
              aria-label="New chat"
            >
              <SquarePen className="size-5 text-white/90" strokeWidth={1.6} />
            </button>
          )}
          {messages.length > 0 && <ThreadOverflowMenu />}
        </div>
      </header>

      <div ref={scrollRef} className="relative z-0 flex-1 overflow-y-auto px-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center pb-32">
            <Sparkle size={56} />
            <h1 className="mt-6 text-3xl font-light tracking-tight text-white/90">
              Ask away, {settings.userName || "friend"}!
            </h1>
            <p className="mt-3 max-w-xs text-center text-sm text-white/45">
              Routing through{" "}
              <span className="text-white/80">{provider.name}</span>
              {" · "}
              <span className="text-white/70">{model}</span>
            </p>
            {provider.needsApiKey && !apiKey && (
              <button
                onClick={() => navigate({ to: "/settings" })}
                className="mt-5 flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-200"
              >
                <AlertCircle className="size-3.5" /> No API key set for {provider.name}
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
          </div>
        )}
      </div>

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
                    onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
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
              disabled={!provider.supports.vision}
              title={provider.supports.vision ? "Attach image" : `${provider.name} does not support vision`}
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
              placeholder={`Message ${provider.name}…`}
              className="flex-1 bg-transparent px-2 py-2 text-[17px] text-white placeholder:text-white/40 focus:outline-none"
            />
            {isCoolingDown ? (
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-xs tabular-nums text-white/80">
                {cooldownSeconds}
              </div>
            ) : isStreaming ? (
              <button
                className="grid size-10 shrink-0 place-items-center rounded-full text-white transition-colors"
                style={hueButtonStyle(pulse)}
                aria-label="Stop"
                onClick={stop}
              >
                <Square className="size-4 fill-white" strokeWidth={0} />
              </button>
            ) : input.trim() || attachments.length > 0 ? (
              <button
                onClick={handleSend}
                className="grid size-10 shrink-0 place-items-center rounded-full text-white transition-colors"
                style={hueButtonStyle(pulse)}
                aria-label="Send"
              >
                <AudioLines className="size-5" strokeWidth={1.8} />
              </button>
            ) : (
              <>
                <button
                  onClick={() => (recording === "recording" && recordMode === "mic" ? stopRecording() : startRecording("mic"))}
                  disabled={recording === "transcribing"}
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/85 transition hover:bg-white/[0.12]"
                  aria-label={recording === "recording" && recordMode === "mic" ? "Stop recording" : "Voice to text"}
                  title={recording === "transcribing" ? "Transcribing…" : recording === "recording" && recordMode === "mic" ? "Stop & transcribe" : "Voice to text"}
                >
                  <Mic className={`size-5 ${recording === "recording" && recordMode === "mic" ? "text-red-400 animate-pulse" : ""}`} strokeWidth={1.6} />
                </button>
                <button
                  onClick={() => (recording === "recording" && recordMode === "live" ? stopRecording() : startRecording("live"))}
                  disabled={recording === "transcribing"}
                  className="grid size-10 shrink-0 place-items-center rounded-full text-white transition-colors"
                  style={hueButtonStyle(pulse)}
                  aria-label={recording === "recording" && recordMode === "live" ? "Stop live" : "Live voice — record & send"}
                  title={recording === "recording" && recordMode === "live" ? "Stop & send" : "Live voice — records & sends on stop"}
                >
                  <AudioLines className={`size-5 ${recording === "recording" && recordMode === "live" ? "animate-pulse" : ""}`} strokeWidth={1.8} />
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
        onOpenSettings={() => navigate({ to: "/settings" })}
      />
    </div>
  );
}

function ProviderRow({
  p,
  active,
  onSelect,
}: {
  p: (typeof PROVIDERS)[number];
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem onClick={onSelect} className="gap-2 focus:bg-white/10">
      <span className={`grid size-6 place-items-center rounded-full bg-gradient-to-br text-[10px] font-semibold text-black ${p.accent}`}>
        {p.badge}
      </span>
      <span className="flex-1 truncate text-sm">{p.name}</span>
      {active && <Check className="size-3.5 text-emerald-300" />}
    </DropdownMenuItem>
  );
}

const PULSE = {
  idle:      { cycleMs: 14000, breatheMs: 4200, bright: 0.45, mid: 0.45, glow: 0.28 },
  streaming: { cycleMs:  2200, breatheMs: 1100, bright: 0.75, mid: 0.55, glow: 0.65 },
  cooldown:  { cycleMs:  9000, breatheMs: 2600, bright: 0.55, mid: 0.5,  glow: 0.4  },
  error:     { cycleMs:  3200, breatheMs: 1600, bright: 0.7,  mid: 0.55, glow: 0.55 },
  offline:   { cycleMs: 22000, breatheMs: 5200, bright: 0.25, mid: 0.55, glow: 0.15 },
} as const;

function hueButtonStyle(p: (typeof PULSE)[keyof typeof PULSE]): React.CSSProperties {
  return {
    animation: `cockpit-hue-cycle ${p.cycleMs}ms linear infinite`,
    backgroundColor: `hsl(var(--cockpit-hue) 80% 55%)`,
    boxShadow: `0 0 24px hsl(var(--cockpit-hue) 95% 60% / 0.55)`,
  };
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
        {m.providerName && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/70">
            {m.providerName}
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
          {m.error && (
            <div className="mt-2">
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3 py-1.5 text-xs text-white/80 hover:bg-white/[0.15]"
              >
                <RefreshCw className="size-3" /> Regenerate
              </button>
            </div>
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

function ThreadOverflowMenu() {
  const navigate = useNavigate();
  const activeId = useStore((s) => s.activeThreadId);
  const threads = useStore((s) => s.threads);
  const thread = threads.find((t) => t.id === activeId) ?? null;

  function handleRename() {
    if (!thread) return;
    const next = window.prompt("Rename chat", thread.title);
    if (next && next.trim()) store.renameThread(thread.id, next.trim());
  }
  function handleDelete() {
    if (!thread) return;
    if (!window.confirm("Delete this chat?")) return;
    store.deleteThread(thread.id);
    navigate({ to: "/" });
  }
  async function handleCopyLink() {
    if (!thread) return;
    const url = `${window.location.origin}/thread/${thread.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  }
  async function handleCopyTranscript() {
    if (!thread) return;
    const text = thread.messages
      .map((m) => `${m.role.toUpperCase()}:\n${m.content ?? ""}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Transcript copied");
    } catch {
      toast.error("Couldn't copy transcript");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="grid size-11 place-items-center rounded-full bg-white/[0.06] backdrop-blur transition hover:bg-white/[0.12]"
          aria-label="Chat options"
        >
          <MoreHorizontal className="size-5 text-white/90" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border-white/10 bg-zinc-950 text-white">
        <DropdownMenuItem onClick={handleRename} className="focus:bg-white/10">
          <Pencil className="mr-2 size-4" /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyLink} className="focus:bg-white/10">
          <LinkIcon className="mr-2 size-4" /> Copy link
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyTranscript} className="focus:bg-white/10">
          <Copy className="mr-2 size-4" /> Copy transcript
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem onClick={() => navigate({ to: "/settings" })} className="focus:bg-white/10">
          <SettingsIcon className="mr-2 size-4" /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem onClick={handleDelete} className="text-red-300 focus:bg-red-500/10 focus:text-red-200">
          <Trash2 className="mr-2 size-4" /> Delete chat
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}