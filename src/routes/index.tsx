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
  Camera,
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
import { ChatInput } from "@/components/cockpit/ChatInput";
import { ChatMessages } from "@/components/cockpit/ChatMessages";
import { CockpitErrorBoundary } from "@/components/cockpit/CockpitErrorBoundary";
import { CommandPalette } from "@/components/cockpit/CommandPalette";
import { Greeting } from "@/components/cockpit/Greeting";
import { ModelPicker } from "@/components/cockpit/ModelPicker";
import { ShortcutHelp } from "@/components/cockpit/ShortcutHelp";
import { StatusBar } from "@/components/cockpit/StatusBar";
import { ThreadOverflowMenu as ExtractedThreadOverflowMenu } from "@/components/cockpit/ThreadOverflowMenu";
import {
  useStore,
  store,
  PROVIDERS,
  resolveProvider,
  syncThreadToServer,
  type Message,
} from "@/lib/cockpit-store";
import { useChat } from "@/hooks/use-chat";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
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
        content: "Provider-native cockpit for cloud and local AI. Switch providers, not endpoints.",
      },
    ],
  }),
  component: Cockpit,
});

type DraftAttachment = {
  id: string;
  src: string;
  kind: "image" | "video" | "screenshot";
};

function draftKindFromMime(mime: string): DraftAttachment["kind"] {
  return mime.startsWith("video/") ? "video" : "image";
}

export function Cockpit() {
  const settings = useStore((s) => s.settings);
  const activeThreadId = useStore((s) => s.activeThreadId);
  const activeThread = useStore((s) => s.threads.find((t) => t.id === activeThreadId) ?? null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [screenCaptureAvailable, setScreenCaptureAvailable] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [temporary, setTemporary] = useState(false);
  const [recording, setRecording] = useState<"idle" | "recording" | "transcribing">("idle");
  const [recordMode, setRecordMode] = useState<"mic" | "live">("mic");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const transcribeAbortRef = useRef<AbortController | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isStreaming,
    error,
    sendMessage,
    stop,
    regenerate,
    regenerateFrom,
    editMessage,
    executeTool,
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
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    shortcutHelpOpen,
    setShortcutHelpOpen,
    displayMod,
  } = useKeyboardShortcuts(
    {
      onNewThread: () => {
        store.selectThread(null);
        setTemporary(false);
      },
      onSendMessage: () => {
        void handleSend();
      },
      onStopGeneration: stop,
      onCloseDrawer: () => setDrawerOpen(false),
      isStreaming,
      drawerOpen,
    },
    settings.keyboardShortcuts,
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: settings.personalization.reduceMotion ? "auto" : "smooth",
    });
  }, [messages.length, isStreaming, settings.personalization.reduceMotion]);

  useEffect(() => {
    setScreenCaptureAvailable(
      typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia,
    );
  }, []);

  const uiState: keyof typeof PULSE = !isOnline
    ? "offline"
    : error
      ? "error"
      : isCoolingDown
        ? "cooldown"
        : isStreaming
          ? "streaming"
          : "idle";
  const pulse = applyPulsePreferences(PULSE[uiState], settings.personalization.ambientIntensity);
  const reduceMotion = settings.personalization.reduceMotion;
  const hueStyle = {
    animation: reduceMotion ? "none" : `cockpit-hue-cycle ${pulse.cycleMs}ms linear infinite`,
  } as React.CSSProperties;

  async function handleSend() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || isStreaming) return;
    if (isCoolingDown) return;
    if (currentTemporary && !store.getState().activeThreadId) {
      store.newThread({ temporary: true });
    }
    const imageAttachments = attachments
      .filter((item) => item.kind !== "video")
      .map((item) => item.src);
    const videoAttachments = attachments
      .filter((item) => item.kind === "video")
      .map((item) => item.src);
    setInput("");
    setAttachments([]);
    await sendMessage(text, imageAttachments, videoAttachments);
  }

  async function ingestFiles(files: FileList | File[]) {
    const candidates = Array.from(files).filter(
      (file) => file.type.startsWith("image/") || file.type.startsWith("video/"),
    );
    const arr = candidates.filter(
      (file) =>
        (file.type.startsWith("image/") && canAttachImages) ||
        (file.type.startsWith("video/") && canAttachVideo),
    );
    if (!arr.length) {
      if (candidates.length) {
        toast.error(`${provider.name} does not support that media type`);
      }
      return;
    }
    if (arr.length < candidates.length) {
      toast.error(`Some media was skipped because ${provider.name} cannot review it`);
    }
    const datas = await Promise.all(
      arr.map(
        (f) =>
          new Promise<DraftAttachment>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () =>
              resolve({
                id: crypto.randomUUID(),
                src: fr.result as string,
                kind: draftKindFromMime(f.type),
              });
            fr.onerror = reject;
            fr.readAsDataURL(f);
          }),
      ),
    );
    setAttachments((prev) => [...prev, ...datas].slice(0, 6));
  }

  async function captureScreenshot() {
    if (screenshotMode) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Screenshot capture is not available in this browser");
      return;
    }
    let stream: MediaStream | null = null;
    setScreenshotMode(true);
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not capture screenshot");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const src = canvas.toDataURL("image/png");
      const attachment: DraftAttachment = {
        id: crypto.randomUUID(),
        src,
        kind: "screenshot",
      };
      setAttachments((prev) => [...prev, attachment].slice(0, 6));
      toast.success("Screenshot attached");
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "NotAllowedError")) {
        toast.error(e instanceof Error ? e.message : "Screenshot capture failed");
      }
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setScreenshotMode(false);
    }
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
        const controller = new AbortController();
        transcribeAbortRef.current = controller;
        try {
          const { text } = await transcribeAudioViaProxy(provider.id, blob, controller.signal);
          if (text && text.trim()) {
            if (mode === "live") {
              setInput("");
              await sendMessage(text.trim(), []);
            } else {
              setInput((prev) => (prev ? prev + " " + text.trim() : text.trim()));
            }
          }
        } catch (e) {
          if (!(e instanceof DOMException && e.name === "AbortError")) {
            toast.error(e instanceof Error ? e.message : "Transcription failed");
          }
        } finally {
          transcribeAbortRef.current = null;
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

  function cancelTranscribing() {
    transcribeAbortRef.current?.abort();
    transcribeAbortRef.current = null;
    setRecording("idle");
  }

  const { provider, apiKey, model } = resolveProvider(settings);
  const canAttachImages = provider.supports.vision;
  const canCaptureScreenshots = canAttachImages && screenCaptureAvailable;
  const canAttachVideo = provider.mediaCapabilities?.video === "generate";
  const canAttachMedia = canAttachImages || canAttachVideo;
  const cloudProviders = PROVIDERS.filter((p) => p.type === "cloud");
  const localProviders = PROVIDERS.filter((p) => p.type === "local");
  const displayName = settings.profile.displayName || "friend";
  const assistantName = settings.personalization.assistantName.trim() || "Cockpit";
  const promptPlaceholder = settings.personalization.defaultPromptPlaceholder.trim() || "Message";
  const greetingParts = [
    settings.personalization.showProviderInGreeting ? provider.name : null,
    settings.personalization.showModelInGreeting ? model : null,
  ].filter((part): part is string => !!part);
  const greetingStatus =
    greetingParts.length === 0
      ? null
      : settings.personalization.showProviderInGreeting
        ? `Routing through ${greetingParts.join(" · ")}`
        : `Model ${greetingParts.join(" · ")}`;
  const currentTemporary = activeThread?.temporary ?? temporary;
  const visualSurface = VISUAL_SURFACES[settings.personalization.visualMode];

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
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0" style={hueStyle}>
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 90% 60% at 50% 0%,
              hsl(var(--cockpit-hue) 90% 60% / ${pulse.bright}) 0%,
              hsl(var(--cockpit-hue) 60% 18% / ${pulse.mid}) 38%,
              rgba(0,0,0,1) 75%)`,
            animation: reduceMotion
              ? "none"
              : `cockpit-breathe ${pulse.breatheMs}ms ease-in-out infinite`,
          }}
        />
        <div
          className="absolute inset-x-0 top-0 h-[60vh] blur-3xl"
          style={{
            background: `radial-gradient(ellipse 60% 40% at 50% 0%,
              hsl(var(--cockpit-hue) 95% 65% / ${pulse.glow}) 0%, transparent 70%)`,
            animation: reduceMotion
              ? "none"
              : `cockpit-pulse ${pulse.breatheMs}ms ease-in-out infinite`,
          }}
        />
      </div>
      {dragOver && (
        <div className="pointer-events-none absolute inset-3 z-50 grid place-items-center rounded-3xl border-2 border-dashed border-white/40 bg-black/40 backdrop-blur">
          <p className="text-sm text-white/80">
            Drop{" "}
            {canAttachImages && canAttachVideo
              ? "images or videos"
              : canAttachVideo
                ? "videos"
                : "images"}{" "}
            to attach
          </p>
        </div>
      )}
      {screenshotMode && (
        <div className="pointer-events-none absolute inset-3 z-50 grid place-items-center rounded-3xl border-2 border-dashed border-white/40 bg-black/50 backdrop-blur">
          <p className="text-sm text-white/80">Choose a screen or window to attach</p>
        </div>
      )}
      <CockpitErrorBoundary>
        <StatusBar isOnline={isOnline} queueSize={queueSize} />

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
                animation: reduceMotion
                  ? "none"
                  : `cockpit-hue-cycle ${pulse.cycleMs}ms linear infinite, cockpit-pulse ${pulse.breatheMs}ms ease-in-out infinite`,
              }}
            />
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-2 text-[15px] backdrop-blur transition hover:bg-white/[0.08]">
                  <span
                    className={`grid size-6 place-items-center rounded-full bg-gradient-to-br text-[10px] font-semibold text-black ${provider.accent}`}
                  >
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
            <ModelPicker
              provider={provider}
              visualButtonClass={visualSurface.button}
              displayMod={displayMod}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={captureScreenshot}
              className={`grid size-11 place-items-center rounded-full transition ${visualSurface.button}`}
              aria-label="Capture screenshot"
              disabled={!canCaptureScreenshots || screenshotMode}
              title={
                canCaptureScreenshots
                  ? "Capture screenshot"
                  : provider.supports.vision
                    ? "Screenshot capture is not available in this browser"
                    : `${provider.name} does not support image review`
              }
            >
              <Camera className="size-5 text-white/90" strokeWidth={1.6} />
            </button>
            {messages.length === 0 ? (
              <button
                onClick={() => {
                  const next = !currentTemporary;
                  setTemporary(next);
                  const id = store.getState().activeThreadId;
                  if (id) store.setThreadTemporary(id, next);
                  else if (next) store.newThread({ temporary: true });
                }}
                className={`grid size-11 place-items-center rounded-full backdrop-blur transition ${
                  currentTemporary
                    ? "bg-white/20 text-white ring-1 ring-white/40"
                    : visualSurface.button
                }`}
                aria-label="Temporary chat"
                aria-pressed={currentTemporary}
                title={currentTemporary ? "Temporary chat on — won't be saved" : "Temporary chat"}
              >
                <MessageSquareDashed className="size-5" strokeWidth={1.6} />
              </button>
            ) : (
              <button
                onClick={() => {
                  store.selectThread(null);
                  setTemporary(false);
                }}
                className={`grid size-11 place-items-center rounded-full transition ${visualSurface.button}`}
                aria-label="New chat"
              >
                <SquarePen className="size-5 text-white/90" strokeWidth={1.6} />
              </button>
            )}
            {messages.length > 0 && <ExtractedThreadOverflowMenu />}
          </div>
        </header>

        {messages.length === 0 ? (
          <div ref={scrollRef} className="relative z-0 flex-1 overflow-y-auto px-4">
            <Greeting
              displayName={displayName}
              assistantName={assistantName}
              greetingStatus={greetingStatus}
              providerName={provider.name}
              needsApiKey={!!provider.needsApiKey && !apiKey}
            />
          </div>
        ) : (
          <ChatMessages
            messages={messages}
            isStreaming={isStreaming}
            scrollRef={scrollRef}
            onRegenerate={regenerate}
            onRegenerateFrom={regenerateFrom}
            onEditMessage={editMessage}
            onDeleteMessage={(messageId) => {
              const activeId = store.getState().activeThreadId;
              if (activeId) {
                store.deleteMessage(activeId, messageId);
                void syncThreadToServer(activeId);
              }
            }}
            onExecuteTool={executeTool}
            onRetry={retry}
            error={error}
            isCoolingDown={isCoolingDown}
            cooldownSeconds={cooldownSeconds}
          />
        )}

        <ChatInput
          input={input}
          setInput={setInput}
          attachments={attachments}
          setAttachments={setAttachments}
          fileInputRef={fileInputRef}
          recording={recording}
          recordMode={recordMode}
          onSend={handleSend}
          onCaptureScreenshot={captureScreenshot}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          onCancelTranscribing={cancelTranscribing}
          onIngestFiles={(files) => {
            void ingestFiles(files);
          }}
          onStop={stop}
          canAttachMedia={canAttachMedia}
          canAttachImages={canAttachImages}
          canAttachVideo={canAttachVideo}
          canCaptureScreenshots={canCaptureScreenshots}
          screenshotMode={screenshotMode}
          providerName={provider.name}
          visualSurface={visualSurface}
          isStreaming={isStreaming}
          isCoolingDown={isCoolingDown}
          cooldownSeconds={cooldownSeconds}
          promptPlaceholder={promptPlaceholder}
          assistantName={assistantName}
          pulse={pulse}
          reduceMotion={reduceMotion}
        />

        <Drawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          onOpenSettings={() => navigate({ to: "/settings" })}
        />
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          onOpenShortcutHelp={() => setShortcutHelpOpen(true)}
          displayMod={displayMod}
        />
        <ShortcutHelp
          open={shortcutHelpOpen}
          onOpenChange={setShortcutHelpOpen}
          displayMod={displayMod}
          shortcuts={settings.keyboardShortcuts}
        />
      </CockpitErrorBoundary>
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
      <span
        className={`grid size-6 place-items-center rounded-full bg-gradient-to-br text-[10px] font-semibold text-black ${p.accent}`}
      >
        {p.badge}
      </span>
      <span className="flex-1 truncate text-sm">{p.name}</span>
      {active && <Check className="size-3.5 text-emerald-300" />}
    </DropdownMenuItem>
  );
}

const PULSE = {
  idle: { cycleMs: 14000, breatheMs: 4200, bright: 0.45, mid: 0.45, glow: 0.28 },
  streaming: { cycleMs: 2200, breatheMs: 1100, bright: 0.75, mid: 0.55, glow: 0.65 },
  cooldown: { cycleMs: 9000, breatheMs: 2600, bright: 0.55, mid: 0.5, glow: 0.4 },
  error: { cycleMs: 3200, breatheMs: 1600, bright: 0.7, mid: 0.55, glow: 0.55 },
  offline: { cycleMs: 22000, breatheMs: 5200, bright: 0.25, mid: 0.55, glow: 0.15 },
} as const;

type PulseProfile = {
  cycleMs: number;
  breatheMs: number;
  bright: number;
  mid: number;
  glow: number;
};

const AMBIENT_SCALE = {
  low: 0.68,
  medium: 1,
  high: 1.22,
} as const;

const VISUAL_SURFACES = {
  glass: {
    input: "border border-white/10 bg-white/[0.04] backdrop-blur",
    button: "bg-white/[0.06] backdrop-blur text-white/90 hover:bg-white/[0.12]",
  },
  dark: {
    input: "border border-zinc-800 bg-zinc-950/95 shadow-2xl shadow-black/50",
    button: "bg-zinc-900 text-white/90 ring-1 ring-white/10 hover:bg-zinc-800",
  },
  solid: {
    input: "border border-white/15 bg-zinc-900 shadow-2xl shadow-black/35",
    button: "bg-zinc-800 text-white/90 hover:bg-zinc-700",
  },
} as const;

function clampOpacity(value: number) {
  return Math.max(0.08, Math.min(value, 0.9));
}

function applyPulsePreferences(
  p: (typeof PULSE)[keyof typeof PULSE],
  intensity: keyof typeof AMBIENT_SCALE,
): PulseProfile {
  const scale = AMBIENT_SCALE[intensity] ?? AMBIENT_SCALE.medium;
  return {
    ...p,
    bright: clampOpacity(p.bright * scale),
    mid: clampOpacity(p.mid * scale),
    glow: clampOpacity(p.glow * scale),
  };
}

function hueButtonStyle(p: PulseProfile, reduceMotion: boolean): React.CSSProperties {
  return {
    animation: reduceMotion ? "none" : `cockpit-hue-cycle ${p.cycleMs}ms linear infinite`,
    backgroundColor: `hsl(var(--cockpit-hue) 80% 55%)`,
    boxShadow: `0 0 ${reduceMotion ? 14 : 24}px hsl(var(--cockpit-hue) 95% 60% / ${reduceMotion ? 0.32 : 0.55})`,
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
          {m.videoAttachments && m.videoAttachments.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2">
              {m.videoAttachments.map((src, i) => (
                <video
                  key={i}
                  src={src}
                  controls
                  playsInline
                  className="aspect-video w-40 rounded-2xl bg-black object-cover ring-1 ring-white/10"
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
  function handleSaveTemporary() {
    if (!thread) return;
    store.setThreadTemporary(thread.id, false);
    toast.success("Chat saved to library");
  }
  async function handleCopyLink() {
    if (!thread) return;
    if (thread.temporary) {
      toast.error("Temporary chats cannot be shared until saved");
      return;
    }
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
        {thread?.temporary && (
          <>
            <DropdownMenuLabel className="text-xs uppercase tracking-wider text-white/40">
              Temporary chat
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={handleSaveTemporary} className="focus:bg-white/10">
              <Check className="mr-2 size-4" /> Save chat
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/10" />
          </>
        )}
        <DropdownMenuItem onClick={handleRename} className="focus:bg-white/10">
          <Pencil className="mr-2 size-4" /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleCopyLink}
          disabled={!!thread?.temporary}
          className="focus:bg-white/10 disabled:opacity-40"
        >
          <LinkIcon className="mr-2 size-4" /> Copy link
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyTranscript} className="focus:bg-white/10">
          <Copy className="mr-2 size-4" /> Copy transcript
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem
          onClick={() => navigate({ to: "/settings" })}
          className="focus:bg-white/10"
        >
          <SettingsIcon className="mr-2 size-4" /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem
          onClick={handleDelete}
          className="text-red-300 focus:bg-red-500/10 focus:text-red-200"
        >
          <Trash2 className="mr-2 size-4" /> Delete chat
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
