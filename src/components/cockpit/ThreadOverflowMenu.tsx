import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  MoreHorizontal,
  Check,
  Pencil,
  Trash2,
  Link as LinkIcon,
  Copy,
  Archive,
  ArchiveRestore,
  Download,
  FileJson,
  FileText,
  FileType,
  Settings as SettingsIcon,
} from "lucide-react";
import { store, useStore } from "@/lib/cockpit-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ThreadOverflowMenu() {
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

  function handleExportJSON() {
    if (!thread) return;
    const data = {
      title: thread.title,
      exportedAt: new Date().toISOString(),
      messages: thread.messages.map((m) => ({
        role: m.role,
        content: m.content,
        providerName: m.providerName,
        ts: m.ts,
        attachments: m.attachments,
        videoAttachments: m.videoAttachments,
      })),
    };
    downloadBlob(
      JSON.stringify(data, null, 2),
      `${thread.title.slice(0, 32).replace(/\s+/g, "_")}.json`,
      "application/json",
    );
    toast.success("Exported as JSON");
  }

  function handleExportMarkdown() {
    if (!thread) return;
    const lines = [`# ${thread.title}`, `_Exported ${new Date().toLocaleString()}_`, ""];
    for (const m of thread.messages) {
      if (m.role === "system") continue;
      const label = m.role === "user" ? "**You**" : `**${m.providerName ?? "Assistant"}**`;
      lines.push(`### ${label}`);
      lines.push("");
      lines.push(m.content || "_no content_");
      lines.push("");
    }
    downloadBlob(
      lines.join("\n"),
      `${thread.title.slice(0, 32).replace(/\s+/g, "_")}.md`,
      "text/markdown",
    );
    toast.success("Exported as Markdown");
  }

  function handleExportText() {
    if (!thread) return;
    const lines = [thread.title, new Date().toLocaleString(), ""];
    for (const m of thread.messages) {
      if (m.role === "system") continue;
      const label = m.role === "user" ? "You" : (m.providerName ?? "Assistant");
      lines.push(`--- ${label} ---`);
      lines.push(m.content || "(no content)");
      lines.push("");
    }
    downloadBlob(
      lines.join("\n"),
      `${thread.title.slice(0, 32).replace(/\s+/g, "_")}.txt`,
      "text/plain",
    );
    toast.success("Exported as plain text");
  }

  function handleArchive() {
    if (!thread) return;
    if (!window.confirm("Archive this chat? You can restore it later.")) return;
    store.archiveThread(thread.id);
    toast.success("Chat archived");
    navigate({ to: "/" });
  }

  function handleUnarchive() {
    if (!thread) return;
    store.unarchiveThread(thread.id);
    toast.success("Chat restored");
  }

  function handlePin() {
    if (!thread) return;
    if (thread.pinned) {
      store.unpinThread(thread.id);
      toast.success("Chat unpinned");
    } else {
      store.pinThread(thread.id);
      toast.success("Chat pinned");
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
        <DropdownMenuItem onClick={handlePin} className="focus:bg-white/10">
          <Pencil className="mr-2 size-4" /> {thread?.pinned ? "Unpin" : "Pin"} chat
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
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="focus:bg-white/10">
            <Download className="mr-2 size-4" /> Export as…
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="border-white/10 bg-zinc-950 text-white">
            <DropdownMenuItem onClick={handleExportJSON} className="focus:bg-white/10">
              <FileJson className="mr-2 size-4" /> JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportMarkdown} className="focus:bg-white/10">
              <FileText className="mr-2 size-4" /> Markdown
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportText} className="focus:bg-white/10">
              <FileType className="mr-2 size-4" /> Plain Text
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem
          onClick={() => navigate({ to: "/settings" })}
          className="focus:bg-white/10"
        >
          <SettingsIcon className="mr-2 size-4" /> Settings
        </DropdownMenuItem>
        {thread?.archived ? (
          <DropdownMenuItem onClick={handleUnarchive} className="focus:bg-white/10">
            <ArchiveRestore className="mr-2 size-4" /> Restore
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={handleArchive} className="focus:bg-white/10">
            <Archive className="mr-2 size-4" /> Archive
          </DropdownMenuItem>
        )}
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
