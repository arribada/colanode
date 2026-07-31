import { inArray, useLiveQuery } from '@tanstack/react-db';
import { X } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  CollaboratorFieldAttributes,
  StringArrayFieldValue,
} from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { Badge } from '@colanode/ui/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import { Separator } from '@colanode/ui/components/ui/separator';
import { UserSearch } from '@colanode/ui/components/users/user-search';
import { useRecord } from '@colanode/ui/contexts/record';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useRecordField } from '@colanode/ui/hooks/use-record-field';

interface CollaboratorBadgeProps {
  id: string;
  name: string;
  avatar: string | null;
}

const CollaboratorBadge = ({ id, name, avatar }: CollaboratorBadgeProps) => {
  return (
    <div className="flex flex-row items-center gap-1 text-sm">
      <Avatar id={id} name={name} avatar={avatar} size="small" />
      <p>{name}</p>
    </div>
  );
};

interface RecordCollaboratorValueProps {
  field: CollaboratorFieldAttributes;
  readOnly?: boolean;
}

export const RecordCollaboratorValue = ({
  field,
  readOnly,
}: RecordCollaboratorValueProps) => {
  const workspace = useWorkspace();
  const record = useRecord();
  const { value, setValue, clearValue } = useRecordField<StringArrayFieldValue>(
    {
      field,
    }
  );

  const [open, setOpen] = useState(false);

  const collaboratorIds = useMemo(() => value?.value ?? [], [value]);
  const collaboratorsQuery = useLiveQuery(
    (q) =>
      q
        .from({ users: workspace.collections.users })
        .where(({ users }) => inArray(users.id, collaboratorIds))
        .select(({ users }) => ({
          id: users.id,
          name: users.name,
          avatar: users.avatar,
          email: users.email,
        })),
    [workspace.userId, collaboratorIds]
  );

  const collaborators = collaboratorsQuery.data;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={field.name}
          className="flex h-full w-full cursor-pointer flex-wrap gap-1 p-0 overflow-hidden text-left"
        >
          {collaborators.slice(0, 1).map((collaborator) => (
            <CollaboratorBadge
              key={collaborator.id}
              id={collaborator.id}
              name={collaborator.name}
              avatar={collaborator.avatar}
            />
          ))}
          {collaborators.length === 0 && ' '}
          {collaborators.length > 1 && (
            <Badge
              variant="outline"
              className="ml-2 text-xs px-1 text-muted-foreground"
            >
              +{collaborators.length - 1}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-1">
        {collaborators.length > 0 && (
          <div className="flex flex-col flex-wrap gap-2 p-2">
            {collaborators.map((collaborator) => (
              <div
                key={collaborator.id}
                data-testid={`record-collaborator-row-${collaborator.id}`}
                className="flex w-full flex-row items-center gap-2"
              >
                <Avatar
                  id={collaborator.id}
                  name={collaborator.name}
                  avatar={collaborator.avatar}
                  className="h-7 w-7"
                />
                <div className="flex grow flex-col">
                  <p className="text-sm">{collaborator.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {collaborator.email}
                  </p>
                </div>
                {record.canEdit && !readOnly && (
                  <button
                    type="button"
                    aria-label="Remove collaborator"
                    data-testid={`record-collaborator-remove-${collaborator.id}`}
                    className="cursor-pointer"
                    onClick={() => {
                      if (!record.canEdit || readOnly) return;

                      const newCollaborators = collaboratorIds.filter(
                        (id) => id !== collaborator.id
                      );

                      if (newCollaborators.length === 0) {
                        clearValue();
                      } else {
                        setValue({
                          type: 'string_array',
                          value: newCollaborators,
                        });
                      }
                    }}
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            ))}
            <Separator className="w-full my-2" />
          </div>
        )}
        {record.canEdit && !readOnly && (
          <UserSearch
            exclude={collaboratorIds}
            onSelect={(user) => {
              if (!record.canEdit || readOnly) return;

              const newCollaborators = collaboratorIds.includes(user.id)
                ? collaboratorIds.filter((id) => id !== user.id)
                : [...collaboratorIds, user.id];

              if (newCollaborators.length === 0) {
                clearValue();
              } else {
                setValue({
                  type: 'string_array',
                  value: newCollaborators,
                });
              }

              setOpen(false);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
};
