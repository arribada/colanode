// A workaround to make the globals.css file work in the web app
import '../../../packages/ui/src/styles/globals.css';

import { createRoot } from 'react-dom/client';

import { App } from '@colanode/ui';
import { AppErrorBoundary } from '@colanode/ui/components/app/app-error-boundary';

const Root = () => {
  // Intentional double boundary: <App> already wraps its own children in an
  // AppErrorBoundary (context={`app-${type}`}) inside packages/ui, so this
  // outer instance is a last-resort net around App's own render/mount, not a
  // duplicate of the inner one. Kept distinct via the "desktop-root" context
  // label so logs show which layer actually caught the error.
  return (
    <AppErrorBoundary context="desktop-root">
      <App type="desktop" />
    </AppErrorBoundary>
  );
};

window.addEventListener('error', (event) => {
  console.error(
    '[Desktop] Uncaught window error',
    event.error ?? event.message,
    {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    }
  );
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Desktop] Unhandled promise rejection', event.reason);
});

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(<Root />);
