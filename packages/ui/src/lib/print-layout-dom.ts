// ABOUTME: Measures the assembled print document inside the print iframe itself and
// ABOUTME: applies the layout plans: image sizes and pages, compact or landscape tables.
import {
  columnPercentages,
  ImageFit,
  planImagePrint,
  planTablePrint,
  tableFitScale,
} from '@colanode/ui/lib/print-layout';

// Forced breaks and named (landscape) pages only take effect on blocks of the
// document flow, so a wide table or large image moves its whole top-level block.
const topLevelBlock = (el: Element): HTMLElement =>
  (el.closest('.print-body > *') as HTMLElement | null) ?? (el as HTMLElement);

const cellsOfRow = (row: Element): HTMLElement[] =>
  Array.from(row.children).filter(
    (cell): cell is HTMLElement =>
      cell.tagName === 'TH' || cell.tagName === 'TD'
  );

const colspanOf = (cell: HTMLElement): number =>
  Math.max(1, Number(cell.getAttribute('colspan') ?? 1) || 1);

/**
 * The editor sizes every cell with a pixel width of its own, and those widths
 * follow the markup into the print document. On paper the column is as wide as
 * the page allows, but the text kept wrapping at the screen width inside it --
 * a header reading "Recommended" broke across two lines in a column twice wide
 * enough for it -- and the table's measured minimum width was just the sum of
 * those pixel widths, whatever the cells actually held, which sent the wrong
 * tables to a landscape page.
 *
 * The widths are dropped and the author's proportions kept as percentages.
 */
const normalizeCellWidths = (table: HTMLElement): void => {
  const firstRow = table.querySelector('tr');
  const widths: number[] = [];
  if (firstRow) {
    for (const cell of cellsOfRow(firstRow)) {
      const sized = cell.querySelector<HTMLElement>('[style*="width"]');
      const width = sized ? parseFloat(sized.style.width) : NaN;
      const span = colspanOf(cell);
      for (let i = 0; i < span; i++) {
        widths.push(width > 0 ? width / span : NaN);
      }
    }
  }

  table
    .querySelectorAll<HTMLElement>('th [style*="width"], td [style*="width"]')
    .forEach((el) => {
      el.style.width = '100%';
      el.style.minWidth = '0';
      el.style.maxWidth = 'none';
      el.style.flexShrink = '';
    });

  const percentages = columnPercentages(widths);
  if (percentages.length === 0 || !firstRow) {
    return;
  }

  let index = 0;
  for (const cell of cellsOfRow(firstRow)) {
    const span = colspanOf(cell);
    let share = 0;
    for (let i = 0; i < span; i++) {
      share += percentages[index + i] ?? 0;
    }
    index += span;
    if (share > 0) {
      cell.style.width = `${share}%`;
    }
  }
};

// The narrowest the table can be with every cell's text wrapped.
const minContentWidth = (table: HTMLElement): number => {
  const previous = table.style.width;
  table.style.width = 'min-content';
  const width = table.getBoundingClientRect().width;
  table.style.width = previous;
  return width;
};

const layoutTables = (doc: Document) => {
  doc
    .querySelectorAll<HTMLTableElement>('.print-body table')
    .forEach((table) => {
      // A table nested in another one follows its parent.
      if (table.parentElement?.closest('table')) {
        return;
      }

      normalizeCellWidths(table);

      const minWidth = minContentWidth(table);
      table.classList.add('print-table-compact');
      const compactMinWidth = minContentWidth(table);
      table.classList.remove('print-table-compact');

      const placement = planTablePrint({ minWidth, compactMinWidth });
      if (
        placement === 'portrait-compact' ||
        placement === 'landscape-compact'
      ) {
        table.classList.add('print-table-compact');
      }
      if (placement === 'landscape' || placement === 'landscape-compact') {
        topLevelBlock(table).classList.add('print-landscape');
      }

      // Still wider than the page it was given: scale it down rather than let
      // the last columns hang off the paper.
      const scale = tableFitScale({
        minWidth: placement.endsWith('compact') ? compactMinWidth : minWidth,
        placement,
      });
      if (scale < 1) {
        table.style.zoom = String(scale);
      }
    });
};

const layoutImages = (doc: Document, fit: ImageFit) => {
  doc.querySelectorAll<HTMLImageElement>('.print-body img').forEach((img) => {
    // Icons, emoji, mentions and images inside a table keep their own size.
    if (img.closest('mention, .print-callout-icon, table')) {
      return;
    }

    const { naturalWidth, naturalHeight } = img;
    if (naturalWidth < 64 && naturalHeight < 64) {
      return;
    }

    const chosen = Number(img.getAttribute('data-print-width'));
    const plan = planImagePrint({
      naturalWidth,
      naturalHeight,
      chosenWidth: Number.isFinite(chosen) && chosen > 0 ? chosen : null,
      fit,
    });
    if (plan.width <= 0) {
      return;
    }

    img.classList.add('print-image');
    img.style.width = `${plan.width}px`;
    img.style.height = 'auto';
    img.style.maxWidth = '100%';

    // The editor's resize frame carried a screen width, and its `fit-content`
    // resolved against the flow rather than against the page the block ends up
    // on: a picture planned for a full landscape page printed at 231 mm of the
    // 273 mm available. The frame is given the whole width and the image is
    // centred inside it instead.
    let frame = img.parentElement;
    while (frame && frame !== topLevelBlock(img)) {
      frame.style.width = '100%';
      frame.style.maxWidth = '100%';
      frame.style.marginLeft = '0';
      frame.style.marginRight = '0';
      frame.style.alignItems = 'center';
      frame = frame.parentElement;
    }

    const block = topLevelBlock(img);
    block.classList.add('print-image-block');
    block.querySelectorAll<HTMLElement>('figcaption').forEach((caption) => {
      caption.style.width = `${plan.width}px`;
      caption.style.maxWidth = '100%';
      caption.style.marginLeft = 'auto';
      caption.style.marginRight = 'auto';
    });

    if (plan.placement === 'landscape-page') {
      block.classList.add('print-landscape', 'print-own-page');
    } else if (plan.placement === 'portrait-page') {
      block.classList.add('print-portrait-page', 'print-own-page');
    }
  });
};

/**
 * Runs once the print document has its styles, fonts and images: measures what
 * only real layout can tell -- how wide a table has to be, how many pixels an
 * image has -- and applies the decisions before the print dialog opens.
 */
export const applyPrintLayout = (
  doc: Document,
  options?: { imageFit?: ImageFit }
): void => {
  layoutTables(doc);
  layoutImages(doc, options?.imageFit ?? 'auto');
};
