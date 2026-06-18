import { apiFetch } from "@/lib/api-base";
import { store } from "@/lib/cockpit-store";
// Lightweight local vector store using cosine similarity.
// Persists to localStorage so indexed data survives reloads.
// Supports sentence-level chunking and server-side sync via D1.

export type VectorDoc = {
  id: string;
  text: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
};

const STORE_KEY_BASE = "cockpit.vector-store.v1";

/** Return the localStorage vector-store key for the current account scope. */
function getStoreKey(): string {
  const scope = store.getState().user?.id ?? "guest";
  return `${STORE_KEY_BASE}:${scope}`;
}

function getStoreKeyForUser(userId: string): string {
  return `${STORE_KEY_BASE}:${userId}`;
}

function getGuestStoreKey(): string {
  return `${STORE_KEY_BASE}:guest`;
}

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
    const raw = localStorage.getItem(getStoreKey());
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
    localStorage.setItem(getStoreKey(), JSON.stringify(docs));
  } catch {
    /* quota exceeded or unavailable */
  }
}

let memoryDocs: VectorDoc[] | null = null;

let _crossTabSyncSetup = false;

/**
 * Lazily register a storage event listener that invalidates the in-memory
 * cache when another same-origin tab writes to the vector-store key.
 * This ensures the next getDocs() call reads fresh data from localStorage.
 */
function ensureVectorStoreCrossTabSync() {
  if (_crossTabSyncSetup || typeof window === "undefined") return;
  _crossTabSyncSetup = true;
  window.addEventListener("storage", (e) => {
    const activeKey = getStoreKey();
    if (e.key === activeKey) {
      memoryDocs = null; // invalidate so next getDocs() re-reads localStorage
    }
  });
}

/** For tests: reset cross-tab sync setup state. */
export function __resetVectorStoreCrossTabSync(): void {
  _crossTabSyncSetup = false;
}

/** Load docs from a specific account bucket without mutating the shared cache. */
function loadDocsForKey(key: string): VectorDoc[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as VectorDoc[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Switch the vector store cache to the account for the given user id. */
export function loadVectorStoreForUser(userId: string | null) {
  const key = userId ? getStoreKeyForUser(userId) : getGuestStoreKey();
  memoryDocs = loadDocsForKey(key);
}

/** Clear the in-memory cache so the next access reads from the current bucket. */
export function clearVectorStoreCache() {
  memoryDocs = null;
}

/** Directly search docs from a specific account bucket (for tests). */
export function searchVectorStoreForUser(
  userId: string | null,
  queryEmbedding: number[],
  topK = 3,
): VectorDoc[] {
  const key = userId ? getStoreKeyForUser(userId) : getGuestStoreKey();
  const docs = loadDocsForKey(key);
  if (docs.length === 0) return [];
  const scored = docs
    .map((d) => ({ doc: d, score: cosineSimilarity(queryEmbedding, d.embedding) }))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.doc);
}

/** Add docs directly to a specific account bucket (for tests). */
export function addVectorDocsForUser(userId: string | null, docs: VectorDoc[]) {
  const key = userId ? getStoreKeyForUser(userId) : getGuestStoreKey();
  const existing = loadDocsForKey(key);
  const existingIds = new Set(existing.map((d) => d.id));
  const newDocs = docs.filter((d) => !existingIds.has(d.id));
  if (newDocs.length === 0) return;
  const next = [...existing, ...newDocs];
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
}

function getDocs(): VectorDoc[] {
  ensureVectorStoreCrossTabSync();
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
    await apiFetch("/api/vector-docs", {
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
    const res = await apiFetch("/api/vector-docs");
    if (!res.ok) return [];
    const json = (await res.json()) as { docs: VectorDoc[] };
    return json.docs ?? [];
  } catch {
    return [];
  }
}
