// Grain marketing used to be an entirely silent decision: the engine sold
// the surplus and held the seed and feed with no way for a player to see the
// price or say "not this year" to a crop, even after a bin was bought — and
// no way to buy a bin either, since the market panel's equipment filter
// never admitted the storage category. These tests cover the player-facing
// piece: plan.grainStance, an overlay on the engine's own defaultSaleOrders
// rather than a replacement for it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newGame } from '../src/engine/state.js';
import { runYear } from '../src/engine/turn.js';

function soldAmount(record, cropId) {
  const line = (record.market.grain || []).find((l) => l.cropId === cropId);
  return line ? line.amount : 0;
}

test('an unmentioned crop sells exactly what it would have with no grainStance at all', () => {
  const base = newGame({ seed: 5, difficulty: 'settler', background: 'ontario' });
  base.granary = { wheat: 500, oats: 300 };
  const { record: baseline } = runYear(base, {});

  const held = newGame({ seed: 5, difficulty: 'settler', background: 'ontario' });
  held.granary = { wheat: 500, oats: 300 };
  const { record: withHold } = runYear(held, { grainStance: { wheat: 'hold' } });

  // Oats was never mentioned in the stance — a plan that only says "hold the
  // wheat" must not silently sell zero oats it never spoke about.
  assert.equal(soldAmount(withHold, 'oats'), soldAmount(baseline, 'oats'));
});

test('"hold" keeps a crop off the market this year', () => {
  const state = newGame({ seed: 5, difficulty: 'settler', background: 'ontario' });
  state.granary = { wheat: 500, oats: 300 };
  const { record } = runYear(state, { grainStance: { wheat: 'hold' } });
  assert.equal(soldAmount(record, 'wheat'), 0);
  // Held is not the same as protected from feed use — a crop kept off the
  // market can still be drawn on to winter the stock, same as any other
  // grain in the bin.
  assert.ok(state.granary.wheat > 0, 'wheat should still be sitting in the granary, not vanished');
});

test('"sellAll" sells the whole surplus regardless of the engine\'s own bad-year judgement', () => {
  const state = newGame({ seed: 11, difficulty: 'settler', background: 'ontario' });
  state.granary = { wheat: 800, oats: 100 };
  const { record } = runYear(state, { grainStance: { wheat: 'sellAll' } });
  // Nothing of the wheat crop is left sitting unsold, seed reserve aside —
  // and this state has no seed acres in the ground this year (idle fields),
  // so the reserve is zero and the whole 800 should clear.
  assert.equal(state.granary.wheat, 0);
  assert.equal(soldAmount(record, 'wheat'), 800);
});

test('an absent grainStance reproduces the old, stance-free behaviour exactly', () => {
  const withField = newGame({ seed: 5, difficulty: 'settler', background: 'ontario' });
  withField.granary = { wheat: 500, oats: 300 };
  const { record: a } = runYear(withField, { grainStance: {} });

  const withoutField = newGame({ seed: 5, difficulty: 'settler', background: 'ontario' });
  withoutField.granary = { wheat: 500, oats: 300 };
  const { record: b } = runYear(withoutField, {});

  assert.equal(soldAmount(a, 'wheat'), soldAmount(b, 'wheat'));
  assert.equal(soldAmount(a, 'oats'), soldAmount(b, 'oats'));
});
