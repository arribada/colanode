import { TriangleAlert } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@colanode/ui/components/ui/button';

export interface AppErrorFallbackProps {
  error: Error;
  reset: () => void;
}

interface AppErrorBoundaryProps {
  children: ReactNode;
  /** Identifies which app-tree boundary caught the error, for log context. */
  context: string;
  /**
   * Optional platform-specific fallback renderer. Defaults to the DOM
   * fallback below, which is what web/desktop/mobile-webview all share.
   */
  fallback?: (props: AppErrorFallbackProps) => ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

const DefaultAppErrorFallback = ({ error, reset }: AppErrorFallbackProps) => {
  return (
    <div
      data-testid="app-error-boundary"
      className="flex min-h-screen w-full flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <TriangleAlert className="size-12 text-destructive" />
      <h1 className="text-2xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {error.message || 'The app ran into an unexpected error.'}
      </p>
      <Button
        data-testid="app-error-boundary-retry-button"
        className="min-h-11 min-w-11"
        onClick={reset}
      >
        Try again
      </Button>
    </div>
  );
};

// React error boundaries must be class components -- getDerivedStateFromError
// and componentDidCatch have no hook equivalent. Kept as the single shared
// implementation so web, desktop, and the mobile WebView content (which all
// render the same @colanode/ui App tree) get identical, test-observable
// failure behavior instead of a blank screen.
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  override state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[AppErrorBoundary:${this.props.context}] Uncaught render error`,
      error,
      errorInfo.componentStack
    );
  }

  reset = () => {
    this.setState({ error: null });
  };

  override render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    const Fallback = this.props.fallback ?? DefaultAppErrorFallback;
    return <Fallback error={error} reset={this.reset} />;
  }
}
