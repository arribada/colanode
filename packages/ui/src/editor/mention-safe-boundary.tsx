// ABOUTME: Inline error boundary that keeps a single failing inline node (an
// ABOUTME: @-mention) from crashing the whole document/page render.
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { defaultClasses } from '@colanode/ui/editor/classes';

interface MentionSafeBoundaryProps {
  children: ReactNode;
}

interface MentionSafeBoundaryState {
  failed: boolean;
}

// A mention is a single inline atom. If resolving its target or building its
// router link ever throws during render, the TanStack Router route error
// component ("Node error") would otherwise replace the ENTIRE page — which is
// how a document full of inline mentions (e.g. the project Overview "Related
// pages" section) could take a whole page down. This boundary degrades a
// broken mention to inert "Unknown" text so the surrounding document still
// opens. Must be a class component: getDerivedStateFromError / componentDidCatch
// have no hook equivalent.
export class MentionSafeBoundary extends Component<
  MentionSafeBoundaryProps,
  MentionSafeBoundaryState
> {
  override state: MentionSafeBoundaryState = { failed: false };

  static getDerivedStateFromError(): MentionSafeBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      '[MentionSafeBoundary] mention render failed',
      error,
      errorInfo.componentStack
    );
  }

  override render() {
    if (this.state.failed) {
      return (
        <span className={defaultClasses.mention}>
          <span role="presentation">Unknown</span>
        </span>
      );
    }

    return this.props.children;
  }
}
