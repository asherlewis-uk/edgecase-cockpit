import { app, BrowserWindow, shell, session } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In production the renderer is the pre-built dist/client/index.html.
// In dev (ELECTRON_DEV=true) we load the Vite dev server instead.
const DEV = process.env.ELECTRON_DEV === "true";
const DEV_URL = process.env.ELECTRON_DEV_URL ?? "http://localhost:5173";

// Local provider ports that should have CORS headers injected.
// These match the defaultBaseUrl values of all local providers.
const LOCAL_PROVIDER_PORTS = [11434, 1234, 8000, 8080, 8081, 8787];

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Edgecase Cockpit",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      // Context isolation keeps Node.js APIs out of renderer code.
      contextIsolation: true,
      // nodeIntegration must stay false — renderer talks to the CF Worker, not Node.
      nodeIntegration: false,
      // Partition keeps session cookies persistent between launches.
      partition: "persist:cockpit",
    },
  });

  // ── CORS bypass for localhost providers (Ollama, LM Studio, vLLM, etc.) ──
  // In production (file:// origin) the browser blocks fetch to localhost
  // due to CORS. We intercept response headers from localhost endpoints and
  // inject permissive CORS headers so on-device models work without proxy.
  const localFilter = {
    urls: [
      ...LOCAL_PROVIDER_PORTS.map((port) => `http://localhost:${port}/*`),
      ...LOCAL_PROVIDER_PORTS.map((port) => `http://127.0.0.1:${port}/*`),
      "http://*.local/*",
    ],
  };

  win.webContents.session.webRequest.onHeadersReceived(localFilter, (details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    // Inject CORS headers to allow file:// / capacitor:// origins
    responseHeaders["Access-Control-Allow-Origin"] = ["*"];
    responseHeaders["Access-Control-Allow-Methods"] = ["GET, POST, PUT, DELETE, OPTIONS"];
    responseHeaders["Access-Control-Allow-Headers"] = ["*"];
    callback({ responseHeaders, cancel: false });
  });

  if (DEV) {
    win.loadURL(DEV_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "..", "..", "dist", "client", "index.html"));
  }

  // Open external links in the system browser, not inside Electron.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
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
