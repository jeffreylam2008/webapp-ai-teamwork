/**
 * Format a numeric value as currency (e.g. $1,234.56).
 */
export function formatCurrency(value: number | string | null | undefined): string {
  const num =
    typeof value === 'number'
      ? value
      : parseFloat(String(value ?? '').replace(/,/g, '')) || 0;
  if (!Number.isFinite(num)) return '$0.00';
  return `$${num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
