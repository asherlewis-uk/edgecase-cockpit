import { createFileRoute } from "@tanstack/react-router";
import { getCockpitSession } from "@/lib/session.server";
import { getThread } from "@/lib/db";

export const Route = createFileRoute("/api/threads/$id/export")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const session = await getCockpitSession();
        if (!session.data.id) {
          return Response.json({ error: "No session" }, { status: 401 });
        }

        const id = params.id;
        if (!id) {
          return Response.json({ error: "Missing thread id" }, { status: 400 });
        }

        const thread = await getThread(session.data.id, id, session.data.userId);
        if (!thread) {
          return Response.json({ error: "Thread not found" }, { status: 404 });
        }

        const url = new URL(request.url);
        const format = url.searchParams.get("format") ?? "json";

        let body: string;
        let contentType: string;
        let extension: string;

        switch (format) {
          case "markdown": {
            let md = `# ${thread.title}\n\n`;
            for (const msg of thread.messages) {
              md += `**${msg.role}**: ${msg.content}\n\n`;
            }
            body = md;
            contentType = "text/markdown; charset=utf-8";
            extension = "md";
            break;
          }
          case "txt": {
            let txt = "";
            for (const msg of thread.messages) {
              txt += `${msg.role.toUpperCase()}:\n${msg.content}\n\n`;
            }
            body = txt;
            contentType = "text/plain; charset=utf-8";
            extension = "txt";
            break;
          }
          default: {
            body = JSON.stringify({ thread }, null, 2);
            contentType = "application/json; charset=utf-8";
            extension = "json";
            break;
          }
        }

        const filename = `${thread.title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64)}.${extension}`;

        return new Response(body, {
          headers: {
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
          },
        });
      },
    },
  },
});
