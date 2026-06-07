/**
 * Strips HTML tags and null bytes from a string, validates UTF-8, and
 * normalizes whitespace. Returns a clean, safe string for storage.
 */
export function sanitizeString(input: string): string {
  // Strip HTML tags
  let cleaned = input.replace(/<[^>]*>/g, "");
  // Replace non-printable control characters (except tabs, newlines, carriage returns)
  cleaned = Array.from(cleaned)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join("");
  // Normalize whitespace: collapse multiple spaces, trim
  cleaned = cleaned.replace(/[ \t]+/g, " ").trim();
  return cleaned;
}

/**
 * Sanitizes message content deeply — walks the content string and any nested
 * string values within array/object content fields (covers tool-call payloads).
 */
export function sanitizeMessage<T extends { content: unknown; role: string }>(message: T): T {
  const sanitized = structuredClone(message);
  sanitized.content = sanitizeValue(sanitized.content);
  return sanitized;
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sanitizeValue(val);
    }
    return result;
  }
  return value;
}
