// Where does the money come from, and where does it go?
//
// This is the instrument the plan called for and I did not build until the
// economy had already been rebalanced twice by guesswork. It reports each
// income source and each expense as a SHARE of gross, because shares are what
// survive a rebalance: "debt service is 12% of gross" stays meaningful when
// every price in the game changes, where "debt service is $340" does not.
//
// Two reasonable numbers in two different files multiply into a third that
// nobody wrote down. This is how you find that third number.

import { newGame, STATUS } from '../src/engine/state.js';
import { runYear } from '../src/engine/turn.js';
import { farmSummary } from '../src/engine/derive.js';
import { makePlan } from './bot.js';

export function profile({ runs = 40, difficulty = 'settler', background = 'ontario' } = {}) {
  // Era buckets, so a shift that only happens after 1950 is visible.
  const eras = [
    [1875, 1899, 'homestead 1875-99'],
    [1900, 1929, 'expansion 1900-29'],
    [1930, 1945, 'depression & war'],
    [1946, 1974, 'postwar 1946-74'],
    [1975, 2000, 'modern 1975-2000'],
  ];
  const acc = eras.map(([from, to, label]) => ({
    from, to, label, years: 0, gross: 0, income: {}, expenses: {}, acres: 0, broken: 0,
  }));

  for (let seed = 1; seed <= runs; seed++) {
    const st = newGame({ seed, difficulty, background });
    while (st.status === STATUS.ACTIVE) {
      const { record } = runYear(st, makePlan(st));
      if (!record) break;
      const bucket = acc.find((b) => record.year >= b.from && record.year <= b.to);
      if (!bucket) continue;
      const gross = record.income.total || 0;
      bucket.years++;
      bucket.gross += gross;
      const sum = record.closing.summary;
      bucket.acres += sum.acresOwned;
      bucket.broken += sum.acresBroken;
      for (const [k, v] of Object.entries(record.income)) {
        if (k === 'total' || !(v > 0)) continue;
        bucket.income[k] = (bucket.income[k] || 0) + v;
      }
      for (const [k, v] of Object.entries(record.expenses)) {
        if (k === 'total' || !(v > 0)) continue;
        bucket.expenses[k] = (bucket.expenses[k] || 0) + v;
      }
    }
  }

  const lines = [];
  lines.push('');
  lines.push(`Income and expense composition — ${runs} runs, ${difficulty}`);
  lines.push('Shares of gross income. Survives a rebalance; a dollar figure does not.');

  for (const b of acc) {
    if (!b.years) continue;
    lines.push('');
    lines.push(`${b.label}  (${b.years} farm-years, median acres ${Math.round(b.acres / b.years)}, ` +
      `broken ${Math.round(b.broken / b.years)})`);
    const share = (v) => `${((v / b.gross) * 100).toFixed(1)}%`.padStart(7);

    const inc = Object.entries(b.income).sort((a, c) => c[1] - a[1]);
    lines.push('  income   ' + inc.map(([k, v]) => `${k} ${share(v)}`).join('  '));
    const exp = Object.entries(b.expenses).sort((a, c) => c[1] - a[1]);
    lines.push('  expense  ' + exp.map(([k, v]) => `${k} ${share(v)}`).join('  '));
    const totalExp = Object.values(b.expenses).reduce((s, v) => s + v, 0);
    lines.push(`  expenses take ${((totalExp / b.gross) * 100).toFixed(1)}% of gross ` +
      `(${b.gross > totalExp ? 'margin' : 'LOSS'} ${(((b.gross - totalExp) / b.gross) * 100).toFixed(1)}%)`);
  }
  lines.push('');
  console.log(lines.join('\n'));
  return acc;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n, d) => {
    const m = process.argv.find((a) => a.startsWith(`--${n}=`));
    return m ? m.split('=')[1] : d;
  };
  profile({ runs: parseInt(arg('runs', '40'), 10), difficulty: arg('tier', 'settler') });
}
