import { useNavigate } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { Sparkle } from "@/components/cockpit/Sparkle";

export function Greeting({
  displayName,
  assistantName,
  greetingStatus,
  providerName,
  needsApiKey,
}: {
  displayName: string;
  assistantName: string;
  greetingStatus: string | null;
  providerName: string;
  needsApiKey: boolean;
}) {
  const navigate = useNavigate();

  // Determine more specific API key message based on validation status
  const getApiKeyMessage = () => {
    if (!needsApiKey) return null;

    // For now, we'll use a more helpful message
    // In future, we could integrate with validation status
    return providerName ? `No API key set for ${providerName}` : "No API key configured";
  };

  const apiKeyMessage = getApiKeyMessage();

  return (
    <div className="flex h-full flex-col items-center justify-center pb-32">
      <Sparkle size={56} />
      <h1 className="mt-6 text-3xl font-light tracking-tight text-white/90">
        Ask away, {displayName}!
      </h1>
      {greetingStatus && (
        <p className="mt-3 max-w-xs text-center text-sm text-white/45">{greetingStatus}</p>
      )}
      {apiKeyMessage && (
        <button
          onClick={() => navigate({ to: "/settings" })}
          className="mt-5 flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-200"
        >
          <AlertCircle className="size-3.5" />
          {apiKeyMessage} — click to set up
        </button>
      )}
    </div>
  );
}
