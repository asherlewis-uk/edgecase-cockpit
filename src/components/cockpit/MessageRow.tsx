import { useState } from "react";
import { ChevronDown, AlertCircle, RefreshCw, Copy, Trash2, Pencil, Check, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Message } from "@/lib/cockpit-store";
import { MarkdownContent } from "./MarkdownContent";

export function PulsingDot() {
  return (
    <div className="flex items-center gap-2 pl-1">
      <span className="size-2.5 animate-pulse rounded-full bg-white/80" />
      <span className="text-xs text-white/40">thinking…</span>
    </div>
  );
}

export function MessageRow({
  m,
  streaming,
  onRegenerate,
  onRegenerateFrom,
  onDelete,
  onEdit,
  showTimestamp,
}: {
  m: Message;
  streaming: boolean;
  onRegenerate: () => void;
  onRegenerateFrom: () => void;
  onDelete: () => void;
  onEdit: (newContent: string) => void;
  showTimestamp: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(m.content);

  const relativeTime = showTimestamp ? formatDistanceToNow(m.ts, { addSuffix: true }) : null;

  function handleSaveEdit() {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== m.content) {
      onEdit(trimmed);
    }
    setEditing(false);
  }

  function handleCancelEdit() {
    setEditText(m.content);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === "Escape") {
      handleCancelEdit();
    }
  }

  if (m.role === "user") {
    if (editing) {
      return (
        <div className="flex justify-end">
          <div className="flex max-w-[82%] flex-col items-end gap-2">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-3xl bg-white/[0.08] px-5 py-3 text-[16px] text-white outline-none ring-1 ring-white/20 focus:ring-white/40 resize-none"
              rows={3}
              autoFocus
            />
            <div className="flex items-center gap-1">
              <button
                onClick={handleSaveEdit}
                className="flex items-center gap-1 rounded-full bg-white/[0.08] px-3 py-1.5 text-xs text-white/80 hover:bg-white/[0.15]"
              >
                <Check className="size-3" /> Save &amp; resend
              </button>
              <button
                onClick={handleCancelEdit}
                className="flex items-center gap-1 rounded-full bg-white/[0.05] px-3 py-1.5 text-xs text-white/50 hover:bg-white/[0.10]"
              >
                <X className="size-3" /> Cancel
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="group flex justify-end">
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
            <div className="rounded-3xl bg-white/[0.08] px-5 py-3 text-[16px] text-white">
              <MarkdownContent content={m.content} />
            </div>
          )}
          <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <button
              onClick={() => {
                setEditText(m.content);
                setEditing(true);
              }}
              className="grid size-7 place-items-center rounded-full text-white/40 hover:text-white/80"
              aria-label="Edit message"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="grid size-7 place-items-center rounded-full text-white/40 hover:text-red-400"
              aria-label="Delete message"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
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
        {relativeTime && <span className="text-white/40">{relativeTime}</span>}
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
            onClick={onRegenerateFrom}
            className="flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3 py-1.5 text-xs text-white/80 hover:bg-white/[0.15]"
          >
            <RefreshCw className="size-3" /> Regenerate
          </button>
        </div>
      ) : (
        <div className="group relative max-w-[92%] break-words text-[16px] leading-relaxed text-white/95">
          <MarkdownContent content={visible ?? ""} />
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
          {!m.error && m.content && !m.pending && (
            <span className="inline-flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
              <button
                onClick={() => navigator.clipboard?.writeText(m.content)}
                className="ml-2 inline-flex size-7 -translate-y-0.5 items-center justify-center rounded-full text-white/40 transition hover:text-white"
                aria-label="Copy"
              >
                <Copy className="size-3.5" />
              </button>
              <button
                onClick={onRegenerateFrom}
                className="inline-flex size-7 -translate-y-0.5 items-center justify-center rounded-full text-white/40 transition hover:text-white"
                aria-label="Regenerate from here"
              >
                <RefreshCw className="size-3.5" />
              </button>
              <button
                onClick={onDelete}
                className="inline-flex size-7 -translate-y-0.5 items-center justify-center rounded-full text-white/40 transition hover:text-red-400"
                aria-label="Delete message"
              >
                <Trash2 className="size-3.5" />
              </button>
            </span>
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
