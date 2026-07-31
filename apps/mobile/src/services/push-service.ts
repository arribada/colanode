import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { MobilePushState } from '@colanode/mobile/lib/types';

// shortcut: "enabled" is tracked as a module-level flag instead of
// persisted storage -- it resets on process restart, so a cold app
// relaunch with an already-granted OS permission reads back as
// 'disabled' until the user re-enables. Re-enabling just re-registers the
// same OS-issued device token (apnsSubscription.create upserts by
// deviceToken), so the reset is harmless. Swap for a persisted flag
// (SQLite/file) if that reset proves disruptive.
let enabled = false;

export class MobilePushService {
  public isSupported(): boolean {
    return Platform.OS === 'ios' && Device.isDevice;
  }

  public async getState(): Promise<MobilePushState> {
    if (!this.isSupported()) {
      return 'unsupported';
    }

    try {
      const permissions = await Notifications.getPermissionsAsync();
      if (permissions.status === 'denied') {
        return 'denied';
      }

      return enabled ? 'enabled' : 'disabled';
    } catch (error) {
      console.error('[MobilePush] Failed to read permissions state', error);
      throw error;
    }
  }

  public async enable(): Promise<string | null> {
    if (!this.isSupported()) {
      return null;
    }

    try {
      const permissions = await Notifications.requestPermissionsAsync();
      if (permissions.status !== 'granted') {
        return null;
      }

      const token = await Notifications.getDevicePushTokenAsync();
      enabled = true;
      return token.data;
    } catch (error) {
      console.error('[MobilePush] Failed to enable push notifications', error);
      throw error;
    }
  }

  public async disable(): Promise<void> {
    enabled = false;
  }
}
