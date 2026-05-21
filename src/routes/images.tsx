import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore } from "@/lib/cockpit-store";
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
  const images = threads.flatMap((t) =>
    t.messages.flatMap((m) =>
      (m.attachments ?? []).map((src) => ({ src, threadId: t.id })),
    ),
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
            <p className="text-sm">No images yet. Drop or paste one into a chat.</p>
            <Link
              to="/settings"
              className="mt-2 rounded-full bg-white/10 px-4 py-2 text-xs text-white hover:bg-white/20"
            >
              Configure image endpoint
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((img, i) => (
              <img
                key={i}
                src={img.src}
                alt=""
                className="aspect-square w-full rounded-xl object-cover ring-1 ring-white/10"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}