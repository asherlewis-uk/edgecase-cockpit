// Validates required environment variables exist at startup.
// Logs warnings for missing optional vars, throws for critical ones.

const REQUIRED = ["SESSION_SECRET"] as const;
const OPTIONAL = ["NODE_ENV", "LOG_LEVEL"] as const;

export function validateEnv(): void {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const key of REQUIRED) {
    if (!process.env[key] || (key === "SESSION_SECRET" && process.env[key]!.length < 32)) {
      missing.push(key);
    }
  }

  for (const key of OPTIONAL) {
    if (!process.env[key]) {
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
