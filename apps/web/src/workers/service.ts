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
// so the entry document is never stale.
registerRoute(
  ({ url, request }) =>
    url.origin === self.location.origin && request.mode !== 'navigate',
  new StaleWhileRevalidate({
    cacheName: 'same-origin-assets',
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
      icon: '/assets/colanode-logo-192.jpg',
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
