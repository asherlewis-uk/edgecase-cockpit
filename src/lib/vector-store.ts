// Lightweight local vector store using cosine similarity.
// Persists to localStorage so indexed data survives reloads.
// For this pass, chunking is simple (whole messages). Future passes
// can add sentence-level chunking.

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
