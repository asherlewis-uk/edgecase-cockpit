"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class CockpitErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "[CockpitErrorBoundary] Caught render error:",
      error.message,
      "\nComponent stack:",
      info.componentStack ?? "(not available)",
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <div className="rounded-full bg-red-500/10 p-4 ring-1 ring-red-500/20">
            <svg
              className="size-8 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-white">Something went wrong</h2>
          <p className="max-w-sm text-sm text-zinc-400">
            An unexpected error occurred in the chat area. The rest of the app is still available.
          </p>
          <button
            onClick={this.handleRetry}
            className="rounded-full bg-white/[0.08] px-5 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/[0.14] focus:outline-none focus:ring-2 focus:ring-white/20"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
