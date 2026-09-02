import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ToolPermissionsSection } from "./settings";
import { enterServerMode, enterLocalMode } from "@/lib/cockpit-store";

const mockFetch = vi.fn();

vi.mock("@/lib/api-base", () => ({
  apiFetch: (...args: unknown[]) => mockFetch(...args),
}));

type Tool = { name: string; source: string; approved: boolean };

describe("ToolPermissionsSection account isolation", () => {
  it("refetches the approval list when the account scope changes", async () => {
    // Route apiFetch by URL instead of queueing resolved values: enterServerMode
    // fires /api/settings and /api/keys/status of its own, which would consume
    // any pre-queued permissions payload.
    let currentTools: Tool[] = [{ name: "a_tool", source: "local", approved: true }];
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/tools/permissions")) {
        return Promise.resolve(new Response(JSON.stringify({ tools: currentTools })));
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 401 }));
    });

    // First scope: on-device local profile, established before the first render.
    act(() => {
      enterLocalMode("lp-1");
    });

    const { rerender } = render(<ToolPermissionsSection />);
    expect(await screen.findByText("a_tool")).toBeInTheDocument();

    // Switch to a server account: the section must refetch, not keep A's list.
    currentTools = [{ name: "b_tool", source: "local", approved: false }];
    act(() => {
      enterServerMode({
        id: "u-b",
        email: "b@b.co",
        display_name: null,
        created_at: 0,
        updated_at: 0,
      });
    });
    rerender(<ToolPermissionsSection />);

    expect(await screen.findByText("b_tool")).toBeInTheDocument();
    expect(screen.queryByText("a_tool")).not.toBeInTheDocument();
  });
});
