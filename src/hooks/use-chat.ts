import { useCallback, useEffect, useRef, useState } from "react";
import {
  store,
  useStore,
  resolveProvider,
  bumpProviderStat,
  recordTokenUsage,
  syncTokenUsageToServer,
  syncThreadToServer,
  type Message,
  type Settings,
} from "@/lib/cockpit-store";
import { callProviderChatViaProxy, ProviderError, type ChatMessage } from "@/lib/providers";
import { retryWithBackoff } from "@/lib/retry";
import { estimateTokens } from "@/lib/tokens";
import {
  type ToolDef,
  type ToolCall,
  parseOpenAIToolCalls,
  parseAnthropicToolCalls,
  executeBuiltInTool,
  BUILT_IN_TOOLS,
  StreamToolCallAccumulator,
  extractOpenAIToolCallDelta,
} from "@/lib/tools";
import { embedTexts } from "@/lib/embeddings";
import { addVectorDocs, searchVectorStore } from "@/lib/vector-store";

// ── Offline queue localStorage persistence ──────────────────────────────────
const OFFLINE_QUEUE_KEY = "cockpit.offline-queue.v1";

function isLocalStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const testKey = "__cockpit_ls_test__";
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function loadOfflineQueue(): PromptDraft[] {
  if (!isLocalStorageAvailable()) return [];
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as PromptDraft[];
  } catch {
    /* ignore corrupt data */
  }
  return [];
}

function saveOfflineQueue(queue: PromptDraft[]): void {
  if (!isLocalStorageAvailable()) return;
  try {
    if (queue.length === 0) {
      localStorage.removeItem(OFFLINE_QUEUE_KEY);
    } else {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    }
  } catch {
    /* quota exceeded or unavailable */
  }
}

function extractImageUrls(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();
  // Markdown images: ![alt](url)
  const md = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = md.exec(text))) {
    const u = m[1];
    if (
      u.startsWith("data:image/") ||
      /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/i.test(u)
    )
      out.add(u);
  }
  // Bare data URIs
  const data = /data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/g;
  while ((m = data.exec(text))) out.add(m[0]);
  return Array.from(out);
}

export type UseChatOptions = {
  onAuthError?: (message: string) => void;
};

type PromptDraft = {
  text: string;
  imageAttachments?: string[];
  videoAttachments?: string[];
};

export function buildPersonalizationSystemMessage(settings: Settings): ChatMessage | null {
  const { profile, personalization } = settings;
  const assistantName = personalization.assistantName.trim() || "Cockpit";
  const displayName = profile.displayName.trim();
  const lines = [
    `You are ${assistantName}, a calm personal AI cockpit assistant.`,
    `Use a ${personalization.preferredTone} response tone unless the user's request clearly calls for another style.`,
  ];

  if (displayName) lines.push(`The user's display name is ${displayName}.`);
  if (profile.roleLabel?.trim())
    lines.push(`The user's role label is ${profile.roleLabel.trim()}.`);
  if (profile.pronouns?.trim()) lines.push(`The user's pronouns are ${profile.pronouns.trim()}.`);
  if (profile.handle?.trim()) lines.push(`The user's handle is ${profile.handle.trim()}.`);

  return {
    role: "system",
    content: lines.join(" "),
  };
}

function contentForProvider(message: Message): string {
  if (!message.videoAttachments?.length) return message.content;
  const count = message.videoAttachments.length;
  const note = `[${count} video attachment${count === 1 ? "" : "s"} saved in this chat for review; this provider call receives video as text context only.]`;
  return [message.content, note].filter(Boolean).join("\n\n");
}

export function useChat({ onAuthError }: UseChatOptions = {}) {
  const settings = useStore((s) => s.settings);
  const threads = useStore((s) => s.threads);
  const activeId = useStore((s) => s.activeThreadId);
  const active = threads.find((t) => t.id === activeId) || null;
  const messages: Message[] = active?.messages ?? [];
  const initialQueueRef = useRef<PromptDraft[] | null>(null);
  if (initialQueueRef.current === null) initialQueueRef.current = loadOfflineQueue();

  const [status, setStatus] = useState<"idle" | "streaming" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownNow, setCooldownNow] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [queueSize, setQueueSize] = useState(() => initialQueueRef.current?.length ?? 0);
  const queueRef = useRef<PromptDraft[]>(initialQueueRef.current ?? []);
  const abortRef = useRef<AbortController | null>(null);
  const lastPromptRef = useRef<PromptDraft | null>(null);
  const backoffRef = useRef(0);
  const lastErrorRef = useRef<{ message: string; count: number } | null>(null);
  const fiveXxBackoffRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    const on = () => {
      setIsOnline(true);
      const q = queueRef.current.splice(0);
      saveOfflineQueue(queueRef.current);
      setQueueSize(0);
      (async () => {
        for (const item of q) {
          await sendMessageRef.current?.(item.text, item.imageAttachments, item.videoAttachments);
        }
      })();
    };
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!cooldownUntil) return;
    const tick = () => {
      const remaining = Math.max(0, cooldownUntil - Date.now());
      setCooldownNow(Math.ceil(remaining / 1000));
      if (remaining <= 0) setCooldownUntil(null);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const runAssistant = useCallback(
    async (threadId: string, _prompt: string, toolDefs?: ToolDef[]) => {
      const currentSettings = store.getState().settings;
      const { provider, apiKey, baseUrl, model } = resolveProvider(currentSettings);
      const placeholderId = crypto.randomUUID();
      const now = Date.now();
      store.addMessage(threadId, {
        id: placeholderId,
        role: "assistant",
        content: "",
        providerId: provider.id,
        providerName: provider.name,
        pending: true,
        ts: now,
        timestamp: now,
      });

      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("streaming");
      setError(null);

      let ragContext = "";
      if (currentSettings.rag?.enabled && _prompt) {
        try {
          const embeddings = await embedTexts(
            [_prompt],
            currentSettings.rag.providerId,
            currentSettings.rag.model,
          );
          const results = searchVectorStore(embeddings[0], 3);
          if (results.length) {
            ragContext =
              "Relevant context from previous messages:\n" +
              results.map((r) => `- ${r.text}`).join("\n");
          }
        } catch {
          /* ignore retrieval failures; chat continues without context */
        }
      }

      const personalizationSystem = buildPersonalizationSystemMessage(currentSettings);
      const history: ChatMessage[] = [
        ...(personalizationSystem
          ? [
              {
                ...personalizationSystem,
                content: ragContext
                  ? `${personalizationSystem.content}\n\n${ragContext}`
                  : personalizationSystem.content,
              },
            ]
          : ragContext
            ? [{ role: "system" as const, content: ragContext }]
            : []),
        ...store
          .getState()
          .threads.find((t) => t.id === threadId)!
          .messages.filter((m) => m.role !== "assistant" || m.content)
          .map((m) => ({
            role: m.role,
            content: contentForProvider(m),
            attachments: m.attachments,
          })),
      ];

      // When tools are present, prefer streaming if the provider supports
      // streaming tool-call deltas (OpenAI-compatible bodyStyle). Otherwise,
      // fall back to non-streaming for reliable tool_calls parsing.
      const hasTools = toolDefs && toolDefs.length > 0;
      const supportsStreamingTools =
        hasTools && provider.bodyStyle === "openai" && provider.supports.streamingTools;
      const useStream = !hasTools || supportsStreamingTools;

      let acc = "";
      const toolAccum = supportsStreamingTools ? new StreamToolCallAccumulator() : null;
      try {
        bumpProviderStat(provider.id, "call");
        const res = await retryWithBackoff(
          () =>
            callProviderChatViaProxy({
              provider,
              apiKey,
              baseUrl,
              model,
              messages: history,
              signal: controller.signal,
              stream: useStream,
              tools: toolDefs,
              onDelta: useStream
                ? (chunk: string) => {
                    acc += chunk;
                    store.patchMessage(threadId, placeholderId, {
                      content: acc,
                      pending: true,
                    });
                  }
                : undefined,
              onToolCallDelta: supportsStreamingTools
                ? (delta: {
                    index: number;
                    id?: string;
                    function?: { name?: string; arguments?: string };
                  }) => {
                    toolAccum?.ingest(delta);
                  }
                : undefined,
            }),
          { maxRetries: 3 },
        );
        const finalText = (res.text || acc || "").trim();
        const assistantImages = extractImageUrls(finalText);

        // Detect tool calls from response
        let toolCalls: ToolCall[] | undefined;
        if (supportsStreamingTools && toolAccum) {
          toolCalls = toolAccum.complete();
          if (toolCalls.length === 0) toolCalls = undefined;
        } else if (!useStream && hasTools && typeof res.raw === "object" && res.raw !== null) {
          toolCalls =
            provider.bodyStyle === "anthropic"
              ? parseAnthropicToolCalls(res.raw)
              : parseOpenAIToolCalls(res.raw);
        }

        store.patchMessage(threadId, placeholderId, {
          content: finalText,
          pending: false,
          assistantImages: assistantImages.length ? assistantImages : undefined,
          toolCalls: toolCalls?.length ? toolCalls : undefined,
        });
        // Estimate and record token usage
        const inputTokens = history.reduce(
          (sum, m) => sum + estimateTokens(typeof m.content === "string" ? m.content : ""),
          0,
        );
        const outputTokens = estimateTokens(finalText);
        recordTokenUsage(provider.id, inputTokens, outputTokens);
        void syncTokenUsageToServer(provider.id, inputTokens, outputTokens, model, threadId);
        backoffRef.current = 0;
        setStatus("idle");
      } catch (e) {
        const err = e as Error;
        const aborted = err.name === "AbortError";
        const msg = aborted ? "Stopped" : err.message;
        const apiErr = e instanceof ProviderError ? e : null;
        if (!aborted) bumpProviderStat(provider.id, "error");
        store.patchMessage(threadId, placeholderId, {
          content: acc || msg,
          error: !aborted,
          pending: false,
        });
        if (aborted) {
          setStatus("idle");
        } else if (apiErr && (apiErr.status === 401 || apiErr.status === 403)) {
          setError("Invalid API key");
          setStatus("error");
          onAuthError?.(msg);
        } else if (apiErr && apiErr.status === 429) {
          backoffRef.current = Math.min(backoffRef.current + 1, 6);
          const base = apiErr.retryAfter ?? Math.min(2 ** backoffRef.current, 60);
          setCooldownUntil(Date.now() + base * 1000);
          setError(`Rate limited — retrying in ${base}s`);
          setStatus("error");
        } else if (typeof navigator !== "undefined" && !navigator.onLine) {
          if (lastPromptRef.current) {
            queueRef.current.push(lastPromptRef.current);
            saveOfflineQueue(queueRef.current);
            setQueueSize(queueRef.current.length);
          }
          setError("Offline — queued for retry");
          setStatus("error");
        } else {
          // ── Error deduplication ──
          const dedupKey = msg;
          if (lastErrorRef.current && lastErrorRef.current.message === dedupKey) {
            lastErrorRef.current.count++;
            if (lastErrorRef.current.count >= 3) {
              setError(`Error occurred (x${lastErrorRef.current.count})`);
            }
          } else {
            lastErrorRef.current = { message: dedupKey, count: 1 };
            setError(msg);
          }
          setStatus("error");
        }
      } finally {
        abortRef.current = null;
      }
    },
    [onAuthError],
  );

  const sendMessage = useCallback(
    async (text: string, imageAttachments?: string[], videoAttachments?: string[]) => {
      const content = text.trim();
      if (
        (!content && !imageAttachments?.length && !videoAttachments?.length) ||
        status === "streaming"
      ) {
        return;
      }
      const storedContent =
        content || (videoAttachments?.length ? "Attached video for review." : "");
      if (cooldownUntil && cooldownUntil > Date.now()) return;
      let threadId = store.getState().activeThreadId;
      if (!threadId) threadId = store.newThread();
      const now = Date.now();
      store.addMessage(threadId, {
        id: crypto.randomUUID(),
        role: "user",
        content: storedContent,
        attachments: imageAttachments?.length ? imageAttachments : undefined,
        videoAttachments: videoAttachments?.length ? videoAttachments : undefined,
        ts: now,
        timestamp: now,
      });
      // RAG ingestion: embed user message for future retrieval
      const rag = store.getState().settings.rag ?? { enabled: false };
      if (rag.enabled && storedContent) {
        try {
          const embeddings = await embedTexts([storedContent], rag.providerId, rag.model);
          addVectorDocs([
            {
              id: `msg-${threadId}-${now}`,
              text: storedContent,
              embedding: embeddings[0],
              metadata: { threadId, role: "user" },
            },
          ]);
        } catch {
          /* ignore embedding failures; RAG is best-effort */
        }
      }
      lastPromptRef.current = { text: storedContent, imageAttachments, videoAttachments };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        queueRef.current.push({ text: storedContent, imageAttachments, videoAttachments });
        saveOfflineQueue(queueRef.current);
        setQueueSize(queueRef.current.length);
        setError("Offline — queued for retry");
        setStatus("error");
        return;
      }
      await runAssistant(threadId, storedContent);
    },
    [runAssistant, status, cooldownUntil],
  );
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const regenerate = useCallback(async () => {
    const threadId = store.getState().activeThreadId;
    if (!threadId) return;
    const t = store.getState().threads.find((x) => x.id === threadId);
    if (!t) return;
    const lastUser = [...t.messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const idx = t.messages.findIndex((m) => m.id === lastUser.id);
    const trailing = t.messages.slice(idx + 1);
    trailing.forEach((m) => {
      if (m.role === "assistant") {
        store.patchMessage(threadId, m.id, {
          content: "",
          error: false,
          pending: false,
        });
      }
    });
    await runAssistant(threadId, lastUser.content);
  }, [runAssistant]);

  const regenerateFrom = useCallback(
    async (messageId: string) => {
      const threadId = store.getState().activeThreadId;
      if (!threadId) return;
      const t = store.getState().threads.find((x) => x.id === threadId);
      if (!t) return;
      const selectedIndex = t.messages.findIndex((m) => m.id === messageId);
      if (selectedIndex < 0) return;
      const promptIndex =
        t.messages[selectedIndex].role === "user"
          ? selectedIndex
          : [...t.messages.slice(0, selectedIndex)].reverse().findIndex((m) => m.role === "user");
      const userIndex =
        t.messages[selectedIndex].role === "user"
          ? promptIndex
          : promptIndex < 0
            ? -1
            : selectedIndex - promptIndex - 1;
      if (userIndex < 0) return;
      const prompt = t.messages[userIndex];
      store.setThreadMessages(threadId, t.messages.slice(0, userIndex + 1));
      await runAssistant(threadId, prompt.content);
    },
    [runAssistant],
  );

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      const threadId = store.getState().activeThreadId;
      if (!threadId) return;
      const t = store.getState().threads.find((x) => x.id === threadId);
      if (!t) return;
      const idx = t.messages.findIndex((m) => m.id === messageId && m.role === "user");
      if (idx < 0) return;
      const now = Date.now();
      const edited = {
        ...t.messages[idx],
        content: newContent,
        ts: now,
        timestamp: now,
      };
      store.setThreadMessages(threadId, [...t.messages.slice(0, idx), edited]);
      void syncThreadToServer(threadId);
      lastPromptRef.current = { text: newContent };
      await runAssistant(threadId, newContent);
    },
    [runAssistant],
  );

  const executeTool = useCallback(
    async (messageId: string, call: ToolCall) => {
      const threadId = store.getState().activeThreadId;
      if (!threadId) return;
      const result = await executeBuiltInTool(call.name, call.arguments);
      store.addMessage(threadId, {
        id: crypto.randomUUID(),
        role: "tool",
        content: result,
        ts: Date.now(),
        timestamp: Date.now(),
        toolResults: [{ callId: call.id, name: call.name, content: result }],
      });
      // Re-run assistant with the tool result in context
      await runAssistant(threadId, "", BUILT_IN_TOOLS);
    },
    [runAssistant],
  );

  const retry = useCallback(async () => {
    if (lastPromptRef.current) {
      setError(null);
      const threadId = store.getState().activeThreadId;
      if (threadId) await runAssistant(threadId, lastPromptRef.current.text);
    }
  }, [runAssistant]);

  // satisfy eslint unused
  void settings;

  return {
    messages,
    status,
    error,
    isStreaming: status === "streaming",
    sendMessage,
    stop,
    regenerate,
    regenerateFrom,
    editMessage,
    executeTool,
    retry,
    isOnline,
    queueSize,
    cooldownSeconds: cooldownNow,
    isCoolingDown: !!cooldownUntil,
  };
}
