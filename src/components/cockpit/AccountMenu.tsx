import { useNavigate } from "@tanstack/react-router";
import { LogIn, LogOut, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore, store, deriveInitials, ensureLocalProfileId } from "@/lib/store";

type Props = {
  variant?: "drawer" | "settings";
  onAction?: () => void;
};

export function AccountMenu({ variant = "drawer", onAction }: Props) {
  const user = useStore((s) => s.user);
  const accountMode = useStore((s) => s.accountMode);
  const navigate = useNavigate();

  const goToAuth = () => {
    onAction?.();
    navigate({ to: "/auth", search: { redirect: "/settings" } });
  };

  const handleLogout = async () => {
    await store.logout();
    onAction?.();
  };

  const switchToLocalProfile = () => {
    // Return to the on-device local profile. Generate an id if somehow missing
    // (should not happen once a local profile has been chosen).
    const localProfileId = store.getState().localProfileId ?? ensureLocalProfileId();
    store.enterLocalMode(localProfileId);
    onAction?.();
  };

  // Local-only profile (no server account): first-class identity, not "guest".
  if (!user) {
    const isLocalProfile = accountMode === "local-only";
    return (
      <div
        data-testid={isLocalProfile ? "account-menu-local" : "account-menu-guest"}
        className={
          variant === "settings" ? "rounded-2xl border border-white/10 bg-white/[0.03] p-4" : ""
        }
      >
        <div className={variant === "settings" ? "mb-3" : "mb-1"}>
          <p className="text-sm text-white/70">
            {isLocalProfile ? (
              <>
                You&apos;re using Cockpit with a{" "}
                <span className="font-medium text-white/90">local profile</span>. Settings, chats,
                RAG memory, and usage stats stay on this device only. Sign in or create an account
                to save provider keys and sync your settings across devices.
              </>
            ) : (
              <>
                You&apos;re using Cockpit as a guest. Settings, chats, RAG memory, and usage stats
                stay on this device only. Sign in or create an account to save provider keys and
                sync your settings across devices.
              </>
            )}
          </p>
        </div>
        <Button
          onClick={goToAuth}
          className="w-full bg-white text-black hover:bg-white/90"
          size={variant === "drawer" ? "sm" : "default"}
        >
          <LogIn className="mr-2 size-4" />
          Sign in / Create account
        </Button>
      </div>
    );
  }

  const initials = user.display_name
    ? deriveInitials(user.display_name)
    : deriveInitials(user.email);

  return (
    <div
      data-testid="account-menu-signed-in"
      className={
        variant === "settings"
          ? "flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          : "flex flex-col gap-3"
      }
    >
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-full bg-white/[0.08] text-sm font-semibold text-white ring-1 ring-white/15">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-white/95">
            {user.display_name || user.email}
          </div>
          <div data-testid="account-menu-email" className="truncate text-xs text-white/50">
            {user.email}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Button
          onClick={switchToLocalProfile}
          data-testid="account-menu-switch-local"
          variant="outline"
          size={variant === "drawer" ? "sm" : "default"}
          className="border-white/10 bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
        >
          <HardDrive className="mr-2 size-4" />
          Switch to Local Profile
        </Button>
        <Button
          onClick={handleLogout}
          variant="outline"
          size={variant === "drawer" ? "sm" : "default"}
          className="border-white/10 bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
        >
          <LogOut className="mr-2 size-4" />
          Log out
        </Button>
      </div>
    </div>
  );
}
