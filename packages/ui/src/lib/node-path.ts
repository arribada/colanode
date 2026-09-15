// ABOUTME: Shortens an ancestor path from the left for a one-line hint, so the
// ABOUTME: immediate parent -- the part that tells two same-named pages apart -- stays.

export const PATH_SEPARATOR = ' › ';
export const PATH_ELLIPSIS = '…';

export type PathSegmentLike = {
  name: string | null;
};

export const segmentLabel = (segment: PathSegmentLike): string => {
  const name = segment.name?.trim();
  return name && name.length > 0 ? name : 'Untitled';
};

export const formatPath = (labels: string[]): string =>
  labels.join(PATH_SEPARATOR);

// Code points, not UTF-16 units: an emoji in a space name is one character.
const width = (text: string): number => [...text].length;

export type TruncatedPath = {
  visible: string[];
  hiddenCount: number;
};

/**
 * Keeps as many trailing labels as fit in `maxChars`, counting the separators
 * and the leading ellipsis. The last label always stays, even when it alone is
 * too long -- it is the one a reader needs, and CSS clips what overflows.
 */
export const truncatePathLeft = (
  labels: string[],
  maxChars: number
): TruncatedPath => {
  if (labels.length === 0) {
    return { visible: [], hiddenCount: 0 };
  }

  if (width(formatPath(labels)) <= maxChars) {
    return { visible: labels, hiddenCount: 0 };
  }

  const prefix = width(PATH_ELLIPSIS + PATH_SEPARATOR);
  const visible = [labels[labels.length - 1] as string];
  let used = prefix + width(visible[0] as string);

  for (let index = labels.length - 2; index >= 0; index -= 1) {
    const label = labels[index] as string;
    const next = used + width(label) + width(PATH_SEPARATOR);
    // The whole path did not fit, so at least the first label stays hidden.
    if (next > maxChars || index === 0) {
      break;
    }
    visible.unshift(label);
    used = next;
  }

  return { visible, hiddenCount: labels.length - visible.length };
};

export type BreadcrumbSplit<T> = {
  head: T[];
  hidden: T[];
  tail: T[];
};

/**
 * How a page's breadcrumb is laid out. It shows every ancestor while they fit;
 * only when they overflow does it keep the space, the parent and the page, and
 * fold the rest behind "More".
 */
export const splitBreadcrumb = <T>(
  nodes: T[],
  overflowing: boolean
): BreadcrumbSplit<T> => {
  if (!overflowing || nodes.length <= 3) {
    return { head: nodes, hidden: [], tail: [] };
  }

  return {
    head: nodes.slice(0, 1),
    hidden: nodes.slice(1, -2),
    tail: nodes.slice(-2),
  };
};
