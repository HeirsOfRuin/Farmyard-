// The historical crises must actually be dangerous.
//
// A farm carrying debt into 1929 or into 1981 should be in real trouble, and a
// farm carrying none should not be. That distinction is the whole mechanism of
// how farms were actually lost, and it is easy to get backwards: an earlier
// version tested ruin on net worth, which made anybody who owned land
// invincible and meant the Depression and the interest shock cost nobody
// anything.
//
// These assert a DIRECTION and a RELATIVE size, not a magnitude. "The indebted
// farm does much worse than the debt-free one" survives rebalancing; "net worth
// falls to $4,210" does not.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newGame, STATUS } from '../src/engine/state.js';
import { interestRate, freightRate } from '../src/data/prices.data.js';
import { serviceDebt } from '../src/engine/finance.js';
import { runYear } from '../src/engine/turn.js';
import { netWorth, totalDebt } from '../src/engine/derive.js';
import { makePlan } from '../sim/bot.js';
import { playerQuarters } from '../src/engine/land.js';

/** Fast-forward a game to a year, then optionally load it with debt. */
function farmAt(year, { seed = 3, debtFraction = 0 } = {}) {
  const state = newGame({ seed });
  while (state.status === STATUS.ACTIVE && state.year < year) {
    runYear(state, makePlan(state));
  }
  if (state.status !== STATUS.ACTIVE) return null;

  // Clear whatever it happened to owe, then set the debt we want to test.
  state.debts = [];
  if (debtFraction > 0) {
    const principal = Math.max(200, netWorth(state) * debtFraction);
    // A farm that borrowed half its net worth SPENT it — on land, on a
    // combine, on a barn. Leaving the cash in the account as well builds a
    // farm that is heavily mortgaged and flush at the same time, which no
    // shock can touch: both sides of the 1981 test came through at 22.75%
    // prime without a single year of distress, and the test could not tell
    // that from the shock being harmless.
    state.cash = Math.min(state.cash, principal * 0.05);
    state.debts.push({
      id: 'test1', source: 'bank', sourceName: 'Mortgage',
      principal, original: principal, rate: 0.09,
      termYears: 20, yearTaken: state.year,
    });
  }
  return state;
}

/** Run a farm through a span and report how it came out. */
function runThrough(state, untilYear) {
  const start = { worth: netWorth(state), acres: playerQuarters(state.quarters).length };
  let distressYears = 0;
  while (state.status === STATUS.ACTIVE && state.year <= untilYear) {
    const { record } = runYear(state, makePlan(state));
    if (!record) break;
    if (record.settle?.solvency?.insolvent) distressYears++;
  }
  // A farm that was foreclosed in 1932 stops counting, so on a raw tally the
  // farm that was RUINED can score fewer distress years than the one that
  // limped through all ten — which is exactly backwards. Losing the place is
  // distress in every year that remained.
  if (state.status !== STATUS.ACTIVE) {
    distressYears += Math.max(0, untilYear - state.year + 1);
  }
  return {
    survived: state.status === STATUS.ACTIVE,
    status: state.status,
    distressYears,
    worthChange: netWorth(state) - start.worth,
    acresLost: start.acres - playerQuarters(state.quarters).length,
    startWorth: start.worth,
  };
}

test('the Depression is dangerous to a farm carrying debt, and survivable without', () => {
  const geared = farmAt(1929, { debtFraction: 0.5 });
  const clear = farmAt(1929, { debtFraction: 0 });
  if (!geared || !clear) return; // that seed did not reach 1929; nothing to assert

  const gearedOut = runThrough(geared, 1939);
  const clearOut = runThrough(clear, 1939);

  assert.ok(
    gearedOut.distressYears > clearOut.distressYears,
    `the geared farm should spend more years in distress through the thirties ` +
      `(geared ${gearedOut.distressYears}, clear ${clearOut.distressYears})`
  );
});

test('the 1981 interest shock is dangerous to a farm carrying debt', () => {
  const geared = farmAt(1979, { debtFraction: 0.5 });
  const clear = farmAt(1979, { debtFraction: 0 });
  if (!geared || !clear) return;

  const gearedOut = runThrough(geared, 1987);
  const clearOut = runThrough(clear, 1987);

  assert.ok(
    gearedOut.distressYears > clearOut.distressYears,
    `prime at 22.75% must hurt a mortgaged farm more than a clear one ` +
      `(geared ${gearedOut.distressYears}, clear ${clearOut.distressYears})`
  );
});

test('interest rates actually spike in 1981 and freight actually doubles in 1995', () => {
  // These are the two sharpest edges in the data, and a smoothing change to
  // the interpolation would quietly flatten them without failing anything else.
  assert.ok(interestRate(1981) > interestRate(1975) * 1.9,
    `1981 interest (${interestRate(1981)}) should be far above 1975 (${interestRate(1975)})`);
  assert.ok(freightRate(1995) > freightRate(1994) * 1.6,
    `the Crow rate ending must roughly double freight (1994 ${freightRate(1994)}, 1995 ${freightRate(1995)})`);
});

test('a debt that cannot be serviced grows at roughly the interest rate', () => {
  // Not faster. An earlier version added unpaid PRINCIPAL back onto the
  // principal and a one-year note doubled every year.
  const state = newGame({ seed: 2 });
  state.cash = 0;
  state.debts = [{
    id: 'x', source: 'bank', sourceName: 'Note',
    principal: 1000, original: 1000, rate: 0.10, termYears: 1, yearTaken: state.year,
  }];
  for (let i = 0; i < 4; i++) {
    state.cash = 0;
    serviceDebt(state);
    state.year++;
  }
  const grown = state.debts[0].principal;
  assert.ok(grown > 1000, 'unpaid interest must capitalise');
  assert.ok(grown < 1000 * Math.pow(1.2, 4),
    `debt grew to ${grown.toFixed(0)} in four years — far faster than the interest rate allows`);
});
