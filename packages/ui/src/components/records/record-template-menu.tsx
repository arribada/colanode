import { useNavigate } from '@tanstack/react-router';
import { FileStack } from 'lucide-react';
import { toast } from 'sonner';

import { DatabaseViewFilterAttributes } from '@colanode/core';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { generateFieldValuesFromFilters } from '@colanode/ui/lib/databases';

interface RecordTemplateMenuProps {
  // Active view filters (e.g. the board column or calendar day this menu
  // was opened from) applied on top of the template's own field values, so
  // the created record lands where the user actually clicked.
  filters?: DatabaseViewFilterAttributes[];
}

// Small "New from template" trigger shown next to the plain "Add record"
// control. Renders nothing when the database has no templates yet, so it
// stays out of the way until someone saves one.
export const RecordTemplateMenu = ({ filters }: RecordTemplateMenuProps) => {
  const database = useDatabase();
  const workspace = useWorkspace();
  const navigate = useNavigate();

  const templatesQuery = useLiveQuery({
    type: 'record.template.list',
    userId: workspace.userId,
    databaseId: database.id,
  });
  const templates = templatesQuery.data ?? [];

  const { mutate: createFromTemplate } = useMutation();

  if (!database.canCreateRecord || templates.length === 0) {
    return null;
  }

  const handleSelect = (templateId: string) => {
    const fieldOverrides = generateFieldValuesFromFilters(
      database.fields,
      filters ?? [],
      workspace.userId
    );

    createFromTemplate({
      input: {
        type: 'record.template.create',
        userId: workspace.userId,
        templateId,
        fieldOverrides,
      },
      onSuccess(output) {
        navigate({
          from: '/workspace/$userId/$nodeId',
          to: 'modal/$modalNodeId',
          params: { modalNodeId: output.id },
        });
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="New from template"
          data-testid="record-template-menu-trigger"
          className="flex size-8 cursor-pointer items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <FileStack className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" className="w-56">
        <DropdownMenuLabel>New from template</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {templates.map((template) => (
          <DropdownMenuItem
            key={template.id}
            data-testid={`record-template-item-${template.id}`}
            className="cursor-pointer"
            onSelect={() => handleSelect(template.id)}
          >
            {template.name || 'Untitled'}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
