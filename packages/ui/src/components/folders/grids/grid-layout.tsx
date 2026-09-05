import { InView } from 'react-intersection-observer';

import { GridFile } from '@colanode/ui/components/folders/grids/grid-file';
import { useFolder } from '@colanode/ui/contexts/folder';

export const GridLayout = () => {
  const folder = useFolder();

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
        {folder.files.map((file) => (
          <GridFile key={file.id} file={file} />
        ))}
      </div>
      <InView
        rootMargin="200px"
        onChange={(inView) => {
          if (inView && folder.hasNextPage && !folder.isFetchingNextPage) {
            folder.fetchNextPage();
          }
        }}
      />
    </div>
  );
};
