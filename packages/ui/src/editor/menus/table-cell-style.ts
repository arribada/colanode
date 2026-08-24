// ABOUTME: In-memory clipboard for a table cell's visual style so "Copy style"
// ABOUTME: on one cell can be pasted onto others — a lightweight format painter.

export interface CellStyle {
  backgroundColor: string | null;
  borderColor: string | null;
  borderStyle: string | null;
  align: string | null;
  valign: string | null;
}

let copied: CellStyle | null = null;

export const copyCellStyle = (style: CellStyle): void => {
  copied = style;
};

export const getCopiedCellStyle = (): CellStyle | null => copied;
