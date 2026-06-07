import { describe, it, expect, beforeEach } from "vitest";
import {
  resetStorageLimits,
  setStorageLimits,
  validateThreadTitle,
  validateMessage,
  validateMessages,
  validateImportPayload,
  limitViolationResponse,
} from "@/lib/storage-limits.server";

describe("storage-limits.server", () => {
  beforeEach(() => {
    resetStorageLimits();
  });

  it("rejects titles that exceed the max length", () => {
    const violation = validateThreadTitle("x".repeat(513));
    expect(violation).not.toBeNull();
    expect(violation?.field).toBe("title");
  });

  it("accepts titles within the max length", () => {
    expect(validateThreadTitle("Short title")).toBeNull();
  });

  it("rejects messages with content too long", () => {
    const violation = validateMessage({ content: "x".repeat(100_001) });
    expect(violation).not.toBeNull();
    expect(violation?.field).toBe("content");
  });

  it("rejects messages with too many attachments", () => {
    const violation = validateMessage({
      content: "hi",
      attachments: Array.from({ length: 51 }, () => "data:image/png;base64,abc"),
    });
    expect(violation).not.toBeNull();
    expect(violation?.field).toBe("attachments");
  });

  it("accepts messages within limits", () => {
    expect(
      validateMessage({
        content: "Hello",
        attachments: ["data:image/png;base64,abc"],
      }),
    ).toBeNull();
  });

  it("rejects message arrays exceeding max messages per thread", () => {
    const messages = Array.from({ length: 2_001 }, (_, i) => ({ content: `msg ${i}` }));
    const violation = validateMessages(messages);
    expect(violation).not.toBeNull();
    expect(violation?.field).toBe("messages");
  });

  it("rejects individual messages inside an array", () => {
    const messages = [{ content: "ok" }, { content: "x".repeat(200_000) }];
    const violation = validateMessages(messages);
    expect(violation).not.toBeNull();
    expect(violation?.field).toContain("messages[1].content");
  });

  it("rejects imports with too many threads", () => {
    const threads = Array.from({ length: 101 }, () => ({ messages: [] }));
    const violation = validateImportPayload(threads);
    expect(violation).not.toBeNull();
    expect(violation?.field).toBe("threads");
  });

  it("rejects imports with too many messages in a single thread", () => {
    const threads = [
      {
        messages: Array.from({ length: 2_001 }, (_, i) => ({ content: `m${i}` })),
      },
    ];
    const violation = validateImportPayload(threads);
    expect(violation).not.toBeNull();
    expect(violation?.field).toContain("threads[0].messages");
  });

  it("respects custom limits when overridden", () => {
    setStorageLimits({ maxMessageContentLength: 10 });
    expect(validateMessage({ content: "short" })).toBeNull();
    expect(validateMessage({ content: "this is too long" })).not.toBeNull();
  });

  it("returns a structured 413 response", () => {
    const response = limitViolationResponse({ field: "messages", limit: 10, actual: 11 });
    expect(response.status).toBe(413);
  });
});
