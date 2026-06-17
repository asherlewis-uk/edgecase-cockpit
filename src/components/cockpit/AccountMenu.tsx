import { useNavigate } from "@tanstack/react-router";
import { LogIn, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore, store, deriveInitials } from "@/lib/cockpit-store";

type Props = {
  variant?: "drawer" | "settings";
  onAction?: () => void;
};

export function AccountMenu({ variant = "drawer", onAction }: Props) {
  const user = useStore((s) => s.user);
  const navigate = useNavigate();

  const goToAuth = () => {
    onAction?.();
    navigate({ to: "/auth", search: { redirect: "/settings" } });
  };

  const handleLogout = async () => {
    await store.logout();
    onAction?.();
  };

  if (!user) {
    return (
      <div
        className={
          variant === "settings" ? "rounded-2xl border border-white/10 bg-white/[0.03] p-4" : ""
        }
      >
        <div className={variant === "settings" ? "mb-3" : "mb-1"}>
          <p className="text-sm text-white/70">
            You&#39;re using Cockpit as a guest. Sign in or create an account to save provider keys
            and sync your settings.
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
      className={
        variant === "settings"
          ? "flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          : "flex items-center gap-3"
      }
    >
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-full bg-white/[0.08] text-sm font-semibold text-white ring-1 ring-white/15">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-white/95">
            {user.display_name || user.email}
          </div>
          <div className="truncate text-xs text-white/50">{user.email}</div>
        </div>
      </div>
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
  );
}
