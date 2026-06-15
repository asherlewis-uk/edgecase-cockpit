import { useCallback, useEffect, useRef, useState } from "react";
import {
  store,
  useStore,
  resolveProvider,
  bumpProviderStat,
  recordTokenUsage,
  type Message,
  type Settings,
} from "@/lib/cockpit-store";
import {
  callProviderChat,
  callProviderChatViaProxy,
  ProviderError,
  type ChatMessage,
} from "@/lib/providers";
import { retryWithBackoff } from "@/lib/retry";
import { estimateTokens, extractProviderUsage } from "@/lib/tokens";
import {
  type ToolDef,
  type ToolCall,
  parseOpenAIToolCalls,
  parseAnthropicToolCalls,
  executeBuiltInTool,
  BUILT_IN_TOOLS,
  StreamToolCallAccumulator,
  AnthropicStreamToolCallAccumulator,
  extractOpenAIToolCallDelta,
  extractAnthropicToolCallDelta,
  validateToolCall,
  sanitizeToolCallArgs,
} from "@/lib/tools";
import { embedTexts } from "@/lib/embeddings";
import { addVectorDocs, searchVectorStore, chunkText } from "@/lib/vector-store";
import { toast } from "sonner";

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

function saveOfflineQueue(queue: PromptDraft[]): boolean {
  if (!isLocalStorageAvailable()) return false;
  try {
    if (queue.length === 0) {
      localStorage.removeItem(OFFLINE_QUEUE_KEY);
    } else {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    }
    return true;
  } catch {
    /* quota exceeded or unavailable */
    return false;
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
  const [ragError, setRagError] = useState<string | null>(null);
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
      const saveSuccess = saveOfflineQueue(queueRef.current);
      if (!saveSuccess && typeof window !== "undefined") {
        toast.error("Message could not be saved. Free up space or try again.");
      }
      setQueueSize(0);
      (async () => {
        for (const item of q) {
          await sendMessageRef.current?.(item.text, item.imageAttachments, item.videoAttachments);
        }
        // Show success message after syncing queued messages
        if (q.length > 0 && typeof window !== "undefined") {
          toast.success("Your queued messages have been sent.");
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
          setRagError("RAG retrieval unavailable");
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
      // streaming tool-call deltas:
      //   - OpenAI bodyStyle: uses StreamToolCallAccumulator
      //   - Anthropic bodyStyle: uses AnthropicStreamToolCallAccumulator
      // Otherwise, fall back to non-streaming for reliable tool_calls parsing.
      const hasTools = toolDefs && toolDefs.length > 0;
      const isOpenAI = provider.bodyStyle === "openai" || provider.bodyStyle === "gemini";
      const isAnthropic = provider.bodyStyle === "anthropic";
      const supportsOpenAIStreamingTools = hasTools && isOpenAI && provider.supports.streamingTools;
      const supportsAnthropicStreamingTools =
        hasTools && isAnthropic && provider.supports.streamingTools;
      const supportsStreamingTools =
        supportsOpenAIStreamingTools || supportsAnthropicStreamingTools;
      const useStream = !hasTools || supportsStreamingTools;

      let acc = "";
      const isLocal = provider.type === "local";
      const callFn = isLocal ? callProviderChat : callProviderChatViaProxy;
      const toolAccum = supportsOpenAIStreamingTools ? new StreamToolCallAccumulator() : null;
      const toolAccumAnthropic = supportsAnthropicStreamingTools
        ? new AnthropicStreamToolCallAccumulator()
        : null;
      try {
        // Pre-flight security check: HTTPS pages cannot fetch local HTTP providers
        if (
          isLocal &&
          typeof window !== "undefined" &&
          window.location.protocol === "https:" &&
          baseUrl.startsWith("http://")
        ) {
          throw new ProviderError(
            "Cannot connect to local HTTP provider from an HTTPS website. Please use the Desktop/Mobile app, or serve the web app locally.",
            0,
          );
        }
        bumpProviderStat(provider.id, "call");
        const res = await retryWithBackoff(
          () =>
            callFn({
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
              onToolCallDelta: supportsOpenAIStreamingTools
                ? (delta: {
                    index: number;
                    id?: string;
                    function?: { name?: string; arguments?: string };
                  }) => {
                    toolAccum?.ingest(delta);
                  }
                : undefined,
              onRawChunk: supportsAnthropicStreamingTools
                ? (chunk: unknown) => {
                    const delta = extractAnthropicToolCallDelta(chunk);
                    if (delta) toolAccumAnthropic?.ingest(delta);
                  }
                : undefined,
            }),
          { maxRetries: 3 },
        );
        const finalText = (res.text || acc || "").trim();
        const assistantImages = extractImageUrls(finalText);

        // Detect tool calls from response
        let toolCalls: ToolCall[] | undefined;
        if (supportsOpenAIStreamingTools && toolAccum) {
          toolCalls = toolAccum.complete();
          if (toolCalls.length === 0) toolCalls = undefined;
        } else if (supportsAnthropicStreamingTools && toolAccumAnthropic) {
          toolCalls = toolAccumAnthropic.complete();
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
        // Record token usage — use exact provider usage when available
        let inputTokens: number;
        let outputTokens: number;
        let exactUsage = false;

        const providerUsage =
          typeof res.raw === "object" && res.raw !== null
            ? extractProviderUsage(res.raw, provider.bodyStyle)
            : null;

        if (providerUsage && providerUsage.exact) {
          inputTokens = providerUsage.inputTokens;
          outputTokens = providerUsage.outputTokens;
          exactUsage = true;
        } else {
          inputTokens = history.reduce(
            (sum, m) => sum + estimateTokens(typeof m.content === "string" ? m.content : ""),
            0,
          );
          outputTokens = estimateTokens(finalText);
        }

        recordTokenUsage(provider.id, inputTokens, outputTokens);
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
          const providerName = provider.name;
          const errorMessage = apiKey
            ? `Your API key for ${providerName} is invalid. Update it in Settings.`
            : `No API key set for ${providerName}. Add one in Settings.`;
          setError(errorMessage);
          setStatus("error");
          onAuthError?.(msg);
        } else if (apiErr && apiErr.status === 429) {
          backoffRef.current = Math.min(backoffRef.current + 1, 6);
          const base = apiErr.retryAfter ?? Math.min(2 ** backoffRef.current, 60);
          setCooldownUntil(Date.now() + base * 1000);
          setError(`You've been rate limited by ${provider.name}. Try again in ${base}s.`);
          setStatus("error");
        } else if (typeof navigator !== "undefined" && !navigator.onLine) {
          if (lastPromptRef.current) {
            queueRef.current.push(lastPromptRef.current);
            const saveSuccess = saveOfflineQueue(queueRef.current);
            if (!saveSuccess) {
              setError("Message could not be saved. Free up space or try again.");
            } else {
              setError("You're offline. Messages will send when you reconnect.");
            }
            setQueueSize(queueRef.current.length);
          }
          setStatus("error");
        } else if (isLocal && !apiErr) {
          // Local provider fetch failed (connection refused, timeout, unreachable daemon)
          const clean = msg.toLowerCase().includes("abort")
            ? `${provider.name} is unavailable. Check your connection or try again.`
            : `${provider.name} is unavailable. Check your connection or try again.`;
          lastErrorRef.current = { message: clean, count: 1 };
          setError(clean);
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
      // RAG ingestion: chunk and embed user message for future retrieval
      const rag = store.getState().settings.rag ?? { enabled: false };
      if (rag.enabled && storedContent) {
        try {
          const chunks = chunkText(storedContent);
          const embeddings = await embedTexts(chunks, rag.providerId, rag.model);
          const docs = chunks.map((chunk, i) => ({
            id: `msg-${threadId}-${now}-${i}`,
            text: chunk,
            embedding: embeddings[i],
            metadata: { threadId, role: "user", chunkIndex: i },
          }));
          addVectorDocs(docs);
        } catch {
          setRagError("RAG embedding unavailable");
        }
      }
      lastPromptRef.current = { text: storedContent, imageAttachments, videoAttachments };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        queueRef.current.push({ text: storedContent, imageAttachments, videoAttachments });
        const saveSuccess = saveOfflineQueue(queueRef.current);
        if (!saveSuccess) {
          setError("Message could not be saved. Free up space or try again.");
        } else {
          setError("You're offline. Messages will send when you reconnect.");
        }
        setQueueSize(queueRef.current.length);
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
      lastPromptRef.current = { text: newContent };
      await runAssistant(threadId, newContent);
    },
    [runAssistant],
  );

  const executeTool = useCallback(
    async (messageId: string, call: ToolCall) => {
      const threadId = store.getState().activeThreadId;
      if (!threadId) return;

      // ── Safety guards: validate tool call shape and arguments ──────
      if (!validateToolCall(call)) {
        store.addMessage(threadId, {
          id: crypto.randomUUID(),
          role: "tool",
          content: `[Tool call rejected: invalid shape]`,
          ts: Date.now(),
          timestamp: Date.now(),
        });
        return;
      }

      if (!sanitizeToolCallArgs(call.arguments)) {
        store.addMessage(threadId, {
          id: crypto.randomUUID(),
          role: "tool",
          content: `[Tool call rejected: invalid or oversized arguments]`,
          ts: Date.now(),
          timestamp: Date.now(),
        });
        return;
      }

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
    ragError,
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
