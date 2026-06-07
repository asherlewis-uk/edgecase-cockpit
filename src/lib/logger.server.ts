type LogLevel = "debug" | "info" | "warn" | "error";

type LogEntry = {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  sessionId?: string;
  [key: string]: unknown;
};

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function getConfiguredLevel(): LogLevel {
  const env = (typeof process !== "undefined" && process.env?.LOG_LEVEL) || "info";
  if (env in LEVEL_ORDER) return env as LogLevel;
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[getConfiguredLevel()];
}

let currentRequestId: string | undefined;

export function setRequestContext(requestId: string, _sessionId?: string): void {
  currentRequestId = requestId;
}

function buildEntry(level: LogLevel, message: string, meta?: Record<string, unknown>): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(currentRequestId ? { requestId: currentRequestId } : {}),
    ...meta,
  };
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (shouldLog("debug")) console.debug(JSON.stringify(buildEntry("debug", message, meta)));
  },
  info: (message: string, meta?: Record<string, unknown>) => {
    if (shouldLog("info")) console.log(JSON.stringify(buildEntry("info", message, meta)));
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    if (shouldLog("warn")) console.warn(JSON.stringify(buildEntry("warn", message, meta)));
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    if (shouldLog("error")) console.error(JSON.stringify(buildEntry("error", message, meta)));
  },
};
