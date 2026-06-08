// Lightweight local vector store using cosine similarity.
// Persists to localStorage so indexed data survives reloads.
// Supports sentence-level chunking and server-side sync via D1.

export type VectorDoc = {
  id: string;
  text: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
};

const STORE_KEY = "cockpit.vector-store.v1";

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function loadDocs(): VectorDoc[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as VectorDoc[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDocs(docs: VectorDoc[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(docs));
  } catch {
    /* quota exceeded or unavailable */
  }
}

let memoryDocs: VectorDoc[] | null = null;

function getDocs(): VectorDoc[] {
  if (memoryDocs === null) memoryDocs = loadDocs();
  return memoryDocs;
}

function setDocs(docs: VectorDoc[]) {
  memoryDocs = docs;
  saveDocs(docs);
}

export function addVectorDocs(docs: VectorDoc[]) {
  if (docs.length === 0) return;
  const existing = getDocs();
  const existingIds = new Set(existing.map((d) => d.id));
  const newDocs = docs.filter((d) => !existingIds.has(d.id));
  if (newDocs.length === 0) return;
  setDocs([...existing, ...newDocs]);
}

export function removeVectorDocs(ids: string[]) {
  const idSet = new Set(ids);
  setDocs(getDocs().filter((d) => !idSet.has(d.id)));
}

export function clearVectorStore() {
  setDocs([]);
}

export function searchVectorStore(queryEmbedding: number[], topK = 3): VectorDoc[] {
  const docs = getDocs();
  if (docs.length === 0) return [];
  const scored = docs
    .map((d) => ({ doc: d, score: cosineSimilarity(queryEmbedding, d.embedding) }))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.doc);
}

export function getVectorStoreSize(): number {
  return getDocs().length;
}

// ── Chunking ────────────────────────────────────────────────────────────────

/**
 * Split text into sentence-like chunks.
 * Splits first on paragraph breaks (\\n\\n+), then on sentence-ending
 * punctuation (. ! ?) within each paragraph. Chunks shorter than
 * minLength within the same paragraph are merged. Falls back to a
 * single whole-text chunk for very short texts.
 */
export function chunkText(text: string, minLength = 80): string[] {
  if (!text) return [];
  const paragraphs = text
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return [];

  const chunks: string[] = [];
  for (const para of paragraphs) {
    const sentences = para
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length === 0) continue;
    let acc = "";
    for (const sent of sentences) {
      if (acc && acc.length + sent.length < minLength) {
        acc += " " + sent;
      } else if (acc) {
        chunks.push(acc);
        acc = sent;
      } else {
        acc = sent;
      }
    }
    if (acc) chunks.push(acc);
  }
  return chunks.length ? chunks : [paragraphs[0]];
}

// ── Server sync ─────────────────────────────────────────────────────────────

let _serverSyncAvailable = false;

export function setServerSyncAvailable(available: boolean) {
  _serverSyncAvailable = available;
}

export function isServerSyncAvailable(): boolean {
  return _serverSyncAvailable;
}

export async function syncVectorDocToServer(doc: VectorDoc): Promise<void> {
  if (!_serverSyncAvailable) return;
  try {
    await fetch("/api/vector-docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    });
  } catch {
    /* ignore; localStorage is source of truth */
  }
}

export async function loadVectorDocsFromServer(): Promise<VectorDoc[]> {
  if (!_serverSyncAvailable) return [];
  try {
    const res = await fetch("/api/vector-docs");
    if (!res.ok) return [];
    const json = (await res.json()) as { docs: VectorDoc[] };
    return json.docs ?? [];
  } catch {
    return [];
  }
}
