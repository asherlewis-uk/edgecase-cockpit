import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Video } from "lucide-react";
import { ProviderStatus } from "@/components/cockpit/ProviderStatus";
import { useStore, store, resolveProvider, PROVIDERS } from "@/lib/cockpit-store";

export const Route = createFileRoute("/videos")({
  head: () => ({
    meta: [
      { title: "Videos — Cockpit" },
      { name: "description", content: "Video outputs from your /v1 endpoints." },
    ],
  }),
  component: VideosPage,
});

function VideosPage() {
  const threads = useStore((s) => s.threads);
  const settings = useStore((s) => s.settings);
  const { provider } = resolveProvider(settings);
  const videoProviderCount = PROVIDERS.filter(
    (p) => p.mediaCapabilities?.video === "generate",
  ).length;
  const videos = threads.flatMap((t) =>
    t.messages.flatMap((m) => (m.videoAttachments ?? []).map((src) => ({ src, threadId: t.id }))),
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
        <h1 className="flex-1 text-2xl font-light tracking-tight">Videos</h1>
        <ProviderStatus />
      </header>
      <div className="mx-auto max-w-3xl px-4 py-6">
        {videos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-white/50">
            <Video className="size-8" />
            <p className="max-w-xs text-center text-sm">
              No videos yet. Attach a video in chat to populate this view.
              {provider.mediaCapabilities?.video === "generate"
                ? " This provider can also handle video-generation flows when those controls are added."
                : videoProviderCount > 0
                  ? " Choose a video-capable provider for generation workflows."
                  : ""}
            </p>
            <div className="mt-2 flex gap-2">
              <Link
                to="/"
                className="rounded-full bg-white/10 px-4 py-2 text-xs text-white hover:bg-white/20"
              >
                Back to chat
              </Link>
              <Link
                to="/settings"
                className="rounded-full bg-white/[0.04] px-4 py-2 text-xs text-white/80 hover:bg-white/[0.1]"
              >
                Choose a provider
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {videos.map((v, i) => (
              <div
                key={`${v.threadId}-${i}`}
                className="overflow-hidden rounded-xl bg-white/[0.03] ring-1 ring-white/10"
              >
                <video
                  src={v.src}
                  controls
                  playsInline
                  className="aspect-video w-full bg-black object-cover"
                />
                <Link
                  to="/thread/$id"
                  params={{ id: v.threadId }}
                  onClick={() => store.selectThread(v.threadId)}
                  className="block px-3 py-2 text-xs text-white/65 transition hover:text-white"
                >
                  Open source chat
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
