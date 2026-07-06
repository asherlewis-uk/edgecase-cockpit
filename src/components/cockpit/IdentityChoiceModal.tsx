import { useNavigate } from "@tanstack/react-router";
import { Server, LogIn, HardDrive } from "lucide-react";
import { Sparkle } from "@/components/cockpit/Sparkle";
import { ensureLocalProfileId, enterLocalMode, type AccountMode } from "@/lib/cockpit-store";

type Props = {
  /** Current account mode; the modal only renders when this is "undetermined". */
  accountMode: AccountMode;
};

/**
 * First-launch identity gate. Blocks the app until the user makes an explicit
 * identity choice. There is no close button, skip button, escape path, or
 * ambiguous fallback — the user MUST pick one of three equal-weighted options.
 */
export function IdentityChoiceModal({ accountMode }: Props) {
  const navigate = useNavigate();

  if (accountMode !== "undetermined") return null;

  const chooseCreateServerAccount = () => {
    // Navigate to the register page; accountMode is persisted as "server" only
    // after successful auth (enterServerMode), so abandoning registration leaves
    // the user in "undetermined" and this gate re-appears on next visit.
    void navigate({ to: "/auth", search: { mode: "register", redirect: "/" } });
  };

  const chooseSignIn = () => {
    void navigate({ to: "/auth", search: { mode: "signin", redirect: "/" } });
  };

  const chooseLocalOnly = () => {
    // Establish (or reuse) the on-device local profile and enter local mode.
    // This persists accountMode="local-only" + localProfileId, so the parent
    // gate drops this modal and proceeds to onboarding.
    const localProfileId = ensureLocalProfileId();
    enterLocalMode(localProfileId);
  };

  return (
    <div
      data-testid="identity-choice-modal"
      className="fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center bg-black/90 px-4 py-8 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Choose how to use Edgecase Cockpit"
    >
      <div className="w-full max-w-lg space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Sparkle size={48} />
          <h1 className="text-2xl font-light tracking-tight">Edgecase Cockpit</h1>
          <p className="max-w-sm text-sm text-white/50">
            Choose how you want to use Cockpit. You can change this later from the account menu.
          </p>
        </div>

        <div className="space-y-3" role="group" aria-label="Identity choices">
          <button
            type="button"
            data-testid="identity-choice-server-create"
            onClick={chooseCreateServerAccount}
            className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left transition-colors hover:border-white/25 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10">
              <Server className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-white/95">
                Create a server account
              </span>
              <span className="block text-xs text-white/50">
                Save provider keys, sync settings, and keep your data across devices.
              </span>
            </span>
          </button>

          <button
            type="button"
            data-testid="identity-choice-server-signin"
            onClick={chooseSignIn}
            className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left transition-colors hover:border-white/25 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10">
              <LogIn className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-white/95">
                Sign in to an existing account
              </span>
              <span className="block text-xs text-white/50">
                Restore your server account and synced data.
              </span>
            </span>
          </button>

          <button
            type="button"
            data-testid="identity-choice-local-only"
            onClick={chooseLocalOnly}
            className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left transition-colors hover:border-white/25 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10">
              <HardDrive className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-white/95">
                Use a local-only profile
              </span>
              <span className="block text-xs text-white/50">
                Everything stays on this device. No account, no sync.
              </span>
            </span>
          </button>
        </div>

        <p className="text-center text-xs text-white/30">
          You can switch between your local profile and a server account at any time.
        </p>
      </div>
    </div>
  );
}
