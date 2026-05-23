import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Video } from "lucide-react";
import { ProviderStatus } from "@/components/cockpit/ProviderStatus";

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
        <div className="flex flex-col items-center gap-3 py-20 text-white/50">
          <Video className="size-8" />
          <p className="text-sm">
            No videos yet. Choose a video-capable provider to populate this view.
          </p>
          <div className="mt-2 flex gap-2">
            <Link
              to="/settings"
              className="rounded-full bg-white/10 px-4 py-2 text-xs text-white hover:bg-white/20"
            >
              Choose a provider
            </Link>
            <Link
              to="/"
              className="rounded-full bg-white/[0.04] px-4 py-2 text-xs text-white/80 hover:bg-white/[0.1]"
            >
              Back to chat
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}