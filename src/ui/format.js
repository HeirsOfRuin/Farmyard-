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

/**
 * A per-bushel (or per-unit) price, which money() cannot show: grain ran
 * six cents to a dollar and change a bushel across most of the century, and
 * money()'s whole-dollar rounding renders every one of those as the
 * indistinguishable, useless "$0" — which is not price visibility, it is
 * the absence of it. Anything already dollar-scale (sugar beets, potatoes
 * by the '80s) still reads as plain whole dollars.
 */
export function unitPrice(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const v = Math.abs(n);
  if (v >= 20) return money(n);
  return `${n < 0 ? '-' : ''}$${v.toFixed(2)}`;
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
