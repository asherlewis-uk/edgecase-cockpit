// Client-side embedding helper. Calls the server proxy so the browser never
// sends API keys to third-party endpoints.

import { csrfHeaders } from "@/lib/cockpit-store";
import { apiFetch } from "@/lib/api-base";

export async function embedTexts(
  texts: string[],
  providerId = "openai",
  model?: string,
): Promise<number[][]> {
  const res = await apiFetch("/api/proxy/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify({ providerId, model, input: texts }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Embedding failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as { embeddings: number[][] };
  return json.embeddings;
}
