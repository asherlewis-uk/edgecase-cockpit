// Configurable storage limits to prevent unbounded local DB/storage growth.
// These are server-side guardrails only; the UI may pre-validate for UX but
// the server is the source of truth.

export type StorageLimits = {
  maxThreadsPerSession: number;
  maxMessagesPerThread: number;
  maxImportedThreads: number;
  maxImportedMessagesPerThread: number;
  maxMessageContentLength: number;
  maxThreadTitleLength: number;
  maxAttachmentUrlsPerMessage: number;
};

export const DEFAULT_STORAGE_LIMITS: StorageLimits = {
  maxThreadsPerSession: 2_000,
  maxMessagesPerThread: 2_000,
  maxImportedThreads: 100,
  maxImportedMessagesPerThread: 2_000,
  maxMessageContentLength: 100_000,
  maxThreadTitleLength: 512,
  maxAttachmentUrlsPerMessage: 50,
};

let configuredLimits: StorageLimits = { ...DEFAULT_STORAGE_LIMITS };

/**
 * Override the default storage limits. Called once at server startup if
 * environment-specific limits are required.
 */
export function setStorageLimits(limits: Partial<StorageLimits>): void {
  configuredLimits = { ...configuredLimits, ...limits };
}

/** Get the currently active storage limits. */
export function getStorageLimits(): StorageLimits {
  return configuredLimits;
}

/** Reset to defaults (useful for tests). */
export function resetStorageLimits(): void {
  configuredLimits = { ...DEFAULT_STORAGE_LIMITS };
}

export type LimitViolation = {
  field: string;
  limit: number;
  actual: number;
};

/**
 * Validate a thread title length.
 */
export function validateThreadTitle(title: string): LimitViolation | null {
  const limits = getStorageLimits();
  if (title.length > limits.maxThreadTitleLength) {
    return {
      field: "title",
      limit: limits.maxThreadTitleLength,
      actual: title.length,
    };
  }
  return null;
}

/**
 * Validate a single message's content and attachment limits.
 */
export function validateMessage(message: {
  content: string;
  attachments?: unknown[];
  videoAttachments?: unknown[];
  assistantImages?: unknown[];
}): LimitViolation | null {
  const limits = getStorageLimits();

  if (message.content.length > limits.maxMessageContentLength) {
    return {
      field: "content",
      limit: limits.maxMessageContentLength,
      actual: message.content.length,
    };
  }

  const attachmentCount =
    (message.attachments?.length ?? 0) +
    (message.videoAttachments?.length ?? 0) +
    (message.assistantImages?.length ?? 0);

  if (attachmentCount > limits.maxAttachmentUrlsPerMessage) {
    return {
      field: "attachments",
      limit: limits.maxAttachmentUrlsPerMessage,
      actual: attachmentCount,
    };
  }

  return null;
}

/**
 * Validate a set of messages for a create/update/fork operation.
 */
export function validateMessages(messages: Array<{ content: string }>): LimitViolation | null {
  const limits = getStorageLimits();
  if (messages.length > limits.maxMessagesPerThread) {
    return {
      field: "messages",
      limit: limits.maxMessagesPerThread,
      actual: messages.length,
    };
  }
  for (let i = 0; i < messages.length; i++) {
    const violation = validateMessage(messages[i] as { content: string });
    if (violation) return { ...violation, field: `messages[${i}].${violation.field}` };
  }
  return null;
}

/**
 * Validate an import payload before it is persisted.
 */
export function validateImportPayload(
  threads: Array<{ messages: Array<{ content: string }> }>,
): LimitViolation | null {
  const limits = getStorageLimits();

  if (threads.length > limits.maxImportedThreads) {
    return {
      field: "threads",
      limit: limits.maxImportedThreads,
      actual: threads.length,
    };
  }

  for (let t = 0; t < threads.length; t++) {
    if (threads[t].messages.length > limits.maxImportedMessagesPerThread) {
      return {
        field: `threads[${t}].messages`,
        limit: limits.maxImportedMessagesPerThread,
        actual: threads[t].messages.length,
      };
    }
    for (let m = 0; m < threads[t].messages.length; m++) {
      const violation = validateMessage(threads[t].messages[m] as { content: string });
      if (violation) {
        return { ...violation, field: `threads[${t}].messages[${m}].${violation.field}` };
      }
    }
  }

  return null;
}

/**
 * Build a standard 400/413 Response for a limit violation.
 */
export function limitViolationResponse(violation: LimitViolation): Response {
  return Response.json(
    {
      error: "Limit exceeded",
      field: violation.field,
      limit: violation.limit,
      actual: violation.actual,
    },
    { status: 413 },
  );
}
