/// <reference lib="webworker" />

// Service worker that intercepts requests with the path /asset
declare const self: ServiceWorkerGlobalScope & {
  __WB_DISABLE_DEV_LOGS: boolean;
};

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';

import { WebFileSystem } from '@colanode/web/services/file-system';
import { WebPathService } from '@colanode/web/services/path-service';

const path = new WebPathService();
const fs = new WebFileSystem();

self.__WB_DISABLE_DEV_LOGS = true;
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ url }) => url.origin === self.location.origin,
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
