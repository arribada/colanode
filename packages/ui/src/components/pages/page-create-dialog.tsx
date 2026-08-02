import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';

import { LocalPageNode } from '@colanode/client/types';
import { generateId, IdType } from '@colanode/core';
import {
  PageForm,
  PageFormValues,
} from '@colanode/ui/components/pages/page-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

interface PageCreateDialogProps {
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Optional destination picker. When more than one space is supplied the
  // dialog renders a space selector (defaulting to `spaceId`), and the chosen
  // space becomes the new page's parent and root. Omitted — or a single space —
  // keeps the original fixed-`spaceId` behaviour (e.g. the space sidebar).
  spaces?: { id: string; name: string }[];
}

export const PageCreateDialog = ({
  spaceId,
  open,
  onOpenChange,
  spaces,
}: PageCreateDialogProps) => {
  const workspace = useWorkspace();
  const navigate = useNavigate({ from: '/workspace/$userId' });

  const [selectedSpaceId, setSelectedSpaceId] = useState(spaceId);

  // Only offer the picker when there's an actual choice to make.
  const showSpacePicker = (spaces?.length ?? 0) > 1;
  // Where the page is created: the picked space when the selector is shown,
  // otherwise the fixed `spaceId` prop (unchanged for existing callers).
  const targetSpaceId = showSpacePicker ? selectedSpaceId : spaceId;

  const { mutate } = useMutation({
    mutationFn: async (values: PageFormValues) => {
      const pageId = generateId(IdType.Page);
      const nodes = workspace.collections.nodes;

      const page: LocalPageNode = {
        id: pageId,
        type: 'page',
        name: values.name,
        avatar: values.avatar,
        parentId: targetSpaceId,
        rootId: targetSpaceId,
        createdAt: new Date().toISOString(),
        createdBy: workspace.userId,
        updatedAt: null,
        updatedBy: null,
        localRevision: '0',
        serverRevision: '0',
      };

      nodes.insert(page);
      return page;
    },
    onSuccess: (page) => {
      navigate({
        to: '$nodeId',
        params: {
          nodeId: page.id,
        },
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create page</DialogTitle>
          <DialogDescription>
            Create a new page to collaborate with your peers
          </DialogDescription>
        </DialogHeader>
        {showSpacePicker ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Space</span>
            <select
              aria-label="Choose a space"
              value={selectedSpaceId}
              onChange={(event) => setSelectedSpaceId(event.target.value)}
              className="w-full rounded border border-border/60 bg-background px-2 py-1.5 text-sm text-foreground outline-none"
            >
              {spaces?.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <PageForm
          id={generateId(IdType.Page)}
          values={{
            name: '',
          }}
          submitText="Create"
          testId="page-create-submit"
          onCancel={() => {
            onOpenChange(false);
          }}
          onSubmit={(values) => mutate(values)}
        />
      </DialogContent>
    </Dialog>
  );
};
