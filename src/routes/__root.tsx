import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { hydrateAsync, store, type AccountMode } from "@/lib/cockpit-store";
import { AccountLoadingSkeleton } from "@/components/cockpit/AccountLoadingSkeleton";
import { IdentityChoiceModal } from "@/components/cockpit/IdentityChoiceModal";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Edgecase Cockpit" },
      { name: "description", content: "Edgecase Cockpit — your AI command center" },
      { name: "author", content: "Asher Lewis" },
      { property: "og:title", content: "Edgecase Cockpit" },
      { property: "og:description", content: "Edgecase Cockpit — your AI command center" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@asherlewis" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // True while a navigation is in flight (new route not yet committed). During
  // this window the router keeps rendering the PREVIOUS route's component under
  // the new URL — e.g. after an identity choice, the chat surface would flash
  // at /auth before the auth page loads. Render the neutral skeleton instead.
  const isNavigating = useRouterState({ select: (s) => s.status === "pending" });
  const [hydrating, setHydrating] = useState(true);
  const [mode, setMode] = useState<AccountMode>("undetermined");

  useEffect(() => {
    let active = true;
    // Subscribe to store changes so accountMode updates after an identity
    // transition (e.g. enterServerMode following successful auth on /auth).
    // store.subscribe does NOT call getState, so it cannot trigger legacy
    // hydrate() before hydrateAsync resolves.
    const unsub = store.subscribe(() => {
      if (!active) return;
      setMode(store.getState().accountMode);
    });
    void hydrateAsync().then(() => {
      if (!active) return;
      setMode(store.getState().accountMode);
      setHydrating(false);
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  // During hydration: render a neutral skeleton with NO account-scoped data so
  // the wrong account bucket can never flash before identity is resolved.
  if (hydrating) {
    return (
      <QueryClientProvider client={queryClient}>
        <AccountLoadingSkeleton />
      </QueryClientProvider>
    );
  }

  // Block every non-auth route until an explicit identity choice is made. /auth
  // is allowed through so a user can create/sign in to a server account without
  // first dismissing the identity gate.
  if (mode === "undetermined" && pathname !== "/auth") {
    return (
      <QueryClientProvider client={queryClient}>
        <IdentityChoiceModal accountMode={mode} />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
