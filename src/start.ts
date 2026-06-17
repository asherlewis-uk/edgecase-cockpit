import { createStart, createMiddleware } from "@tanstack/react-start";

import { setPlatformEnv } from "./lib/platform.server";
import { renderErrorPage } from "./lib/error-page";

const platformEnvMiddleware = createMiddleware().server(async ({ request, next }) => {
  // Cloudflare/Nitro runtimes attach env to request.runtime.cloudflare.env.
  // Capture it here so every TanStack Start server function/SSR request has
  // the platform env available via getPlatformEnv() / getDB().
  const req = request as { runtime?: { cloudflare?: { env?: unknown } } };
  const env = req.runtime?.cloudflare?.env;
  if (env) {
    setPlatformEnv(env);
  }
  return await next();
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [platformEnvMiddleware, errorMiddleware],
}));
