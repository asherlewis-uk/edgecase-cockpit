import { describe, it, expect, beforeEach } from "vitest";
import {
  addVectorDocs,
  removeVectorDocs,
  clearVectorStore,
  searchVectorStore,
  getVectorStoreSize,
  chunkText,
} from "@/lib/vector-store";

beforeEach(() => {
  clearVectorStore();
});

describe("addVectorDocs", () => {
  it("adds documents to the store", () => {
    addVectorDocs([{ id: "1", text: "hello", embedding: [1, 0, 0] }]);
    expect(getVectorStoreSize()).toBe(1);
  });

  it("ignores duplicates by id", () => {
    addVectorDocs([{ id: "1", text: "hello", embedding: [1, 0, 0] }]);
    addVectorDocs([{ id: "1", text: "hello again", embedding: [0, 1, 0] }]);
    expect(getVectorStoreSize()).toBe(1);
  });
});

describe("removeVectorDocs", () => {
  it("removes documents by id", () => {
    addVectorDocs([
      { id: "1", text: "a", embedding: [1, 0, 0] },
      { id: "2", text: "b", embedding: [0, 1, 0] },
    ]);
    removeVectorDocs(["1"]);
    expect(getVectorStoreSize()).toBe(1);
  });
});

describe("searchVectorStore", () => {
  it("returns most similar documents", () => {
    addVectorDocs([
      { id: "1", text: "apple", embedding: [1, 0, 0] },
      { id: "2", text: "banana", embedding: [0, 1, 0] },
      { id: "3", text: "apricot", embedding: [0.9, 0.1, 0] },
    ]);
    const results = searchVectorStore([1, 0, 0], 2);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("1"); // exact match
    expect(results[1].id).toBe("3"); // closest
  });

  it("returns empty array for empty store", () => {
    expect(searchVectorStore([1, 0, 0], 3)).toEqual([]);
  });
});

describe("clearVectorStore", () => {
  it("clears all documents", () => {
    addVectorDocs([{ id: "1", text: "a", embedding: [1, 0, 0] }]);
    clearVectorStore();
    expect(getVectorStoreSize()).toBe(0);
  });
});

describe("chunkText", () => {
  it("returns chunks for multi-sentence text", () => {
    const chunks = chunkText("Hello world. This is a test. Another sentence.");
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]).toContain("Hello world");
  });

  it("returns single chunk for short text", () => {
    const chunks = chunkText("Hi there.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("Hi there.");
  });

  it("returns empty array for empty text", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("splits on paragraph breaks", () => {
    const chunks = chunkText("First paragraph.\n\nSecond paragraph.");
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toContain("First");
    expect(chunks[1]).toContain("Second");
  });
});
