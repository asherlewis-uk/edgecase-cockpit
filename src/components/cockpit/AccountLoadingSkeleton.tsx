/**
 * Neutral loading state shown while identity hydration (hydrateAsync) resolves.
 * Deliberately renders NO account-scoped data so the wrong account bucket can
 * never flash before identity is known.
 */
export function AccountLoadingSkeleton() {
  return (
    <div
      data-testid="account-loading-skeleton"
      className="flex min-h-[100dvh] items-center justify-center bg-black text-white"
    >
      <div className="flex flex-col items-center gap-4" aria-live="polite" aria-busy="true">
        <div className="size-3 animate-pulse rounded-full bg-white/40" />
        <p className="text-sm text-white/50">Loading your cockpit…</p>
      </div>
    </div>
  );
}
