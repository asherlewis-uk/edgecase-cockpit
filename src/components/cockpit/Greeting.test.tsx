import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Greeting } from "@/components/cockpit/Greeting";

// Mock the router navigation
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

describe("Greeting", () => {
  it("renders assistant name and display name", () => {
    render(
      <Greeting
        displayName="testuser"
        assistantName="Cockpit"
        greetingStatus={null}
        providerName="OpenAI"
        needsApiKey={false}
      />,
    );

    expect(screen.getByText("Ask away, testuser!")).toBeInTheDocument();
  });

  it("shows greeting status when provided", () => {
    render(
      <Greeting
        displayName="testuser"
        assistantName="Cockpit"
        greetingStatus="Welcome! Your cockpit is ready."
        providerName="OpenAI"
        needsApiKey={false}
      />,
    );

    expect(screen.getByText("Welcome! Your cockpit is ready.")).toBeInTheDocument();
  });

  it("hides provider info when needsApiKey is false", () => {
    render(
      <Greeting
        displayName="testuser"
        assistantName="Cockpit"
        greetingStatus={null}
        providerName="OpenAI"
        needsApiKey={false}
      />,
    );

    expect(screen.queryByText(/No API key set/)).not.toBeInTheDocument();
  });

  it("shows API key warning when needsApiKey is true", () => {
    render(
      <Greeting
        displayName="testuser"
        assistantName="Cockpit"
        greetingStatus={null}
        providerName="OpenAI"
        needsApiKey={true}
      />,
    );

    expect(screen.getByText("No API key set for OpenAI — click to set up")).toBeInTheDocument();
  });

  it("shows API key warning with correct provider name", () => {
    render(
      <Greeting
        displayName="testuser"
        assistantName="Cockpit"
        greetingStatus={null}
        providerName="Anthropic"
        needsApiKey={true}
      />,
    );

    expect(screen.getByText("No API key set for Anthropic — click to set up")).toBeInTheDocument();
  });

  it("renders without crashing with minimal props", () => {
    const { container } = render(
      <Greeting
        displayName=""
        assistantName="Cockpit"
        greetingStatus={null}
        providerName=""
        needsApiKey={false}
      />,
    );

    // Should render even with empty display name
    expect(container.querySelector("h1")).toBeInTheDocument();
  });

  it("renders greeting with different provider names when ready", () => {
    render(
      <Greeting
        displayName="testuser"
        assistantName="Cockpit"
        greetingStatus={null}
        providerName="Anthropic"
        needsApiKey={false}
      />,
    );

    expect(screen.getByText("Ask away, testuser!")).toBeInTheDocument();
    expect(screen.queryByText(/No API key set/)).not.toBeInTheDocument();
  });

  it("renders API key warning with different provider names", () => {
    render(
      <Greeting
        displayName="testuser"
        assistantName="Cockpit"
        greetingStatus={null}
        providerName="Gemini"
        needsApiKey={true}
      />,
    );

    expect(screen.getByText("No API key set for Gemini — click to set up")).toBeInTheDocument();
  });

  it("renders greeting with empty provider name when ready", () => {
    const { container } = render(
      <Greeting
        displayName="testuser"
        assistantName="Cockpit"
        greetingStatus={null}
        providerName=""
        needsApiKey={false}
      />,
    );

    expect(screen.getByText("Ask away, testuser!")).toBeInTheDocument();
    expect(container.querySelector("h1")).toBeInTheDocument();
  });
});
