import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInput, type PulseProfile, type DraftAttachment } from "@/components/cockpit/ChatInput";

const defaultPulse: PulseProfile = {
  cycleMs: 4000,
  breatheMs: 2000,
  bright: 1,
  mid: 0.6,
  glow: 0.4,
};

const defaultProps = {
  input: "",
  setInput: vi.fn(),
  attachments: [] as DraftAttachment[],
  setAttachments: vi.fn(),
  fileInputRef: { current: null },
  recording: "idle" as const,
  onSend: vi.fn(),
  onCaptureScreenshot: vi.fn(),
  onStartRecording: vi.fn(),
  onStopRecording: vi.fn(),
  onCancelTranscribing: vi.fn(),
  onIngestFiles: vi.fn(),
  onStop: vi.fn(),
  canAttachMedia: true,
  canAttachImages: true,
  canAttachVideo: false,
  canCaptureScreenshots: false,
  screenshotMode: false,
  providerName: "OpenAI",
  visualSurface: {
    input: "bg-white/5",
    button: "bg-white/10 hover:bg-white/20",
  },
  isStreaming: false,
  isCoolingDown: false,
  cooldownSeconds: 0,
  promptPlaceholder: "Message",
  assistantName: "Cockpit",
  pulse: defaultPulse,
  reduceMotion: false,
};

describe("ChatInput", () => {
  it("renders the text input", () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByPlaceholderText("Message OpenAI…")).toBeInTheDocument();
  });

  it("renders the Send button when input has text", () => {
    render(<ChatInput {...defaultProps} input="Hello" />);
    expect(screen.getByLabelText("Send")).toBeInTheDocument();
  });

  it("does not show Send button when input is empty", () => {
    render(<ChatInput {...defaultProps} input="" />);
    expect(screen.queryByLabelText("Send")).not.toBeInTheDocument();
  });

  it("shows Send button when there are attachments even with empty input", () => {
    const attachments: DraftAttachment[] = [
      { id: "att-1", src: "data:image/png;base64,test", kind: "image" },
    ];
    render(<ChatInput {...defaultProps} input="" attachments={attachments} />);
    expect(screen.getByLabelText("Send")).toBeInTheDocument();
  });

  it("calls onSend when Send button is clicked", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput {...defaultProps} input="Hello" onSend={onSend} />);

    await user.click(screen.getByLabelText("Send"));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("calls onSend when Enter is pressed", async () => {
    const onSend = vi.fn();
    const setInput = vi.fn();
    render(<ChatInput {...defaultProps} input="Hello" onSend={onSend} setInput={setInput} />);

    const input = screen.getByPlaceholderText("Message OpenAI…");
    await fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("does not call onSend when Shift+Enter is pressed", async () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} input="Hello" onSend={onSend} />);

    const input = screen.getByPlaceholderText("Message OpenAI…");
    await fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows stop button when isStreaming is true", () => {
    render(<ChatInput {...defaultProps} isStreaming={true} />);
    expect(screen.getByLabelText("Stop")).toBeInTheDocument();
  });

  it("shows cooldown countdown when cooling down", () => {
    render(<ChatInput {...defaultProps} isCoolingDown={true} cooldownSeconds={30} />);
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("shows recording indicator when recording", () => {
    render(<ChatInput {...defaultProps} recording="recording" />);
    // The mic button should show "Stop recording" or pulse
    const micButtons = screen.getAllByLabelText(/recording|voice/i);
    expect(micButtons.length).toBeGreaterThan(0);
  });

  it("shows cancel transcription button when transcribing", () => {
    render(<ChatInput {...defaultProps} recording="transcribing" />);
    expect(screen.getByLabelText("Cancel transcription")).toBeInTheDocument();
  });

  it("shows the attach media button", () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByLabelText("Attach media")).toBeInTheDocument();
  });

  it("disables attach media button when canAttachMedia is false", () => {
    render(<ChatInput {...defaultProps} canAttachMedia={false} />);
    const btn = screen.getByLabelText("Attach media");
    expect(btn).toBeDisabled();
  });

  it("calls onStop when stop button is clicked", async () => {
    const onStop = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput {...defaultProps} isStreaming={true} onStop={onStop} />);

    await user.click(screen.getByLabelText("Stop"));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("calls onCancelTranscribing when cancel is clicked during transcribing", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatInput {...defaultProps} recording="transcribing" onCancelTranscribing={onCancel} />,
    );

    await user.click(screen.getByLabelText("Cancel transcription"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("displays the assistant disclaimer", () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByText("Cockpit may hallucinate. Verify critical info.")).toBeInTheDocument();
  });

  it("calls setInput on text change", async () => {
    const setInput = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput {...defaultProps} setInput={setInput} />);

    const input = screen.getByPlaceholderText("Message OpenAI…");
    await user.type(input, "test message");

    expect(setInput).toHaveBeenCalled();
  });

  it("renders attachment thumbnails", () => {
    const attachments: DraftAttachment[] = [
      { id: "att-1", src: "data:image/png;base64,test", kind: "image" },
    ];
    render(<ChatInput {...defaultProps} attachments={attachments} />);

    const img = screen.getByAltText("attachment");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "data:image/png;base64,test");
  });

  it("shows screenshot badge on screenshot attachments", () => {
    const attachments: DraftAttachment[] = [
      { id: "att-1", src: "data:image/png;base64,test", kind: "screenshot" },
    ];
    render(<ChatInput {...defaultProps} attachments={attachments} />);

    expect(screen.getByText("Shot")).toBeInTheDocument();
  });

  it("renders placeholder with empty provider name", () => {
    render(<ChatInput {...defaultProps} providerName="" />);
    expect(screen.getByPlaceholderText("Message …")).toBeInTheDocument();
  });

  it("renders placeholder with different provider name", () => {
    render(<ChatInput {...defaultProps} providerName="Anthropic" />);
    expect(screen.getByPlaceholderText("Message Anthropic…")).toBeInTheDocument();
  });

  it("updates placeholder when provider name changes", () => {
    const { rerender } = render(<ChatInput {...defaultProps} providerName="OpenAI" />);
    expect(screen.getByPlaceholderText("Message OpenAI…")).toBeInTheDocument();

    rerender(<ChatInput {...defaultProps} providerName="Anthropic" />);
    expect(screen.getByPlaceholderText("Message Anthropic…")).toBeInTheDocument();
  });
});
