import { useNavigate } from '@tanstack/react-router';
import {
  Check,
  Filter,
  GalleryVertical,
  LayoutGrid,
  List,
  Plus,
  Upload,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  LocalFolderNode,
  LocalPageNode,
  FolderLayoutType,
} from '@colanode/client/types';
import { generateId, IdType, NodeRole } from '@colanode/core';
import { FolderFiles } from '@colanode/ui/components/folders/folder-files';
import { Button } from '@colanode/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { Dropzone } from '@colanode/ui/components/ui/dropzone';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { openFileDialog } from '@colanode/ui/lib/files';

export type FolderLayoutOption = {
  value: FolderLayoutType;
  name: string;
  description: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  enabled: boolean;
};

export const folderLayouts: FolderLayoutOption[] = [
  {
    name: 'Grid',
    value: 'grid',
    description: 'Show files in grid layout',
    icon: LayoutGrid,
    enabled: true,
  },
  {
    name: 'List',
    value: 'list',
    description: 'Show files in list layout',
    icon: List,
    enabled: false,
  },
  {
    name: 'Gallery',
    value: 'gallery',
    description: 'Show files in gallery layout',
    icon: GalleryVertical,
    enabled: false,
  },
];

interface FolderBodyProps {
  folder: LocalFolderNode;
  role: NodeRole;
}

export const FolderBody = ({ folder }: FolderBodyProps) => {
  const workspace = useWorkspace();
  const navigate = useNavigate({ from: '/workspace/$userId' });

  const [layout, setLayout] = useState<FolderLayoutType>('grid');

  const currentLayout =
    folderLayouts.find((l) => l.value === layout) ?? folderLayouts[0];

  const handleUploadClick = async () => {
    const result = await openFileDialog();

    if (result.type === 'success') {
      result.files.forEach((tempFile) => {
        window.colanode
          .executeMutation({
            type: 'file.create',
            userId: workspace.userId,
            tempFileId: tempFile.id,
            parentId: folder.id,
          })
          .then((result) => {
            if (!result.success) {
              toast.error(result.error.message);
            }
          });
      });
    } else if (result.type === 'error') {
      toast.error(result.error);
    }
  };

  // Folders are now just legacy containers of nested pages/files — the same
  // "create a child page" affordance a page has, so a folder isn't a dead end
  // that can only hold uploads. (There is no "new folder" anymore: you create
  // pages, which can themselves contain children.)
  const handleCreatePage = () => {
    const childId = generateId(IdType.Page);
    const child: LocalPageNode = {
      id: childId,
      type: 'page',
      name: '',
      avatar: null,
      parentId: folder.id,
      rootId: folder.rootId,
      createdAt: new Date().toISOString(),
      createdBy: workspace.userId,
      updatedAt: null,
      updatedBy: null,
      localRevision: '0',
      serverRevision: '0',
    };

    try {
      workspace.collections.nodes.insert(child);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not create page'
      );
      return;
    }

    navigate({ to: '$nodeId', params: { nodeId: childId } });
  };

  return (
    <Dropzone
      text="Drop files here to upload them in the folder"
      onDrop={(files) => {
        files.forEach((file) => console.log(file));
      }}
    >
      <div className="flex h-full max-h-full flex-col gap-4 overflow-y-auto">
        <div className="flex flex-row justify-between">
          <div className="flex flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCreatePage}
            >
              <Plus className="mr-2 size-4" /> New page
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleUploadClick}
              data-testid="folder-upload-button"
            >
              <Upload className="mr-2 size-4" /> Upload
            </Button>
          </div>
          <div className="flex flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled
              aria-label="Filter files"
            >
              <Filter className="size-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Change layout"
                >
                  {currentLayout && <currentLayout.icon className="size-4" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="mr-5 w-56">
                <DropdownMenuLabel>Layout</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {folderLayouts.map((item) => (
                  <DropdownMenuItem
                    key={item.value}
                    onClick={() => setLayout(item.value)}
                    disabled={!item.enabled}
                  >
                    <div className="flex w-full flex-row items-center gap-2">
                      <item.icon className="size-4" />
                      <p className="grow">{item.name}</p>
                      {layout === item.value && <Check className="size-4" />}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <FolderFiles id={folder.id} name="Folder" layout={layout} />
      </div>
    </Dropzone>
  );
};
