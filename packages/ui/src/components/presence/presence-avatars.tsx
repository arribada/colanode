import { useMemo } from 'react';

import { PresenceState } from '@colanode/core';
import { cn } from '@colanode/ui/lib/utils';
import { presenceInitials } from '@colanode/ui/lib/presence';

interface PresenceAvatarsProps {
  presences: PresenceState[];
  className?: string;
  max?: number;
}

/**
 * A compact "who's viewing" avatar stack. Dedupes by user (a user with several
 * devices shows once) and renders a colored initials chip per user, with an
 * overflow chip beyond `max`.
 */
export const PresenceAvatars = ({
  presences,
  className,
  max = 5,
}: PresenceAvatarsProps) => {
  const users = useMemo(() => {
    const byUser = new Map<string, PresenceState>();
    for (const presence of presences) {
      if (!byUser.has(presence.userId)) {
        byUser.set(presence.userId, presence);
      }
    }
    return Array.from(byUser.values());
  }, [presences]);

  if (users.length === 0) {
    return null;
  }

  const shown = users.slice(0, max);
  const overflow = users.length - shown.length;

  return (
    <div className={cn('flex items-center -space-x-2', className)}>
      {shown.map((presence) => (
        <div
          key={presence.userId}
          title={presence.name}
          className="flex size-6 items-center justify-center rounded-full border-2 border-background text-[10px] font-semibold text-white shadow-sm"
          style={{ backgroundColor: presence.color }}
        >
          {presenceInitials(presence.name)}
        </div>
      ))}
      {overflow > 0 && (
        <div
          title={`${overflow} more`}
          className="flex size-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold text-muted-foreground shadow-sm"
        >
          +{overflow}
        </div>
      )}
    </div>
  );
};
