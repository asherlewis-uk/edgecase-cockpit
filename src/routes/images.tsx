import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore, store, resolveProvider } from "@/lib/cockpit-store";
import { ArrowLeft, ImageOff } from "lucide-react";
import { ProviderStatus } from "@/components/cockpit/ProviderStatus";

export const Route = createFileRoute("/images")({
  head: () => ({
    meta: [
      { title: "Images — Cockpit" },
      { name: "description", content: "All images shared across your chats." },
    ],
  }),
  component: ImagesPage,
});

function ImagesPage() {
  const threads = useStore((s) => s.threads);
  const settings = useStore((s) => s.settings);
  const { provider } = resolveProvider(settings);
  const images = threads.flatMap((t) =>
    t.messages.flatMap((m) => [
      ...(m.attachments ?? []).map((src) => ({ src, threadId: t.id, kind: "user" as const })),
      ...(m.assistantImages ?? []).map((src) => ({
        src,
        threadId: t.id,
        kind: "assistant" as const,
      })),
    ]),
  );
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
        <h1 className="flex-1 text-2xl font-light tracking-tight">Images</h1>
        <ProviderStatus />
      </header>
      <div className="mx-auto max-w-3xl px-4 py-6">
        {images.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-white/50">
            <ImageOff className="size-8" />
            <p className="max-w-xs text-center text-sm">
              {provider.supports.vision
                ? "No images yet. Drop, paste, or capture one in chat."
                : `${provider.name} does not support image review yet.`}
            </p>
            <div className="mt-2 flex gap-2">
              <Link
                to="/"
                className="rounded-full bg-white/10 px-4 py-2 text-xs text-white hover:bg-white/20"
              >
                Back to chat
              </Link>
              {!provider.supports.vision && (
                <Link
                  to="/settings"
                  className="rounded-full bg-white/[0.04] px-4 py-2 text-xs text-white/80 hover:bg-white/[0.1]"
                >
                  Choose a vision provider
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((img, i) => (
              <Link
                key={`${img.threadId}-${i}`}
                to="/thread/$id"
                params={{ id: img.threadId }}
                onClick={() => store.selectThread(img.threadId)}
                className="group relative overflow-hidden rounded-xl ring-1 ring-white/10"
                aria-label="Open source chat"
              >
                <img src={img.src} alt="" className="aspect-square w-full object-cover" />
                <span className="absolute bottom-1 left-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70 opacity-0 transition group-hover:opacity-100">
                  {img.kind === "assistant" ? "Output" : "Chat"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
