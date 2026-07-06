import { Copy, ArrowRightLeft, SplitSquareHorizontal } from "lucide-react";

export type MigrationChoice = "copy" | "move" | "keep-separate";

type Props = {
  /** Fired when the user picks a migration behavior. The caller performs the
   * register request with the matching claimGuestData and the client-side
   * copy/move/keep, then enters server mode. */
  onChoose: (choice: MigrationChoice) => void;
  /** Abort registration entirely and return to the form (no data is touched). */
  onCancel: () => void;
  /** True while the register request is in flight after a choice was made. */
  submitting?: boolean;
};

type Option = {
  choice: MigrationChoice;
  icon: typeof Copy;
  title: string;
  description: string;
};

const OPTIONS: Option[] = [
  {
    choice: "copy",
    icon: Copy,
    title: "Copy into the new account",
    description:
      "Copy your local profile settings, chats, stats, and memory into the new account. Your local profile stays intact.",
  },
  {
    choice: "move",
    icon: ArrowRightLeft,
    title: "Move into the new account",
    description:
      "Move your local profile data into the new account and clear the local profile bucket. Also claims any server-side guest data.",
  },
  {
    choice: "keep-separate",
    icon: SplitSquareHorizontal,
    title: "Keep separate",
    description:
      "Start the new account empty. Your local profile is left untouched and stays available on this device.",
  },
];

/**
 * Shown when a local-only user registers a server account. The user must choose
 * what happens to their local profile data before the account is created.
 */
export function DataMigrationDialog({ onChoose, onCancel, submitting }: Props) {
  return (
    <div
      data-testid="data-migration-dialog"
      className="fixed inset-0 z-[110] flex min-h-[100dvh] items-center justify-center bg-black/90 px-4 py-8 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Choose what to do with your local profile data"
    >
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-light tracking-tight">Bring your local data?</h1>
          <p className="text-sm text-white/50">
            You&apos;re creating a server account from a local profile. Choose what to do with your
            local chats, settings, and memory.
          </p>
        </div>

        <div className="space-y-3" role="group" aria-label="Migration choices">
          {OPTIONS.map(({ choice, icon: Icon, title, description }) => (
            <button
              key={choice}
              type="button"
              data-testid={`migration-choice-${choice}`}
              disabled={submitting}
              onClick={() => onChoose(choice)}
              className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left transition-colors hover:border-white/25 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 disabled:opacity-50"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-white/95">{title}</span>
                <span className="block text-xs text-white/50">{description}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="text-center">
          <button
            type="button"
            data-testid="migration-cancel"
            disabled={submitting}
            onClick={onCancel}
            className="text-xs text-white/40 underline-offset-4 hover:text-white/70 hover:underline disabled:opacity-50"
          >
            Cancel and go back
          </button>
        </div>
      </div>
    </div>
  );
}
