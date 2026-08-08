// ABOUTME: Shared number formatting for both the editor table (cell numberFormat)
// ABOUTME: and database number fields / summary rows — one source of truth.

export type NumberFormatKind =
  | 'plain'
  | 'number'
  | 'integer'
  | 'percent'
  | 'eur'
  | 'usd'
  | 'gbp';

export interface NumberFormatOption {
  value: NumberFormatKind;
  label: string;
  example: string;
}

// Menu-ready list (label + a tiny example) so both the editor cell menu and the
// database field settings can render the same choices.
export const NUMBER_FORMATS: NumberFormatOption[] = [
  { value: 'plain', label: 'Plain', example: '1234.5' },
  { value: 'number', label: 'Number', example: '1,234.5' },
  { value: 'integer', label: 'Integer', example: '1,235' },
  { value: 'percent', label: 'Percent', example: '45%' },
  { value: 'eur', label: 'Euro', example: '€1,234.50' },
  { value: 'usd', label: 'US Dollar', example: '$1,234.50' },
  { value: 'gbp', label: 'British Pound', example: '£1,234.50' },
];

const CURRENCY: Partial<Record<NumberFormatKind, string>> = {
  eur: 'EUR',
  usd: 'USD',
  gbp: 'GBP',
};

// Format a finite number per the chosen format. Percent appends "%" WITHOUT
// multiplying (Notion-style: the stored value IS the percentage, so 45 -> "45%",
// which also round-trips through parseNumberLoose that strips "%"). Currencies
// use the viewer's locale grouping. 'plain'/unknown returns the number as-is.
export const formatNumber = (
  value: number,
  format: NumberFormatKind | string | null | undefined
): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '';
  }
  switch (format) {
    case 'integer':
      return Math.round(value).toLocaleString(undefined, {
        maximumFractionDigits: 0,
      });
    case 'number':
      return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    case 'percent':
      return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
    case 'eur':
    case 'usd':
    case 'gbp':
      return value.toLocaleString(undefined, {
        style: 'currency',
        currency: CURRENCY[format],
      });
    default:
      return String(value);
  }
};

// A format is "numeric" (right-aligned, drives cell display) unless it's plain.
export const isNumericFormat = (
  format: NumberFormatKind | string | null | undefined
): boolean => format != null && format !== 'plain' && format !== '';
