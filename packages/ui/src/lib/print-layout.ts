// ABOUTME: Pure layout decisions for the PDF export: how large an image prints, when a
// ABOUTME: table or image needs a page of its own, and the rows of the revision table.

// The printable area of A4 once the export's page margins are taken off (16 mm
// all round in portrait, 12 mm in landscape), in CSS pixels at 96 per inch.
const PX_PER_MM = 96 / 25.4;

export const PRINT_AREA = {
  portrait: {
    width: Math.floor(178 * PX_PER_MM),
    height: Math.floor(265 * PX_PER_MM),
  },
  landscape: {
    width: Math.floor(273 * PX_PER_MM),
    height: Math.floor(186 * PX_PER_MM),
  },
} as const;

// The editor column (max-w-3xl) in which authors size their images.
export const EDITOR_COLUMN_WIDTH = 768;

// Below half its pixel size, the text in a screenshot stops being readable on
// paper; past that point a page of its own is the better trade.
export const MIN_READABLE_SCALE = 0.5;

// An image printed in the flow may take at most this share of the page height,
// so its caption and the text around it still fit beside it.
const INLINE_HEIGHT_SHARE = 0.6;

export type ImagePlacement = 'inline' | 'landscape-page' | 'portrait-page';

export interface ImagePlan {
  placement: ImagePlacement;
  width: number;
  height: number;
}

const fitScale = (
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
): number => Math.min(1, maxWidth / width, maxHeight / height);

/**
 * How an image prints. It is never enlarged past its own pixels, which would
 * only blur it; it shrinks to fit the column, and when that would shrink it
 * below readable it moves to a page of its own -- landscape for a wide image,
 * portrait for a tall one -- whichever lets it print larger.
 */
export const planImagePrint = ({
  naturalWidth,
  naturalHeight,
  chosenWidth,
}: {
  naturalWidth: number;
  naturalHeight: number;
  /** The width the author gave the image in the editor, in editor pixels. */
  chosenWidth?: number | null;
}): ImagePlan => {
  if (!(naturalWidth > 0) || !(naturalHeight > 0)) {
    return { placement: 'inline', width: 0, height: 0 };
  }

  const portrait = PRINT_AREA.portrait;
  const inlineScale = fitScale(
    naturalWidth,
    naturalHeight,
    portrait.width,
    portrait.height * INLINE_HEIGHT_SHARE
  );

  if (inlineScale < MIN_READABLE_SCALE) {
    const isWide = naturalWidth >= naturalHeight;
    const area = isWide ? PRINT_AREA.landscape : portrait;
    const pageScale = fitScale(
      naturalWidth,
      naturalHeight,
      area.width,
      area.height
    );
    if (pageScale > inlineScale) {
      return {
        placement: isWide ? 'landscape-page' : 'portrait-page',
        width: Math.round(naturalWidth * pageScale),
        height: Math.round(naturalHeight * pageScale),
      };
    }
  }

  let width = naturalWidth * inlineScale;
  // An image the author deliberately made smaller in the editor stays smaller.
  if (chosenWidth && chosenWidth > 0) {
    width = Math.min(
      width,
      chosenWidth * (portrait.width / EDITOR_COLUMN_WIDTH)
    );
  }

  return {
    placement: 'inline',
    width: Math.round(width),
    height: Math.round(naturalHeight * (width / naturalWidth)),
  };
};

export type TablePlacement =
  'portrait' | 'portrait-compact' | 'landscape' | 'landscape-compact';

/**
 * Where a table prints, from its min-content width -- the narrowest it can be
 * with every cell's text wrapped -- at the normal and at the compact size. The
 * compact size is tried before a landscape page, which interrupts the reading.
 */
export const planTablePrint = ({
  minWidth,
  compactMinWidth,
}: {
  minWidth: number;
  compactMinWidth: number;
}): TablePlacement => {
  if (minWidth <= PRINT_AREA.portrait.width) {
    return 'portrait';
  }

  if (compactMinWidth <= PRINT_AREA.portrait.width) {
    return 'portrait-compact';
  }

  if (minWidth <= PRINT_AREA.landscape.width) {
    return 'landscape';
  }

  return 'landscape-compact';
};

export interface VersionLogEntry {
  version: string;
  at: string;
  by: string;
  note?: string | null;
}

export interface RevisionRow {
  version: string;
  date: string;
  author: string;
  changes: string;
}

export const DEFAULT_FIRST_VERSION = 'v0.1';

/**
 * The revision table, newest first. A page nobody has versioned yet still gets
 * a row -- its tag if it has one, otherwise v0.1 -- dated and signed by its
 * creation, so every exported document states a version.
 */
export const buildRevisionRows = ({
  versionLog,
  currentVersion,
  createdAt,
  createdBy,
  authorName,
  formatDate,
}: {
  versionLog: readonly VersionLogEntry[] | null | undefined;
  currentVersion: string | null | undefined;
  createdAt: string;
  createdBy: string;
  authorName: (userId: string) => string;
  formatDate: (iso: string) => string;
}): RevisionRow[] => {
  const log = [...(versionLog ?? [])];
  if (log.length === 0) {
    return [
      {
        version: currentVersion?.trim() || DEFAULT_FIRST_VERSION,
        date: formatDate(createdAt),
        author: authorName(createdBy),
        changes: 'Initial version',
      },
    ];
  }

  return log
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .map((entry) => ({
      version: entry.version,
      date: formatDate(entry.at),
      author: authorName(entry.by),
      changes: entry.note?.trim() || '—',
    }));
};

/**
 * The shareable link to a node. The desktop app runs from a file:// or app://
 * location, which is no address anyone can open, so it falls back to the wiki.
 */
export const buildDocumentLink = (
  origin: string | null | undefined,
  workspaceId: string,
  nodeId: string
): string => {
  const base =
    origin && /^https?:\/\//.test(origin)
      ? origin
      : 'https://docs.arribada.org';
  return `${base}/${workspaceId}/${nodeId}`;
};

export type RuleStyle = 'line' | 'thick' | 'dashed' | 'dotted';

/** Which of the divider's four styles a rule was drawn with, from its classes. */
export const ruleStyleFromClasses = (className: string): RuleStyle => {
  if (/(^|\s)border-dashed(\s|$)/.test(className)) {
    return 'dashed';
  }

  if (/(^|\s)border-dotted(\s|$)/.test(className)) {
    return 'dotted';
  }

  if (/(^|\s)h-1(\s|$)/.test(className)) {
    return 'thick';
  }

  return 'line';
};
