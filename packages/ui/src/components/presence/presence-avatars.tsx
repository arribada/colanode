import { useMemo } from 'react';

import { getIdType, IdType, PresenceState } from '@colanode/core';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { presenceInitials } from '@colanode/ui/lib/presence';
import { cn } from '@colanode/ui/lib/utils';

interface PresenceAvatarsProps {
  presences: PresenceState[];
  className?: string;
  max?: number;
}

const CHIP_CLASS =
  'flex size-6 items-center justify-center overflow-hidden rounded-full border-2 border-background text-[10px] font-semibold text-white shadow-sm';

const InitialsChip = ({ presence }: { presence: PresenceState }) => (
  <div
    title={presence.name}
    className={CHIP_CLASS}
    style={{ backgroundColor: presence.color }}
  >
    {presenceInitials(presence.name)}
  </div>
);

// Resolves the collaborator's real avatar image; falls back to the colored
// initials chip while pending or on failure.
const AvatarImageChip = ({ presence }: { presence: PresenceState }) => {
  const workspace = useWorkspace();
  const query = useLiveQuery({
    type: 'avatar.get',
    accountId: workspace.accountId,
    avatarId: presence.avatar as string,
  });

  const url = query.data?.url;
  if (!url) {
    return <InitialsChip presence={presence} />;
  }

  return (
    <img
      src={url}
      title={presence.name}
      alt={presence.name}
      className={cn(CHIP_CLASS, 'object-cover')}
      style={{ backgroundColor: presence.color }}
    />
  );
};

/**
 * A compact "who's viewing" avatar stack. Dedupes by user (a user with several
 * devices shows once) and renders each user's real avatar image (falling back
 * to a colored initials chip), with an overflow chip beyond `max`.
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
      {shown.map((presence) => {
        const hasImage =
          !!presence.avatar && getIdType(presence.avatar) === IdType.Avatar;
        return hasImage ? (
          <AvatarImageChip key={presence.userId} presence={presence} />
        ) : (
          <InitialsChip key={presence.userId} presence={presence} />
        );
      })}
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
