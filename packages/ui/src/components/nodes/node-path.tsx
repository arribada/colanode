// ABOUTME: One muted line naming where a node lives, "Space › … › Parent", under
// ABOUTME: its title in lists where many pages share the same name.
import { NodePathSegment } from '@colanode/client/queries';
import {
  PATH_ELLIPSIS,
  PATH_SEPARATOR,
  formatPath,
  segmentLabel,
  truncatePathLeft,
} from '@colanode/ui/lib/node-path';
import { cn } from '@colanode/ui/lib/utils';

interface NodePathProps {
  segments: NodePathSegment[];
  maxChars?: number;
  className?: string;
}

export const NodePath = ({
  segments,
  maxChars = 64,
  className,
}: NodePathProps) => {
  if (segments.length === 0) {
    return null;
  }

  const labels = segments.map(segmentLabel);
  const { visible, hiddenCount } = truncatePathLeft(labels, maxChars);
  const text =
    (hiddenCount > 0 ? PATH_ELLIPSIS + PATH_SEPARATOR : '') +
    formatPath(visible);

  return (
    <span
      data-testid="node-path"
      title={formatPath(labels)}
      className={cn('block truncate text-xs text-muted-foreground', className)}
    >
      {text}
    </span>
  );
};
