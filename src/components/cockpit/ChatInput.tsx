import { type RefObject } from "react";
import { Square, AudioLines, Mic, X, Image as ImageIcon } from "lucide-react";

export type PulseProfile = {
  cycleMs: number;
  breatheMs: number;
  bright: number;
  mid: number;
  glow: number;
};

export type DraftAttachment = {
  id: string;
  src: string;
  kind: "image" | "video" | "screenshot";
};

export function draftKindFromMime(mime: string): DraftAttachment["kind"] {
  return mime.startsWith("video/") ? "video" : "image";
}

function hueButtonStyle(p: PulseProfile, reduceMotion: boolean): React.CSSProperties {
  return {
    animation: reduceMotion ? "none" : `cockpit-hue-cycle ${p.cycleMs}ms linear infinite`,
    backgroundColor: `hsl(var(--cockpit-hue) 80% 55%)`,
    boxShadow: `0 0 ${reduceMotion ? 14 : 24}px hsl(var(--cockpit-hue) 95% 60% / ${reduceMotion ? 0.32 : 0.55})`,
  };
}

export function ChatInput({
  input,
  setInput,
  attachments,
  setAttachments,
  fileInputRef,
  recording,
  recordMode = "mic",
  onSend,
  onCaptureScreenshot,
  onStartRecording,
  onStopRecording,
  onCancelTranscribing,
  onIngestFiles,
  onStop,
  canAttachMedia,
  canAttachImages,
  canAttachVideo,
  canCaptureScreenshots,
  screenshotMode,
  providerName,
  visualSurface,
  isStreaming,
  isCoolingDown,
  cooldownSeconds,
  promptPlaceholder,
  assistantName,
  pulse,
  reduceMotion,
}: {
  input: string;
  setInput: (value: string) => void;
  attachments: DraftAttachment[];
  setAttachments: (
    value: DraftAttachment[] | ((prev: DraftAttachment[]) => DraftAttachment[]),
  ) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  recording: "idle" | "recording" | "transcribing";
  recordMode?: "mic" | "live";
  onSend: () => void;
  onCaptureScreenshot: () => void;
  onStartRecording: (mode: "mic" | "live") => void;
  onStopRecording: () => void;
  onCancelTranscribing: () => void;
  onIngestFiles: (files: FileList | File[]) => void;
  onStop: () => void;
  canAttachMedia: boolean;
  canAttachImages: boolean;
  canAttachVideo: boolean;
  canCaptureScreenshots: boolean;
  screenshotMode: boolean;
  providerName: string;
  visualSurface: { input: string; button: string };
  isStreaming: boolean;
  isCoolingDown: boolean;
  cooldownSeconds: number;
  promptPlaceholder: string;
  assistantName: string;
  pulse: PulseProfile;
  reduceMotion: boolean;
}) {
  return (
    <div className="relative z-10 px-3 pb-6 pt-2">
      <div
        className={`mx-auto flex max-w-3xl flex-col gap-2 rounded-3xl px-2 py-2 ${visualSurface.input}`}
      >
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-2 pt-1">
            {attachments.map((item) => (
              <div key={item.id} className="relative">
                {item.kind === "video" ? (
                  <video
                    src={item.src}
                    muted
                    playsInline
                    className="size-14 rounded-lg bg-black object-cover ring-1 ring-white/15"
                  />
                ) : (
                  <img
                    src={item.src}
                    alt="attachment"
                    className="size-14 rounded-lg object-cover ring-1 ring-white/15"
                  />
                )}
                {item.kind === "screenshot" && (
                  <span className="absolute bottom-1 left-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/70">
                    Shot
                  </span>
                )}
                <button
                  onClick={() => setAttachments((p) => p.filter((next) => next.id !== item.id))}
                  className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-black/80 text-white ring-1 ring-white/20"
                  aria-label="Remove attachment"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={[canAttachImages ? "image/*" : null, canAttachVideo ? "video/*" : null]
              .filter(Boolean)
              .join(",")}
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) onIngestFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`grid size-10 shrink-0 place-items-center rounded-full text-white/85 transition ${visualSurface.button}`}
            aria-label="Attach media"
            disabled={!canAttachMedia}
            title={
              canAttachMedia
                ? canAttachImages && canAttachVideo
                  ? "Attach image or video"
                  : canAttachVideo
                    ? "Attach video"
                    : "Attach image"
                : `${providerName} does not support media review`
            }
          >
            <ImageIcon className="size-5" strokeWidth={1.6} />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData?.files ?? []);
              if (files.length) {
                e.preventDefault();
                onIngestFiles(files);
              }
            }}
            placeholder={`${promptPlaceholder} ${providerName}…`}
            className="flex-1 bg-transparent px-2 py-2 text-[17px] text-white placeholder:text-white/40 focus:outline-none"
          />
          {isCoolingDown ? (
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-xs tabular-nums text-white/80">
              {cooldownSeconds}
            </div>
          ) : isStreaming ? (
            <button
              className="grid size-10 shrink-0 place-items-center rounded-full text-white transition-colors"
              style={hueButtonStyle(pulse, reduceMotion)}
              aria-label="Stop"
              onClick={onStop}
            >
              <Square className="size-4 fill-white" strokeWidth={0} />
            </button>
          ) : input.trim() || attachments.length > 0 ? (
            <button
              onClick={onSend}
              className="grid size-10 shrink-0 place-items-center rounded-full text-white transition-colors"
              style={hueButtonStyle(pulse, reduceMotion)}
              aria-label="Send"
            >
              <AudioLines className="size-5" strokeWidth={1.8} />
            </button>
          ) : recording === "transcribing" ? (
            <button
              onClick={onCancelTranscribing}
              className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-white/[0.08] px-3 text-sm text-white/85 transition hover:bg-white/[0.14]"
              aria-label="Cancel transcription"
            >
              <X className="size-4" strokeWidth={1.8} />
              Cancel
            </button>
          ) : (
            <>
              <button
                onClick={() =>
                  recording === "recording" && recordMode === "mic"
                    ? onStopRecording()
                    : onStartRecording("mic")
                }
                className="grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/85 transition hover:bg-white/[0.12]"
                aria-label={
                  recording === "recording" && recordMode === "mic"
                    ? "Stop recording"
                    : "Voice to text"
                }
                title={
                  recording === "recording" && recordMode === "mic"
                    ? "Stop & transcribe"
                    : "Voice to text"
                }
              >
                <Mic
                  className={`size-5 ${recording === "recording" && recordMode === "mic" ? "text-red-400 animate-pulse" : ""}`}
                  strokeWidth={1.6}
                />
              </button>
              <button
                onClick={() =>
                  recording === "recording" && recordMode === "live"
                    ? onStopRecording()
                    : onStartRecording("live")
                }
                className="grid size-10 shrink-0 place-items-center rounded-full text-white transition-colors"
                style={hueButtonStyle(pulse, reduceMotion)}
                aria-label={
                  recording === "recording" && recordMode === "live"
                    ? "Stop live"
                    : "Live voice — record & send"
                }
                title={
                  recording === "recording" && recordMode === "live"
                    ? "Stop & send"
                    : "Live voice — records & sends on stop"
                }
              >
                <AudioLines
                  className={`size-5 ${recording === "recording" && recordMode === "live" ? "animate-pulse" : ""}`}
                  strokeWidth={1.8}
                />
              </button>
            </>
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-white/35">
        {assistantName} may hallucinate. Verify critical info.
      </p>
    </div>
  );
}
