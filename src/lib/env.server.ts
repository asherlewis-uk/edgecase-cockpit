// Validates required environment variables exist at startup.
// Logs warnings for missing optional vars, throws for critical ones.

const OPTIONAL = ["NODE_ENV", "LOG_LEVEL"] as const;
const REQUIRED_SECRET_LENGTH = 32;

export type EnvSource = Record<string, unknown>;

function envString(source: EnvSource, key: string): string | undefined {
  const value = source[key] ?? process.env[key];
  return typeof value === "string" ? value : undefined;
}

function requiresEncryptionKey(source: EnvSource): boolean {
  return envString(source, "NODE_ENV") === "production" || "DB" in source;
}

function secretMissing(source: EnvSource, key: string): boolean {
  const value = envString(source, key);
  return !value || value.length < REQUIRED_SECRET_LENGTH;
}

export function validateEnv(source: EnvSource = process.env): void {
  const missing: string[] = [];
  const warnings: string[] = [];

  if (secretMissing(source, "SESSION_SECRET")) {
    missing.push("SESSION_SECRET");
  }

  if (requiresEncryptionKey(source) && secretMissing(source, "ENCRYPTION_KEY")) {
    missing.push("ENCRYPTION_KEY");
  }

  for (const key of OPTIONAL) {
    if (!envString(source, key)) {
      warnings.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (warnings.length > 0) {
    console.warn(`[env] Missing optional environment variables: ${warnings.join(", ")}`);
  }

  console.log("[env] Environment validation passed");
}

// Origin of the truthful Linux backend API, e.g. http://127.0.0.1:8000.
// Optional: unset until the backend bridge is wired up, so callers must handle
// undefined rather than assuming a default. Reads the Worker runtime env first
// and falls back to process.env, like every other var in this module. A blank
// value is treated as unset so an empty `BACKEND_ORIGIN=` line in .env does not
// yield an "" origin.
export function getBackendOrigin(source: EnvSource = process.env): string | undefined {
  const value = envString(source, "BACKEND_ORIGIN")?.trim();
  return value === "" ? undefined : value;
}
