import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X, ArrowRight, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore, store, PROVIDERS } from "@/lib/cockpit-store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function OnboardingModal() {
  const [step, setStep] = useState<"welcome" | "providers" | "setup">("welcome");
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const navigate = useNavigate();
  const onboardingCompleted = useStore((s) => s.settings.onboardingCompleted);
  
  const cloudProviders = PROVIDERS.filter((p) => p.type === "cloud");
  const localProviders = PROVIDERS.filter((p) => p.type === "local");

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
              {step === "providers" && "Choose Your AI Provider"}
              {step === "setup" && "Set Up Your Provider"}
            </DialogTitle>
          </DialogHeader>
          <DialogDescription className="sr-only">
            {step === "welcome" && "Welcome to Edgecase Cockpit. Get started by selecting an AI provider or skip for now."}
            {step === "providers" && "Choose a cloud or local AI provider to connect to your cockpit."}
            {step === "setup" && "Configure your selected provider with an API key or base URL."}
          </DialogDescription>
          <Button
            variant="ghost"
            size="icon"
            className="text-white/50 hover:text-white/80"
            onClick={handleSkipOnboarding}
            aria-label="Close"
          >
            <X className="size-5" />
          </Button>
        </div>

        {step === "welcome" && (
          <div className="space-y-6">
            <div className="space-y-4">
              <p className="text-white/80 leading-relaxed">
                Edgecase Cockpit is your personal AI control surface. Connect to cloud and local AI providers, chat seamlessly, and manage your conversations in one place.
              </p>
              <p className="text-white/80 leading-relaxed">
                Whether you're using OpenAI, Anthropic, or running local models with Ollama or LM Studio, Cockpit provides a unified interface for all your AI interactions.
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
              Select a provider to get started. You can add more later in Settings.
            </p>

            <div className="space-y-4">
              <h3 className="text-sm uppercase tracking-wider text-white/50">Cloud Providers</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {cloudProviders.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => {
                      setSelectedProviderId(provider.id);
                      setStep("setup");
                    }}
                    className={`flex flex-col gap-3 rounded-xl border p-4 transition hover:bg-white/[0.04] ${
                      selectedProviderId === provider.id ? "border-white/30 bg-white/[0.06]" : "border-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-xs font-semibold text-black ${provider.accent}`}>
                        {provider.badge}
                      </div>
                      <span className="font-medium text-white">{provider.name}</span>
                      {provider.id === "openai" && (
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/70">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/60 line-clamp-2">{provider.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm uppercase tracking-wider text-white/50">Local / Self-hosted</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {localProviders.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => {
                      setSelectedProviderId(provider.id);
                      setStep("setup");
                    }}
                    className={`flex flex-col gap-3 rounded-xl border p-4 transition hover:bg-white/[0.04] ${
                      selectedProviderId === provider.id ? "border-white/30 bg-white/[0.06]" : "border-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-xs font-semibold text-black ${provider.accent}`}>
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
                <div className={`grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-sm font-semibold text-black ${PROVIDERS.find(p => p.id === selectedProviderId)?.accent}`}>
                  {PROVIDERS.find(p => p.id === selectedProviderId)?.badge}
                </div>
                <div>
                  <h3 className="text-xl font-medium text-white">{PROVIDERS.find(p => p.id === selectedProviderId)?.name}</h3>
                  <p className="text-sm text-white/60">{PROVIDERS.find(p => p.id === selectedProviderId)?.description}</p>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-white/80 mb-3">
                  To use {PROVIDERS.find(p => p.id === selectedProviderId)?.name}, you'll need to:
                </p>
                <ol className="space-y-2 text-sm text-white/80">
                  <li>1. Set up an API key in Settings</li>
                  <li>2. Configure any required base URLs or model preferences</li>
                  <li>3. Save your configuration</li>
                </ol>
              </div>

              {PROVIDERS.find(p => p.id === selectedProviderId)?.needsApiKey && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
                  <p className="text-sm text-amber-200">
                    <span className="font-medium">API Key Required:</span> This provider needs an API key to function.
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