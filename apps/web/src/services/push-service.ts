const urlBase64ToUint8Array = (base64: string): Uint8Array<ArrayBuffer> => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

export const isWebPushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

export const getWebPushState = async (): Promise<
  'unsupported' | 'denied' | 'enabled' | 'disabled'
> => {
  if (!isWebPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'enabled' : 'disabled';
};

const toKeys = (sub: PushSubscription) => {
  const p256dh = sub.getKey('p256dh');
  const auth = sub.getKey('auth');
  const b64 = (buf: ArrayBuffer | null) =>
    buf ? btoa(String.fromCharCode(...new Uint8Array(buf))) : '';
  return { p256dh: b64(p256dh), auth: b64(auth) };
};

export const enableWebPush = async (
  userId: string,
  vapidPublicKey: string
): Promise<boolean> => {
  if (!isWebPushSupported()) return false;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  const { p256dh, auth } = toKeys(sub);
  await window.colanode.executeMutation({
    type: 'pushSubscription.create',
    userId,
    endpoint: sub.endpoint,
    p256dh,
    auth,
  });
  return true;
};

export const disableWebPush = async (userId: string): Promise<void> => {
  if (!isWebPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await window.colanode.executeMutation({
    type: 'pushSubscription.delete',
    userId,
    endpoint,
  });
};
