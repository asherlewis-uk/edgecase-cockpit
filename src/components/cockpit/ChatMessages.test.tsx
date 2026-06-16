import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Message } from "@/lib/cockpit-store";
import { ChatMessages } from "./ChatMessages";

vi.mock("@/components/cockpit/MessageRow", () => ({
  MessageRow: ({ m }: { m: Message }) => <div data-testid={`message-${m.id}`}>{m.content}</div>,
}));

describe("ChatMessages", () => {
  it("does not render stray semicolons between messages", () => {
    const messages: Message[] = [
      {
        id: "msg-1",
        role: "user",
        content: "test",
        ts: Date.now(),
      },
      {
        id: "msg-2",
        role: "assistant",
        content: "hello from assistant",
        ts: Date.now() + 1000,
      },
    ];

    const { container } = render(
      <ChatMessages
        messages={messages}
        isStreaming={false}
        scrollRef={{ current: null }}
        onRegenerate={vi.fn()}
        onRegenerateFrom={vi.fn()}
        onEditMessage={vi.fn()}
        onDeleteMessage={vi.fn()}
        onExecuteTool={vi.fn()}
        onRetry={vi.fn()}
        error={null}
        isCoolingDown={false}
        cooldownSeconds={0}
      />,
    );

    expect(screen.getByText("hello from assistant")).toBeInTheDocument();
    const textNodes: string[] = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode.textContent ?? "");
    }
    expect(textNodes.some((t) => /^;+$/.test(t.trim()))).toBe(false);
  });
});
