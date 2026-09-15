// ABOUTME: Measures the assembled print document inside the print iframe itself and
// ABOUTME: applies the layout plans: image sizes and pages, compact or landscape tables.
import { planImagePrint, planTablePrint } from '@colanode/ui/lib/print-layout';

// Forced breaks and named (landscape) pages only take effect on blocks of the
// document flow, so a wide table or large image moves its whole top-level block.
const topLevelBlock = (el: Element): HTMLElement =>
  (el.closest('.print-body > *') as HTMLElement | null) ?? (el as HTMLElement);

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
    });
};

const layoutImages = (doc: Document) => {
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
    });
    if (plan.width <= 0) {
      return;
    }

    img.classList.add('print-image');
    img.style.width = `${plan.width}px`;
    img.style.height = 'auto';
    img.style.maxWidth = '100%';

    // The editor's resize frame carried a screen width; centre it on the image.
    const frame = img.parentElement;
    if (frame && frame !== topLevelBlock(img)) {
      frame.style.width = 'fit-content';
      frame.style.maxWidth = '100%';
      frame.style.marginLeft = 'auto';
      frame.style.marginRight = 'auto';
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
export const applyPrintLayout = (doc: Document): void => {
  layoutTables(doc);
  layoutImages(doc);
};
