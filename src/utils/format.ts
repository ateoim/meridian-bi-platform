export function formatAud(value: number, compact = false): string {
  if (!Number.isFinite(value)) return '$0';
  if (compact) {
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1_000_000) {
      return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
    }
    if (abs >= 1_000) {
      return `${sign}$${(abs / 1_000).toFixed(1)}k`;
    }
    return `${sign}$${Math.round(abs).toLocaleString('en-AU')}`;
  }
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPct(value: number, decimals = 1, showSign = false): string {
  if (!Number.isFinite(value)) return '0.0%';
  const prefix = showSign && value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-AU').format(value);
}

export function formatMonthShort(ym: string): string {
  const [year, month] = ym.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const idx = Number(month) - 1;
  if (idx < 0 || idx > 11) return ym;
  return `${names[idx]} ${year.slice(2)}`;
}

export function toCsv(columns: string[], rows: (string | number | null)[][]): string {
  const escapeCell = (cell: string | number | null): string => {
    if (cell === null || cell === undefined) return '';
    const str = String(cell);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const header = columns.map(escapeCell).join(',');
  const body = rows.map((row) => row.map(escapeCell).join(',')).join('\n');
  return body ? `${header}\n${body}` : header;
}
