import { useEffect, useState } from 'react';

import { Checkbox } from '@colanode/ui/components/ui/checkbox';
import { Separator } from '@colanode/ui/components/ui/separator';
import { useApp } from '@colanode/ui/contexts/app';
import { useServer } from '@colanode/ui/contexts/server';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { WebPushState } from '@colanode/ui/window';

export const AppNotificationSettings = () => {
  const app = useApp();
  const workspace = useWorkspace();
  const server = useServer();
  const [state, setState] = useState<WebPushState | 'loading'>('loading');

  useEffect(() => {
    if (app.type !== 'web' && app.type !== 'mobile') {
      return;
    }

    window.colanode.push
      .getState()
      .then(setState)
      .catch(() => setState('unsupported'));
  }, [app.type]);

  // Push notifications are delivered via web push (PWA/browser) or native
  // APNs (mobile) — desktop has no equivalent yet, so the toggle only
  // renders in the web app and the mobile app.
  if (app.type !== 'web' && app.type !== 'mobile') {
    return null;
  }

  const serverPush = server.attributes.push;
  const serverApns = server.attributes.apns;
  const pushAvailable =
    app.type === 'web'
      ? !!serverPush?.enabled && !!serverPush.publicKey
      : serverApns?.enabled === true;

  const onToggle = async (checked: boolean) => {
    if (checked) {
      if (!pushAvailable) {
        return;
      }

      const ok =
        app.type === 'web'
          ? await window.colanode.push.enable(
              workspace.userId,
              serverPush?.publicKey
            )
          : await window.colanode.push.enable(workspace.userId);
      setState(ok ? 'enabled' : 'denied');
    } else {
      await window.colanode.push.disable(workspace.userId);
      setState('disabled');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Notifications
        </h2>
        <Separator className="mt-3" />
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {state === 'unsupported'
            ? app.type === 'web'
              ? 'Add this app to your Home Screen to enable notifications.'
              : 'Push notifications are not supported on this device.'
            : state === 'denied'
              ? app.type === 'web'
                ? 'Notifications are blocked in your browser settings.'
                : 'Notifications are blocked. Enable them for this app in iOS Settings.'
              : 'Push notifications on this device.'}
        </div>
        <Checkbox
          aria-label="Enable push notifications"
          checked={state === 'enabled'}
          disabled={
            state === 'unsupported' ||
            state === 'denied' ||
            state === 'loading' ||
            !pushAvailable
          }
          onCheckedChange={(checked) => {
            if (typeof checked === 'boolean') {
              void onToggle(checked);
            }
          }}
        />
      </div>
    </div>
  );
};
