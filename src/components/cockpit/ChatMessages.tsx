import { type RefObject } from "react";
import { AlertCircle, Clock, RefreshCw } from "lucide-react";
import type { Message } from "@/lib/cockpit-store";
import { store } from "@/lib/cockpit-store";
import { MessageRow } from "@/components/cockpit/MessageRow";

export function ChatMessages({
  messages,
  isStreaming,
  scrollRef,
  onRegenerate,
  onRegenerateFrom,
  onEditMessage,
  onRetry,
  error,
  isCoolingDown,
  cooldownSeconds,
}: {
  messages: Message[];
  isStreaming: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onRegenerate: () => void;
  onRegenerateFrom: (messageId: string) => void;
  onEditMessage: (messageId: string, newContent: string) => void;
  onRetry: () => void;
  error: string | null;
  isCoolingDown: boolean;
  cooldownSeconds: number;
}) {
  return (
    <div ref={scrollRef} className="relative z-0 flex-1 overflow-y-auto px-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 py-8">
        {messages.map((m, idx) => {
          const showTimestamp =
            idx === 0 || (idx > 0 && m.ts - messages[idx - 1].ts > 5 * 60 * 1000);
          return (
            <MessageRow
              key={m.id}
              m={m}
              streaming={isStreaming}
              onRegenerate={onRegenerate}
              onRegenerateFrom={() => onRegenerateFrom(m.id)}
              onDelete={() => {
                const activeId = store.getState().activeThreadId;
                if (activeId) store.deleteMessage(activeId, m.id);
              }}
              onEdit={(newContent) => onEditMessage(m.id, newContent)}
              showTimestamp={showTimestamp}
            />
          );
        })}
        {error && (
          <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
            {isCoolingDown ? <Clock className="size-4" /> : <AlertCircle className="size-4" />}
            <span className="flex-1 truncate">{error}</span>
            {isCoolingDown ? (
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs tabular-nums text-white">
                {cooldownSeconds}s
              </span>
            ) : (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
              >
                <RefreshCw className="size-3" /> Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
