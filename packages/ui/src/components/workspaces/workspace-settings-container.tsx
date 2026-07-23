import { eq, useLiveQuery } from '@tanstack/react-db';
import { toast } from 'sonner';

import { collections } from '@colanode/ui/collections';
import { Container } from '@colanode/ui/components/layouts/containers/container';
import { Checkbox } from '@colanode/ui/components/ui/checkbox';
import { Separator } from '@colanode/ui/components/ui/separator';
import { WorkspaceCloud } from '@colanode/ui/components/workspaces/workspace-cloud';
import { WorkspaceDelete } from '@colanode/ui/components/workspaces/workspace-delete';
import { WorkspaceForm } from '@colanode/ui/components/workspaces/workspace-form';
import { WorkspaceNotFound } from '@colanode/ui/components/workspaces/workspace-not-found';
import { WorkspaceSettingsBreadcrumb } from '@colanode/ui/components/workspaces/workspace-settings-breadcrumb';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useChatVisibility } from '@colanode/ui/hooks/use-chat-visibility';
import { useMutation } from '@colanode/ui/hooks/use-mutation';

export const WorkspaceSettingsContainer = () => {
  const workspace = useWorkspace();
  const { mutate, isPending } = useMutation();
  const [showChat, setShowChat] = useChatVisibility();

  const currentWorkspaceQuery = useLiveQuery(
    (q) =>
      q
        .from({ workspaces: collections.workspaces })
        .where(({ workspaces }) => eq(workspaces.userId, workspace.userId))
        .select(({ workspaces }) => ({
          name: workspaces.name,
          description: workspaces.description,
          avatar: workspaces.avatar,
        })),
    [workspace.userId]
  );

  const currentWorkspace = currentWorkspaceQuery.data?.[0];
  const canEdit = workspace.role === 'owner';

  if (!currentWorkspace) {
    return <WorkspaceNotFound />;
  }

  return (
    <Container type="full" breadcrumb={<WorkspaceSettingsBreadcrumb />}>
      <div className="max-w-4xl space-y-8">
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">General</h2>
            <Separator className="mt-3" />
          </div>
          <WorkspaceForm
            readOnly={!canEdit}
            values={{
              name: currentWorkspace.name,
              description: currentWorkspace.description ?? '',
              avatar: currentWorkspace.avatar ?? null,
            }}
            onSubmit={(values) => {
              mutate({
                input: {
                  type: 'workspace.update',
                  userId: workspace.userId,
                  name: values.name,
                  description: values.description,
                  avatar: values.avatar ?? null,
                },
                onSuccess() {
                  toast.success('Workspace updated');
                },
                onError(error) {
                  toast.error(error.message);
                },
              });
            }}
            isSaving={isPending}
            saveText="Update"
          />
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Chat</h2>
            <Separator className="mt-3" />
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Show chats and channels in the sidebar and search results. Off by
              default — comments on pages keep working either way. This
              preference only applies to this workspace on this device.
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Checkbox
                id="workspace-show-chat"
                checked={showChat}
                onCheckedChange={(checked) => setShowChat(checked === true)}
              />
              <label
                htmlFor="workspace-show-chat"
                className="cursor-pointer text-sm font-medium"
              >
                Show chat
              </label>
            </div>
          </div>
        </div>

        <WorkspaceCloud />

        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Danger Zone
            </h2>
            <Separator className="mt-3" />
          </div>
          <WorkspaceDelete />
        </div>
      </div>
    </Container>
  );
};
