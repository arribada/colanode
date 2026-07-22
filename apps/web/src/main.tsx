import * as Comlink from 'comlink';
import { createRoot } from 'react-dom/client';

import { eventBus } from '@colanode/client/lib';
import { AppErrorBoundary } from '@colanode/ui/components/app/app-error-boundary';
import { BrowserNotSupported } from '@colanode/web/components/browser-not-supported';
import { MobileNotSupported } from '@colanode/web/components/mobile-not-supported';
import { ColanodeWorkerApi } from '@colanode/web/lib/types';
import { isMobileDevice, isOpfsSupported } from '@colanode/web/lib/utils';
import { Root } from '@colanode/web/root';
import {
  disableWebPush,
  enableWebPush,
  getWebPushState,
  isWebPushSupported,
} from '@colanode/web/services/push-service';
import DedicatedWorker from '@colanode/web/workers/dedicated?worker';

window.addEventListener('error', (event) => {
  console.error('[Web] Uncaught window error', event.error ?? event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Web] Unhandled promise rejection', event.reason);
});

const initializeApp = async () => {
  const isMobile = isMobileDevice() && localStorage.getItem('colanode-mobile-ok') !== '1';
  if (isMobile) {
    const root = createRoot(document.getElementById('root') as HTMLElement);
    root.render(<MobileNotSupported />);
    return;
  }

  const hasOpfsSupport = await isOpfsSupported();
  if (!hasOpfsSupport) {
    const root = createRoot(document.getElementById('root') as HTMLElement);
    root.render(<BrowserNotSupported />);
    return;
  }

  const worker = new DedicatedWorker();
  const workerApi = Comlink.wrap<ColanodeWorkerApi>(worker);

  window.colanode = {
    init: async () => {
      return workerApi.init();
    },
    reset: async () => {
      await workerApi.reset();
      window.location.reload();
    },
    executeMutation: async (input) => {
      return workerApi.executeMutation(input);
    },
    executeQuery: async (input) => {
      return workerApi.executeQuery(input);
    },
    executeQueryAndSubscribe: async (key, input) => {
      return workerApi.executeQueryAndSubscribe(key, input);
    },
    saveTempFile: async (file) => {
      return workerApi.saveTempFile(file);
    },
    unsubscribeQuery: async (queryId) => {
      return workerApi.unsubscribeQuery(queryId);
    },
    openExternalUrl: async (url) => {
      window.open(url, '_blank');
    },
    showItemInFolder: async () => {
      // No-op on web
    },
    showFileSaveDialog: async () => undefined,
    push: {
      enable: (userId, vapidPublicKey) =>
        vapidPublicKey
          ? enableWebPush(userId, vapidPublicKey)
          : Promise.resolve(false),
      disable: (userId) => disableWebPush(userId),
      getState: () => getWebPushState(),
      isSupported: () => isWebPushSupported(),
    },
  };

  window.eventBus = eventBus;

  workerApi.subscribe(
    Comlink.proxy((event) => {
      eventBus.publish(event);
    })
  );

  const root = createRoot(document.getElementById('root') as HTMLElement);
  // Intentional double boundary: <Root> renders <App type="web"/>, which
  // already wraps its own children in an AppErrorBoundary
  // (context={`app-${type}`}) inside packages/ui, so this outer instance is
  // a last-resort net around Root/App's own render/mount, not a duplicate of
  // the inner one. Kept distinct via the "web-main" context label so logs
  // show which layer actually caught the error.
  root.render(
    <AppErrorBoundary context="web-main">
      <Root />
    </AppErrorBoundary>
  );
};

initializeApp().catch((error) => {
  console.error('[Web] Failed to initialize app', error);
  const root = createRoot(document.getElementById('root') as HTMLElement);
  root.render(<BrowserNotSupported />);
});
