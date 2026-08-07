// ABOUTME: Account-level "Preferences" settings — user-tunable UI behaviours
// ABOUTME: stored in the local metadata store (e.g. record-properties collapse).
import { useEffect, useState } from 'react';

import { Input } from '@colanode/ui/components/ui/input';
import { Label } from '@colanode/ui/components/ui/label';
import { useRecordPropertiesThreshold } from '@colanode/ui/hooks/use-record-properties-threshold';

export const AccountPreferences = () => {
  const [threshold, setThreshold] = useRecordPropertiesThreshold();

  // Local draft so typing feels natural: valid values persist live, while an
  // empty/invalid entry is reverted to the last good value on blur.
  const [draft, setDraft] = useState(String(threshold));

  useEffect(() => {
    setDraft(String(threshold));
  }, [threshold]);

  const commit = (raw: string) => {
    const next = Number.parseInt(raw, 10);
    if (Number.isFinite(next) && next >= 1) {
      setThreshold(next);
    } else {
      setDraft(String(threshold));
    }
  };

  return (
    <div className="flex items-center justify-between gap-6">
      <div className="flex-1 space-y-2">
        <Label
          htmlFor="record-properties-threshold"
          className="font-semibold"
        >
          Collapse record properties after
        </Label>
        <p className="text-sm text-muted-foreground">
          On a record page, only this many properties are shown before the rest
          collapse behind a &ldquo;show more&rdquo; toggle. Raise it to keep more
          fields visible at once. Applies on this device.
        </p>
      </div>
      <div className="shrink-0">
        <Input
          id="record-properties-threshold"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            const next = Number.parseInt(e.target.value, 10);
            if (Number.isFinite(next) && next >= 1) {
              setThreshold(next);
            }
          }}
          onBlur={(e) => commit(e.target.value)}
          className="w-20"
          data-testid="record-properties-threshold-input"
        />
      </div>
    </div>
  );
};
