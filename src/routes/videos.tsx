import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Video } from "lucide-react";

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
        <h1 className="text-2xl font-light tracking-tight">Videos</h1>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex flex-col items-center gap-3 py-20 text-white/50">
          <Video className="size-8" />
          <p className="text-sm">
            No videos yet. Configure a video endpoint in Settings to populate this view.
          </p>
          <Link
            to="/"
            className="mt-2 rounded-full bg-white/10 px-4 py-2 text-xs text-white hover:bg-white/20"
          >
            Back to chat
          </Link>
        </div>
      </div>
    </div>
  );
}