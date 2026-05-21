import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Cockpit } from "./index";
import { store, useStore } from "@/lib/cockpit-store";

export const Route = createFileRoute("/thread/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Thread ${params.id.slice(0, 8)} — Cockpit` },
      { name: "description", content: "Continue a saved conversation." },
    ],
  }),
  component: ThreadPage,
});

function ThreadPage() {
  const { id } = Route.useParams();
  const threads = useStore((s) => s.threads);
  const exists = threads.some((t) => t.id === id);
  const navigate = useNavigate();

  useEffect(() => {
    if (exists) store.selectThread(id);
  }, [id, exists]);

  useEffect(() => {
    if (!exists && threads.length >= 0) {
      // thread vanished — bounce to home
      const t = setTimeout(() => navigate({ to: "/" }), 800);
      return () => clearTimeout(t);
    }
  }, [exists, threads.length, navigate]);

  if (!exists) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-black text-white/70">
        <p className="text-sm">Thread not found — returning home…</p>
      </div>
    );
  }
  return <Cockpit />;
}