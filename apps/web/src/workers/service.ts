/// <reference lib="webworker" />

// Service worker that intercepts requests with the path /asset
declare const self: ServiceWorkerGlobalScope & {
  __WB_DISABLE_DEV_LOGS: boolean;
};

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

import { WebFileSystem } from '@colanode/web/services/file-system';
import { WebPathService } from '@colanode/web/services/path-service';

const path = new WebPathService();
const fs = new WebFileSystem();

self.__WB_DISABLE_DEV_LOGS = true;
precacheAndRoute(self.__WB_MANIFEST);

// Take control of already-open tabs the moment this SW activates, so a new
// deploy applies without waiting for every tab of the app to be closed.
clientsClaim();

// HTML navigations go to the network FIRST: a fresh deploy's index.html (which
// points at the new content-hashed JS/CSS) is then picked up on the next load,
// so updates land on a single reload instead of being served stale from cache.
// Falls back to the cached shell when offline.
registerRoute(
  new NavigationRoute(
    new NetworkFirst({ cacheName: 'html', networkTimeoutSeconds: 5 })
  )
);

// Other same-origin assets are content-hashed, so serving them fast while
// revalidating is safe. Navigations are excluded (handled network-first above)
// so the entry document is never stale. API paths are excluded too: SWR would
// serve a cached 200 for /share-api/:token/data even after the share is revoked
// or expired (silently defeating revocation), and stale /api|/client responses
// must never be replayed — those always go to the network.
// Never store an HTML body under a script or stylesheet URL. Until the nginx
// rule above it, a hashed chunk removed by a deploy was answered with the SPA
// shell and a 200, and this cache happily kept it: every later load then got
// HTML where it expected a module, and no reload could clear it because the
// poison lived in the cache, not in the page.
const rejectShellForAssets = {
  cacheWillUpdate: async ({
    request,
    response,
  }: {
    request: Request;
    response: Response;
  }): Promise<Response | null> => {
    if (!response || response.status !== 200) {
      return null;
    }
    const destination = request.destination;
    if (destination !== 'script' && destination !== 'style') {
      return response;
    }
    const type = response.headers.get('content-type') ?? '';
    return type.includes('text/html') ? null : response;
  },
};

registerRoute(
  ({ url, request }) =>
    url.origin === self.location.origin &&
    request.mode !== 'navigate' &&
    !url.pathname.startsWith('/share-api') &&
    !url.pathname.startsWith('/api') &&
    !url.pathname.startsWith('/client'),
  new StaleWhileRevalidate({
    cacheName: 'same-origin-assets',
    plugins: [rejectShellForAssets],
  })
);

export const downloadDbs = async () => {
  await Promise.all([downloadEmojis(), downloadIcons()]);
};

export const downloadEmojis = async () => {
  try {
    const emojiResponse = await fetch('/assets/emojis.db');
    if (!emojiResponse.ok) {
      throw new Error(
        `Failed to download emoji database: ${emojiResponse.status}`
      );
    }
    const emojiData = await emojiResponse.arrayBuffer();
    await fs.writeFile(path.emojisDatabase, new Uint8Array(emojiData));
  } catch (error) {
    console.error('Failed to download emojis:', error);
  }
};

export const downloadIcons = async () => {
  try {
    const iconResponse = await fetch('/assets/icons.db');
    if (!iconResponse.ok) {
      throw new Error(
        `Failed to download icon database: ${iconResponse.status}`
      );
    }
    const iconData = await iconResponse.arrayBuffer();
    await fs.writeFile(path.iconsDatabase, new Uint8Array(iconData));
  } catch (error) {
    console.error('Failed to download icons:', error);
  }
};

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(Promise.all([downloadDbs(), self.skipWaiting()]));
});

// One-time repair for caches poisoned before the guard above existed. Bump
// the marker only to force another purge; every already-repaired browser
// skips it, so this costs one cache lookup per activation.
const CACHE_PURGE_MARKER = '/__cache-purge/2026-09-14-html-under-js';

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      try {
        const markers = await caches.open('purge-markers');
        const done = await markers.match(CACHE_PURGE_MARKER);
        if (!done) {
          await caches.delete('same-origin-assets');
          await caches.delete('html');
          await markers.put(CACHE_PURGE_MARKER, new Response('done'));
        }
      } catch {
        // A browser that refuses the Cache API still gets a working app; it
        // just goes to the network for everything.
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;
  let payload: { title?: string; body?: string; url?: string; rootId?: string };
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'New message', body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'New message', {
      body: payload.body ?? '',
      data: { url: payload.url ?? '/' },
      tag: payload.rootId,
      // The old path, colanode-logo-192.jpg, was never shipped: every push
      // notification asked for a 404 and showed a blank icon.
      icon: '/assets/arribada-app-192.png',
    })
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? '/';
  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clientsArr) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(url);
            } catch {
              /* ignore cross-origin navigate errors */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
