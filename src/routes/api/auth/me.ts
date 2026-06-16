import { createFileRoute } from "@tanstack/react-router";
import { getUserById } from "@/lib/auth.server";
import { getCockpitSession } from "@/lib/session.server";

export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async () => {
        const session = await getCockpitSession();
        if (!session.data.userId) {
          return Response.json({ error: "Not authenticated" }, { status: 401 });
        }

        const user = await getUserById(session.data.userId);
        if (!user) {
          return Response.json({ error: "User not found" }, { status: 401 });
        }

        const { password_hash, ...publicUser } = user;
        return Response.json({ user: publicUser });
      },
    },
  },
});
