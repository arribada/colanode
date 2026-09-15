// ABOUTME: "New from template" submenu shared by the space, page and folder sidebar
// ABOUTME: menus, plus the hook that copies a template tree under a chosen parent.
import { useNavigate } from '@tanstack/react-router';
import { FileStack } from 'lucide-react';
import { toast } from 'sonner';

import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { useMutation } from '@colanode/ui/hooks/use-mutation';

interface UseCreatePageFromTemplateOptions {
  // The space whose templates are used (templates live under their space).
  spaceId: string;
  // Where the copy is filed: the space itself, a page or a folder of it.
  parentId: string;
  onCreated?: (pageId: string) => void;
}

// Call this in the sidebar row / dropdown owner, not inside the menu content:
// the menu closes (and unmounts its content) as soon as an item is picked, and
// the navigation must still happen when the copy finishes.
export const useCreatePageFromTemplate = ({
  spaceId,
  parentId,
  onCreated,
}: UseCreatePageFromTemplateOptions) => {
  const workspace = useWorkspace();
  const navigate = useNavigate({ from: '/workspace/$userId' });
  const { mutate, isPending } = useMutation();

  return (templateId: string) => {
    if (isPending) {
      return;
    }

    mutate({
      input: {
        type: 'page.template.create',
        userId: workspace.userId,
        templateId,
        spaceId,
        parentId,
      },
      onSuccess(output) {
        onCreated?.(output.id);
        navigate({
          to: '$nodeId',
          params: { nodeId: output.id },
        });
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };
};

interface PageTemplateSubmenuProps {
  spaceId: string;
  onSelect: (templateId: string) => void;
}

// Render inside DropdownMenuContent: the content only mounts while the menu is
// open, so the template list is queried then — not once per sidebar row.
// Renders nothing when the space has no templates.
export const PageTemplateSubmenu = ({
  spaceId,
  onSelect,
}: PageTemplateSubmenuProps) => {
  const workspace = useWorkspace();

  const pageTemplatesQuery = useLiveQuery({
    type: 'page.template.list',
    userId: workspace.userId,
    spaceId,
  });
  const pageTemplates = pageTemplatesQuery.data ?? [];

  if (pageTemplates.length === 0) {
    return null;
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="flex flex-row items-center gap-2 cursor-pointer">
        <FileStack className="size-4" />
        <span>New from template</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {pageTemplates.map((template) => (
          <DropdownMenuItem
            key={template.id}
            data-testid={`page-template-item-${template.id}`}
            className="cursor-pointer"
            onSelect={() => onSelect(template.id)}
          >
            {template.name || 'Untitled'}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
