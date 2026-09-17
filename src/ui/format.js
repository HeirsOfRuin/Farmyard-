// Formatting. Nominal dollars across 125 years span three orders of magnitude,
// so money is shown whole — cents are noise on a $180,000 combine and a
// distraction on a $14 plow.

export function money(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const v = Math.abs(n);
  // Whole dollars throughout. Cents are noise on a $180,000 combine and, on a
  // $5 repair bill, they are noise with a decimal point. Rounding also stops
  // a zero rendering as the faintly absurd "-$0.00".
  const rounded = Math.round(v);
  if (rounded === 0) return '$0';
  return `${n < 0 ? '-' : ''}$${rounded.toLocaleString('en-CA')}`;
}

export function qty(n, unit = '') {
  if (n == null || Number.isNaN(n)) return '—';
  const s = n >= 1000 ? Math.round(n).toLocaleString('en-CA')
    : n >= 10 ? n.toFixed(0)
    : n.toFixed(1);
  return unit ? `${s} ${unit}` : s;
}

export function pct(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
