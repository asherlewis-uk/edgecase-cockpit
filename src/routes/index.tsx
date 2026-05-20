import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Menu,
  ChevronDown,
  SquarePen,
  Plus,
  Mic,
  AudioLines,
  Square,
  MoreHorizontal,
  Database,
  AlertCircle,
  Copy,
} from "lucide-react";
import { Sparkle } from "@/components/cockpit/Sparkle";
import { Drawer } from "@/components/cockpit/Drawer";
import { SettingsDialog } from "@/components/cockpit/SettingsDialog";
import {
  useStore,
  store,
  callEndpoint,
  type Message,
} from "@/lib/cockpit-store";
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
  const threads = useStore((s) => s.threads);
  const activeId = useStore((s) => s.activeThreadId);
  const active = threads.find((t) => t.id === activeId) || null;
  const messages = active?.messages ?? [];

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activeEndpointId, setActiveEndpointId] = useState<string>(
    settings.defaultEndpointId,
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveEndpointId(settings.defaultEndpointId);
  }, [settings.defaultEndpointId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, sending]);

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
    if (!text || sending) return;
    let threadId = activeId;
    if (!threadId) threadId = store.newThread();
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      ts: Date.now(),
    };
    store.addMessage(threadId, userMsg);
    setInput("");
    setSending(true);

    const endpoint =
      settings.endpoints.find((e) => e.id === activeEndpointId) ??
      settings.endpoints[0];
    const placeholderId = crypto.randomUUID();
    store.addMessage(threadId, {
      id: placeholderId,
      role: "assistant",
      content: "",
      endpointLabel: endpoint?.label,
      ts: Date.now(),
    });

    try {
      if (!endpoint) throw new Error("No endpoint configured");
      const history = store
        .getState()
        .threads.find((t) => t.id === threadId)!
        .messages.filter((m) => m.role !== "assistant" || m.content)
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await callEndpoint({
        endpoint,
        settings: store.getState().settings,
        messages: history,
        prompt: text,
      });
      store.patchMessage(threadId, placeholderId, {
        content: res.text || "(empty response)",
        cached: res.cached,
        endpointLabel: res.label,
      });
    } catch (e) {
      store.patchMessage(threadId, placeholderId, {
        content: (e as Error).message,
        error: true,
      });
    } finally {
      setSending(false);
    }
  }

  const endpoint = settings.endpoints.find((e) => e.id === activeEndpointId);

  return (
    <div
      className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-black text-white"
      style={{ background: accentGrad[settings.accent] }}
    >
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
                {e.cacheTtlSec > 0 && (
                  <Database className="ml-auto size-3 text-emerald-400" />
                )}
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
              <MessageRow key={m.id} m={m} sending={sending} />
            ))}
            {sending && messages[messages.length - 1]?.role !== "assistant" && (
              <ThinkingDots />
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="relative z-10 px-3 pb-6 pt-2">
        <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2 py-2 backdrop-blur">
          <button
            onClick={() => setSettingsOpen(true)}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/85 transition hover:bg-white/[0.12]"
            aria-label="Tools"
          >
            <Plus className="size-5" strokeWidth={1.6} />
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
            placeholder={`Ask ${endpoint?.label ?? "/v1"}…`}
            className="flex-1 bg-transparent px-2 py-2 text-[17px] text-white placeholder:text-white/40 focus:outline-none"
          />
          {sending ? (
            <button
              className={`grid size-10 shrink-0 place-items-center rounded-full text-white ${accentBtn(settings.accent)}`}
              aria-label="Stop"
              onClick={() => setSending(false)}
            >
              <Square className="size-4 fill-white" strokeWidth={0} />
            </button>
          ) : input.trim() ? (
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

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 pl-1">
      <span className="size-1.5 animate-bounce rounded-full bg-white/70 [animation-delay:-0.2s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-white/70 [animation-delay:-0.1s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-white/70" />
    </div>
  );
}

function MessageRow({ m, sending }: { m: Message; sending: boolean }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] whitespace-pre-wrap rounded-3xl bg-white/[0.08] px-5 py-3 text-[16px] text-white">
          {m.content}
        </div>
      </div>
    );
  }
  const isEmpty = !m.content && sending;
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
        <ThinkingDots />
      ) : (
        <div className="group relative max-w-[92%] whitespace-pre-wrap break-words text-[16px] leading-relaxed text-white/95">
          {m.content}
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
