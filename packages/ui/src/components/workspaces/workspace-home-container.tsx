import { Container } from '@colanode/ui/components/layouts/containers/container';
import { WorkspaceHomeBreadcrumb } from '@colanode/ui/components/workspaces/workspace-home-breadcrumb';
import { WorkspaceHomeDashboard } from '@colanode/ui/components/workspaces/workspace-home-dashboard';

export const WorkspaceHomeContainer = () => {
  return (
    <Container type="full" breadcrumb={<WorkspaceHomeBreadcrumb />}>
      <WorkspaceHomeDashboard />
    </Container>
  );
};
