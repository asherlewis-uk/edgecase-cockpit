import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockNavigate = vi.fn();
const mockEnsureLocalProfileId = vi.fn(() => "lp-generated");
const mockEnterLocalMode = vi.fn();

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mockNavigate }));

vi.mock("@/lib/cockpit-store", () => ({
  ensureLocalProfileId: () => mockEnsureLocalProfileId(),
  enterLocalMode: (id: string) => mockEnterLocalMode(id),
}));

import { IdentityChoiceModal } from "./IdentityChoiceModal";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("IdentityChoiceModal", () => {
  it("renders exactly three primary choices", () => {
    render(<IdentityChoiceModal accountMode="undetermined" />);
    expect(screen.getByTestId("identity-choice-server-create")).toBeInTheDocument();
    expect(screen.getByTestId("identity-choice-server-signin")).toBeInTheDocument();
    expect(screen.getByTestId("identity-choice-local-only")).toBeInTheDocument();
  });

  it("has no close button, skip button, or escape fallback", () => {
    render(<IdentityChoiceModal accountMode="undetermined" />);
    // No element labelled close/skip.
    expect(screen.queryByLabelText(/close/i)).toBeNull();
    expect(screen.queryByText(/skip/i)).toBeNull();
  });

  it("renders nothing when accountMode is not undetermined", () => {
    render(<IdentityChoiceModal accountMode="local-only" />);
    expect(screen.queryByTestId("identity-choice-modal")).toBeNull();
  });

  it("local-only choice generates a localProfileId and enters local mode", () => {
    render(<IdentityChoiceModal accountMode="undetermined" />);
    fireEvent.click(screen.getByTestId("identity-choice-local-only"));
    expect(mockEnsureLocalProfileId).toHaveBeenCalled();
    expect(mockEnterLocalMode).toHaveBeenCalledWith("lp-generated");
  });

  it("server-create choice navigates to the register route", () => {
    render(<IdentityChoiceModal accountMode="undetermined" />);
    fireEvent.click(screen.getByTestId("identity-choice-server-create"));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/auth", search: { mode: "register", redirect: "/" } }),
    );
  });

  it("server-signin choice navigates to the signin route", () => {
    render(<IdentityChoiceModal accountMode="undetermined" />);
    fireEvent.click(screen.getByTestId("identity-choice-server-signin"));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/auth", search: { mode: "signin", redirect: "/" } }),
    );
  });
});
