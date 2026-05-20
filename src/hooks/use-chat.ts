import { useCallback, useEffect, useRef, useState } from "react";
import {
  store,
  useStore,
  callEndpoint,
  ApiError,
  type Message,
  type EndpointLabel,
} from "@/lib/cockpit-store";

export type UseChatOptions = {
  endpointId: string;
  onAuthError?: (message: string) => void;
};

export function useChat({ endpointId, onAuthError }: UseChatOptions) {
  const settings = useStore((s) => s.settings);
  const threads = useStore((s) => s.threads);
  const activeId = useStore((s) => s.activeThreadId);
  const active = threads.find((t) => t.id === activeId) || null;
  const messages: Message[] = active?.messages ?? [];

  const [status, setStatus] = useState<"idle" | "streaming" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownNow, setCooldownNow] = useState(0);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [queueSize, setQueueSize] = useState(0);
  const queueRef = useRef<{ text: string; attachments?: string[] }[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const lastPromptRef = useRef<{ text: string; attachments?: string[] } | null>(
    null,
  );
  const backoffRef = useRef(0); // count of consecutive 429s

  // Online/offline tracking + flush queue
  useEffect(() => {
    if (typeof window === "undefined") return;
    const on = () => {
      setIsOnline(true);
      // drain queue
      const q = queueRef.current.splice(0);
      setQueueSize(0);
      (async () => {
        for (const item of q) {
          await sendMessageRef.current?.(item.text, item.attachments);
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

  // Cooldown ticker
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

  const resolveEndpoint = useCallback((): EndpointLabel | undefined => {
    return (
      settings.endpoints.find((e) => e.id === endpointId) ??
      settings.endpoints[0]
    );
  }, [settings.endpoints, endpointId]);

  const runAssistant = useCallback(
    async (threadId: string, prompt: string) => {
      const endpoint = resolveEndpoint();
      if (!endpoint) {
        setError("No endpoint configured");
        setStatus("error");
        return;
      }
      const placeholderId = crypto.randomUUID();
      const now = Date.now();
      store.addMessage(threadId, {
        id: placeholderId,
        role: "assistant",
        content: "",
        endpointLabel: endpoint.label,
        endpointUsed: endpoint.path,
        pending: true,
        ts: now,
        timestamp: now,
      });

      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("streaming");
      setError(null);

      const history = store
        .getState()
        .threads.find((t) => t.id === threadId)!
        .messages.filter((m) => m.role !== "assistant" || m.content)
        .map((m) => {
          if (m.attachments && m.attachments.length) {
            return {
              role: m.role,
              content: [
                ...(m.content ? [{ type: "text", text: m.content }] : []),
                ...m.attachments.map((url) => ({
                  type: "image_url",
                  image_url: { url },
                })),
              ],
            };
          }
          return { role: m.role, content: m.content };
        });

      let acc = "";
      try {
        const res = await callEndpoint({
          endpoint,
          settings: store.getState().settings,
          messages: history,
          prompt,
          signal: controller.signal,
          onDelta: (chunk) => {
            if (endpoint.stream) {
              acc += chunk;
              store.patchMessage(threadId, placeholderId, {
                content: acc,
                pending: true,
              });
            }
          },
        });
        const finalText = (res.text || "").trim();
        store.patchMessage(threadId, placeholderId, {
          content: finalText,
          cached: res.cached,
          endpointLabel: res.label,
          endpointUsed: endpoint.path,
          pending: false,
        });
        backoffRef.current = 0;
        setStatus("idle");
      } catch (e) {
        const err = e as Error;
        const aborted = err.name === "AbortError";
        const msg = aborted ? "Stopped" : err.message;
        const apiErr = e instanceof ApiError ? e : null;
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
          const base = apiErr.retryAfter
            ? apiErr.retryAfter
            : Math.min(2 ** backoffRef.current, 60);
          setCooldownUntil(Date.now() + base * 1000);
          setError(`Rate limited — retrying in ${base}s`);
          setStatus("error");
        } else if (
          typeof navigator !== "undefined" &&
          !navigator.onLine
        ) {
          // queue for when we're back online
          if (lastPromptRef.current) {
            queueRef.current.push(lastPromptRef.current);
            setQueueSize(queueRef.current.length);
          }
          setError("Offline — queued for retry");
          setStatus("error");
        } else {
          setError(msg);
          setStatus("error");
        }
      } finally {
        abortRef.current = null;
      }
    },
    [resolveEndpoint, onAuthError],
  );

  const sendMessage = useCallback(
    async (text: string, attachments?: string[]) => {
      const content = text.trim();
      if ((!content && !attachments?.length) || status === "streaming") return;
      if (cooldownUntil && cooldownUntil > Date.now()) return;
      let threadId = store.getState().activeThreadId;
      if (!threadId) threadId = store.newThread();
      const now = Date.now();
      store.addMessage(threadId, {
        id: crypto.randomUUID(),
        role: "user",
        content,
        attachments: attachments?.length ? attachments : undefined,
        ts: now,
        timestamp: now,
      });
      lastPromptRef.current = { text: content, attachments };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        queueRef.current.push({ text: content, attachments });
        setQueueSize(queueRef.current.length);
        setError("Offline — queued for retry");
        setStatus("error");
        return;
      }
      await runAssistant(threadId, content);
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
    // find last user message
    const lastUser = [...t.messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    // remove trailing assistant after lastUser
    const idx = t.messages.findIndex((m) => m.id === lastUser.id);
    const trailing = t.messages.slice(idx + 1);
    trailing.forEach((m) => {
      if (m.role === "assistant") {
        store.patchMessage(threadId, m.id, { content: "", error: false, pending: false });
      }
    });
    await runAssistant(threadId, lastUser.content);
  }, [runAssistant]);

  const retry = useCallback(async () => {
    if (lastPromptRef.current) {
      setError(null);
      const threadId = store.getState().activeThreadId;
      if (threadId) await runAssistant(threadId, lastPromptRef.current.text);
    }
  }, [runAssistant]);

  return {
    messages,
    status,
    error,
    isStreaming: status === "streaming",
    sendMessage,
    stop,
    regenerate,
    retry,
    isOnline,
    queueSize,
    cooldownSeconds: cooldownNow,
    isCoolingDown: !!cooldownUntil,
  };
}