// ABOUTME: Per-user preference for how many record properties show before the
// ABOUTME: rest collapse behind a "show more" toggle (default 5).
import { useMetadata } from '@colanode/ui/hooks/use-metadata';

// Default number of properties shown on a record page before the remainder are
// collapsed behind a show-more/less toggle.
export const DEFAULT_RECORD_PROPERTIES_THRESHOLD = 5;

// Reads/writes the "collapse record properties after N" preference from the
// local, client-side metadata store — the same mechanism used for sidebar
// width and chat visibility (namespace `preferences`, key
// `recordPropertiesThreshold`). It is a device-local preference: no server or
// core change is involved. Persisted values are clamped to a minimum of 1; an
// unset or invalid value falls back to the default of 5.
export const useRecordPropertiesThreshold = (): [
  number,
  (value: number) => void,
] => {
  const [stored, setStored] = useMetadata<number>(
    'preferences',
    'recordPropertiesThreshold'
  );

  const threshold =
    typeof stored === 'number' && Number.isFinite(stored) && stored >= 1
      ? Math.floor(stored)
      : DEFAULT_RECORD_PROPERTIES_THRESHOLD;

  const setThreshold = (value: number) => {
    if (!Number.isFinite(value)) {
      return;
    }
    setStored(Math.max(1, Math.floor(value)));
  };

  return [threshold, setThreshold];
};
