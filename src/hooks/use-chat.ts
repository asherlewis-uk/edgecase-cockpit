import { useCallback, useRef, useState } from "react";
import {
  store,
  useStore,
  callEndpoint,
  type Message,
  type EndpointLabel,
} from "@/lib/cockpit-store";

export type UseChatOptions = {
  endpointId: string;
};

export function useChat({ endpointId }: UseChatOptions) {
  const settings = useStore((s) => s.settings);
  const threads = useStore((s) => s.threads);
  const activeId = useStore((s) => s.activeThreadId);
  const active = threads.find((t) => t.id === activeId) || null;
  const messages: Message[] = active?.messages ?? [];

  const [status, setStatus] = useState<"idle" | "streaming" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastPromptRef = useRef<string | null>(null);

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
        .map((m) => ({ role: m.role, content: m.content }));

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
        store.patchMessage(threadId, placeholderId, {
          content: res.text || "(empty response)",
          cached: res.cached,
          endpointLabel: res.label,
          endpointUsed: endpoint.path,
          pending: false,
        });
        setStatus("idle");
      } catch (e) {
        const aborted = (e as Error).name === "AbortError";
        const msg = aborted ? "Stopped" : (e as Error).message;
        store.patchMessage(threadId, placeholderId, {
          content: acc || msg,
          error: !aborted,
          pending: false,
        });
        if (!aborted) {
          setError(msg);
          setStatus("error");
        } else {
          setStatus("idle");
        }
      } finally {
        abortRef.current = null;
      }
    },
    [resolveEndpoint],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || status === "streaming") return;
      let threadId = store.getState().activeThreadId;
      if (!threadId) threadId = store.newThread();
      const now = Date.now();
      store.addMessage(threadId, {
        id: crypto.randomUUID(),
        role: "user",
        content,
        ts: now,
        timestamp: now,
      });
      lastPromptRef.current = content;
      await runAssistant(threadId, content);
    },
    [runAssistant, status],
  );

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
      if (threadId) await runAssistant(threadId, lastPromptRef.current);
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
  };
}