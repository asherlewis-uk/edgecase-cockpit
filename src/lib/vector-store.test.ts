import { describe, it, expect, beforeEach } from "vitest";
import {
  addVectorDocs,
  removeVectorDocs,
  clearVectorStore,
  searchVectorStore,
  getVectorStoreSize,
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
