import { app, BrowserWindow, shell, session, protocol } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In production the renderer is the pre-built dist/client/index.html.
// In dev (ELECTRON_DEV=true) we load the Vite dev server instead.
const DEV = process.env.ELECTRON_DEV === "true";
const DEV_URL = process.env.ELECTRON_DEV_URL ?? "http://localhost:5173";

// Local provider ports that should have CORS headers injected.
// These match the defaultBaseUrl values of all local providers.
const LOCAL_PROVIDER_PORTS = [11434, 1234, 8000, 8080, 8081, 8787];

// Deployed Cloudflare Worker API used by packaged native builds.
// Matches the default in src/lib/api-base.ts; can be overridden via env.
const NATIVE_API_URL =
  process.env.VITE_NATIVE_API_URL?.replace(/\/+$/, "") ||
  "https://edgecase-cockpit.asher-lewis-knight.workers.dev";

// Privilege the custom app:// scheme so it behaves like a standard secure origin
// (required for module scripts, fetch, and relative asset resolution).
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      allowServiceWorkers: false,
    },
  },
]);

const clientRoot = path.resolve(path.join(__dirname, "..", "..", "dist", "client"));

const mimeTypes: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function mimeTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] ?? "application/octet-stream";
}

async function registerAppProtocol(): Promise<void> {
  const handler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") {
      pathname = "/index.html";
    }

    const resolved = path.resolve(path.join(clientRoot, pathname));
    if (!resolved.startsWith(clientRoot)) {
      return new Response("Forbidden", { status: 403 });
    }

    let target = resolved;
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      const ext = path.extname(pathname);
      if (ext && ext !== ".html") {
        return new Response("Not found", { status: 404 });
      }
      target = path.join(clientRoot, "index.html");
    }

    const data = fs.readFileSync(target);
    return new Response(data, {
      status: 200,
      headers: { "Content-Type": mimeTypeForPath(target) },
    });
  };

  const cockpitSession = session.fromPartition("persist:cockpit");
  for (const p of [protocol, cockpitSession.protocol]) {
    try {
      await p.handle("app", handler);
    } catch (err: unknown) {
      // Electron throws if the scheme is already handled; ignore that.
      const message = err instanceof Error ? err.message : String(err);
      if (!/already registered|is already handled/i.test(message)) {
        throw err;
      }
    }
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Edgecase Cockpit",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.cjs"),
      // Context isolation keeps Node.js APIs out of renderer code.
      contextIsolation: true,
      // nodeIntegration must stay false — renderer talks to the CF Worker, not Node.
      nodeIntegration: false,
      // Partition keeps session cookies persistent between launches.
      partition: "persist:cockpit",
    },
  });

  // ── CORS bypass for localhost providers (Ollama, LM Studio, vLLM, etc.) ──
  // In production (app:// origin) the browser blocks fetch to localhost
  // due to CORS. We intercept response headers from localhost endpoints and
  // inject permissive CORS headers so on-device models work without proxy.
  //
  // For the deployed Worker API we also need to support credentials (cookies).
  // The renderer origin is app:// or file://; we set the exact origin and
  // Allow-Credentials so the encrypted session cookie is sent cross-origin.
  const localFilter = {
    urls: [
      `${NATIVE_API_URL}/*`,
      ...LOCAL_PROVIDER_PORTS.map((port) => `http://localhost:${port}/*`),
      ...LOCAL_PROVIDER_PORTS.map((port) => `http://127.0.0.1:${port}/*`),
      "http://*.local/*",
    ],
  };

  win.webContents.session.webRequest.onHeadersReceived(localFilter, (details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    const isWorkerApi = details.url.startsWith(NATIVE_API_URL);

    if (isWorkerApi) {
      // For the deployed Worker, set the exact renderer origin so credentials
      // (session cookies) are accepted by the browser's CORS policy.
      let rendererOrigin = "app://";
      try {
        const rendererUrl = win.webContents.getURL();
        if (rendererUrl) {
          rendererOrigin = new URL(rendererUrl).origin;
        }
      } catch {
        /* keep default */
      }
      responseHeaders["Access-Control-Allow-Origin"] = [rendererOrigin];
      responseHeaders["Access-Control-Allow-Credentials"] = ["true"];
    } else {
      // For localhost providers, keep permissive CORS (no credentials needed).
      responseHeaders["Access-Control-Allow-Origin"] = ["*"];
    }

    responseHeaders["Access-Control-Allow-Methods"] = ["GET, POST, PUT, DELETE, OPTIONS"];
    responseHeaders["Access-Control-Allow-Headers"] = ["*"];
    callback({ responseHeaders, cancel: false });
  });

  // Capture renderer console messages so packaging/runtime errors are visible.
  // Use the Event<WebContentsConsoleMessageEventParams> object (the only non-deprecated API).
  win.webContents.on("console-message", (details) => {
    const { level, message, lineNumber, sourceId } = details as unknown as {
      level: "debug" | "info" | "warning" | "error";
      message: string;
      lineNumber: number;
      sourceId: string;
    };
    const label =
      level === "error"
        ? "error"
        : level === "warning"
          ? "warn"
          : level === "info"
            ? "info"
            : "verbose";
    console.error(`[renderer:${label}] ${sourceId}:${lineNumber} ${message}`);
  });

  // Minimal load-failure logging so future packaging/runtime issues are
  // visible in the terminal / system logs.
  win.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      console.error(
        `[electron] did-fail-load: ${errorCode} ${errorDescription} at ${validatedURL} (mainFrame=${isMainFrame})`,
      );
    },
  );

  if (DEV) {
    win.loadURL(DEV_URL);
    win.webContents.openDevTools();
  } else {
    // Use a custom app:// protocol so the renderer URL has pathname "/".
    // Loading file:// directly gives a full file path as the pathname, which
    // breaks TanStack Start's client-side route matching and hydration.
    win.loadURL("app://-/");
  }

  // Open external links in the system browser, not inside Electron.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  if (!DEV) {
    await registerAppProtocol();
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // On macOS apps conventionally stay open until the user quits via Cmd+Q.
  if (process.platform !== "darwin") {
    app.quit();
  }
});
