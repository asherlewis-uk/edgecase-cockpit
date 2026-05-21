import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore } from "@/lib/cockpit-store";
import { ArrowLeft, FileText } from "lucide-react";
import { ProviderStatus } from "@/components/cockpit/ProviderStatus";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Library — Cockpit" },
      { name: "description", content: "All saved chats and threads." },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const threads = useStore((s) => s.threads);
  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <header className="flex items-center gap-3 px-4 pt-5">
        <Link
          to="/"
          className="grid size-10 place-items-center rounded-full bg-white/[0.06] hover:bg-white/[0.12]"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="flex-1 text-2xl font-light tracking-tight">Library</h1>
        <ProviderStatus />
      </header>
      <div className="mx-auto max-w-3xl px-4 py-6">
        {threads.length === 0 ? (
          <p className="text-sm text-white/50">Nothing saved yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {threads.map((t) => (
              <li key={t.id}>
                <Link
                  to="/"
                  onClick={() => {
                    import("@/lib/cockpit-store").then((m) =>
                      m.store.selectThread(t.id),
                    );
                  }}
                  className="flex items-center gap-3 rounded-2xl px-4 py-3 hover:bg-white/[0.05]"
                >
                  <FileText className="size-4 text-white/60" />
                  <span className="flex-1 truncate text-[15px] text-white/90">
                    {t.title || "Untitled"}
                  </span>
                  <span className="text-xs text-white/40">
                    {t.messages.length} msg
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}