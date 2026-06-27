import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X, ArrowRight, Settings as SettingsIcon, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore, store, PROVIDERS } from "@/lib/cockpit-store";
import { V1_LOCAL_OPENAI_COMPAT_PROVIDER_ID } from "@/lib/providers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function OnboardingModal() {
  const [step, setStep] = useState<"welcome" | "providers" | "setup">("welcome");
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const navigate = useNavigate();
  const onboardingCompleted = useStore((s) => s.settings.onboardingCompleted);

  const cloudProviders = PROVIDERS.filter((p) => p.type === "cloud");
  const localProviders = PROVIDERS.filter((p) => p.type === "local");
  const selectedProvider = PROVIDERS.find((p) => p.id === selectedProviderId);
  const selectedIsV1Endpoint = selectedProvider?.id === V1_LOCAL_OPENAI_COMPAT_PROVIDER_ID;

  const handleCompleteOnboarding = () => {
    store.completeOnboarding();
  };

  const handleSkipOnboarding = () => {
    store.skipOnboarding();
  };

  const handleOpenSettings = () => {
    store.completeOnboarding();
    navigate({ to: "/settings" });
  };

  if (onboardingCompleted) {
    return null;
  }

  return (
    <Dialog open={true} onOpenChange={(open) => !open && handleSkipOnboarding()}>
      <DialogContent className="max-w-2xl bg-black border-white/10 text-white">
        <div className="flex justify-between items-center mb-4">
          <DialogHeader>
            <DialogTitle className="text-2xl font-light tracking-tight">
              {step === "welcome" && "Welcome to Edgecase Cockpit"}
              {step === "providers" && "Start With Local Endpoint"}
              {step === "setup" &&
                (selectedIsV1Endpoint ? "Set Up Local Endpoint" : "Set Up Provider")}
            </DialogTitle>
          </DialogHeader>
          <DialogDescription className="sr-only">
            {step === "welcome" &&
              "Welcome to Edgecase Cockpit. Get started with a local OpenAI-compatible endpoint or skip for now."}
            {step === "providers" &&
              "Configure the V1 local endpoint path first; named providers remain optional presets."}
            {step === "setup" &&
              (selectedIsV1Endpoint
                ? "Configure your local endpoint with a base URL and model."
                : "Configure your selected provider with an API key or base URL.")}
          </DialogDescription>
          <Button
            variant="ghost"
            size="icon"
            className="text-white/50 hover:text-white/80"
            onClick={handleSkipOnboarding}
            aria-label="Close"
            data-testid="onboarding-close"
          >
            <X className="size-5" />
          </Button>
        </div>

        {step === "welcome" && (
          <div className="space-y-6">
            <div className="space-y-4">
              <p className="text-white/80 leading-relaxed">
                Edgecase Cockpit is your local-first AI control surface. V1 starts with a
                user-configured generic local OpenAI-compatible endpoint, then explains what is
                available, missing, and recoverable.
              </p>
              <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/70 leading-relaxed">
                <Lock className="mr-1.5 inline size-3.5 text-amber-300" />
                The V1 local endpoint path does not require signing in, OpenAI, cloud API keys,
                OAuth, marketplace installs, signed native builds, or live provider accounts.
                Accounts are only for optional encrypted key storage and sync.
              </p>
              <p className="text-white/80 leading-relaxed">
                Named providers can remain available as catalog presets, but they are secondary to
                the V1 generic local endpoint loop.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => setStep("providers")}
                className="bg-white text-black hover:bg-white/90 flex-1"
              >
                Get Started
                <ArrowRight className="ml-2 size-4" />
              </Button>
              <Button
                onClick={handleSkipOnboarding}
                variant="outline"
                className="border-white/10 bg-transparent text-white/70 hover:bg-white/10 flex-1"
              >
                Skip for Now
              </Button>
            </div>
          </div>
        )}

        {step === "providers" && (
          <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
            <p className="text-white/80">
              Start with the V1 generic local endpoint. You can still use named provider presets
              later from Settings.
            </p>

            <div className="space-y-4">
              <h3 className="text-sm uppercase tracking-wider text-white/50">
                Local endpoint and presets
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {localProviders.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => {
                      setSelectedProviderId(provider.id);
                      setStep("setup");
                    }}
                    className={`flex flex-col gap-3 rounded-xl border p-4 transition hover:bg-white/[0.04] ${
                      selectedProviderId === provider.id
                        ? "border-white/30 bg-white/[0.06]"
                        : "border-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-xs font-semibold text-black ${provider.accent}`}
                      >
                        {provider.badge}
                      </div>
                      <span className="font-medium text-white">{provider.name}</span>
                      {provider.id === V1_LOCAL_OPENAI_COMPAT_PROVIDER_ID && (
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/70">
                          V1 target
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/60 line-clamp-2">{provider.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm uppercase tracking-wider text-white/50">Cloud providers</h3>
              <p className="text-xs text-white/50">
                Cloud providers are supported infrastructure, not required for the V1 local loop.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {cloudProviders.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => {
                      setSelectedProviderId(provider.id);
                      setStep("setup");
                    }}
                    className={`flex flex-col gap-3 rounded-xl border p-4 transition hover:bg-white/[0.04] ${
                      selectedProviderId === provider.id
                        ? "border-white/30 bg-white/[0.06]"
                        : "border-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-xs font-semibold text-black ${provider.accent}`}
                      >
                        {provider.badge}
                      </div>
                      <span className="font-medium text-white">{provider.name}</span>
                    </div>
                    <p className="text-xs text-white/60 line-clamp-2">{provider.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => setStep("welcome")}
                variant="outline"
                className="border-white/10 bg-transparent text-white/70 hover:bg-white/10 flex-1"
              >
                Back
              </Button>
              <Button
                onClick={handleOpenSettings}
                variant="outline"
                className="border-white/10 bg-transparent text-white/70 hover:bg-white/10 flex-1"
              >
                <SettingsIcon className="mr-2 size-4" />
                Go to Settings
              </Button>
            </div>
          </div>
        )}

        {step === "setup" && selectedProviderId && (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div
                  className={`grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-sm font-semibold text-black ${PROVIDERS.find((p) => p.id === selectedProviderId)?.accent}`}
                >
                  {PROVIDERS.find((p) => p.id === selectedProviderId)?.badge}
                </div>
                <div>
                  <h3 className="text-xl font-medium text-white">{selectedProvider?.name}</h3>
                  <p className="text-sm text-white/60">{selectedProvider?.description}</p>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-white/80 mb-3">
                  To use {selectedProvider?.name}, you&#39;ll need to:
                </p>
                <ol className="space-y-2 text-sm text-white/80">
                  {selectedIsV1Endpoint ? (
                    <>
                      <li>1. Configure the local endpoint base URL in Settings</li>
                      <li>2. Configure or confirm the local model name</li>
                      <li>3. Review the capability state, reason, and next required action</li>
                      <li>4. Run the safe model-list check when that action is available</li>
                    </>
                  ) : (
                    <>
                      <li>1. Create a free account or sign in if you want to save keys</li>
                      <li>2. Set up any required API key in Settings</li>
                      <li>3. Configure any required base URLs or model preferences</li>
                      <li>4. Save your configuration</li>
                    </>
                  )}
                </ol>
              </div>

              {selectedProvider?.needsApiKey && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
                  <p className="text-sm text-amber-200">
                    <span className="font-medium">API Key Required:</span> This provider needs an
                    API key to function.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleOpenSettings}
                className="bg-white text-black hover:bg-white/90 flex-1"
              >
                <SettingsIcon className="mr-2 size-4" />
                Open Settings
              </Button>
              <Button
                onClick={() => setStep("providers")}
                variant="outline"
                className="border-white/10 bg-transparent text-white/70 hover:bg-white/10 flex-1"
              >
                Choose Different Provider
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
