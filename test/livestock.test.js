// The "short of winter feed" forced sale had three separate problems, found
// while chasing a player report of "the report says head were sold, but I
// never see fewer animals, and it happens every single first year too":
//
//  1. phaseWinter bred the flock AFTER checking feed and culling for a
//     shortfall, so a fast breeder (poultry, breedRate 2.2) regrew most or
//     all of the loss in the same year's processing, before the player
//     ever saw a lower head count. The sale was real and the cash was
//     real; its effect on the herd was not, which is why it never showed.
//  2. A new game's granary starts at {}, and the very first winter's feed
//     check runs before a single harvest could have filled it — the sale
//     fired unconditionally in year one regardless of how well the farm
//     was played.
//  3. Grain marketing reserves feed against the head count AT HARVEST,
//     before phaseWinter's breeding grows the herd — so a reservation
//     correct for today's flock still fell short of a flock that nearly
//     doubled by winter, recreating problem #2 in later years too.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newGame } from '../src/engine/state.js';
import { runYear } from '../src/engine/turn.js';

test('a feed-shortfall cull actually reduces the herd, not just the ledger', () => {
  // Same founder, same seed, only the granary differs: one genuinely short
  // of feed, one amply supplied. If the cull is real and lasting, the short
  // run should end the year with noticeably fewer chickens than the ample
  // one — not converge back to the same number via breeding.
  function trial(ample) {
    const state = newGame({ seed: 1, difficulty: 'settler', background: 'ontario' });
    state.granary = ample ? { hay: 500, oats: 500 } : {};
    const { record } = runYear(state, {});
    return { state, record };
  }
  const short = trial(false);
  const ample = trial(true);
  assert.ok(
    short.state.livestock.chickens < ample.state.livestock.chickens,
    `a genuine shortfall (${short.state.livestock.chickens} chickens) should leave fewer birds than an ample year (${ample.state.livestock.chickens})`
  );
  assert.ok(short.record.notes.some((n) => n.includes('Short of winter feed')));
});

test('a freshly founded farm does not face a feed shortfall in its very first year', () => {
  // Worst case: an empty plan, nothing seeded, nothing bought — exactly what
  // a first turn looks like before a player has done anything at all. The
  // starting granary reserve (state.js) should carry every background's
  // starting animals through that first winter without a forced sale.
  for (const background of ['ontario', 'mennonite', 'icelandic']) {
    const state = newGame({ seed: 1, difficulty: 'settler', background });
    const { record } = runYear(state, {});
    const shortfall = record.notes.find((n) => n.includes('Short of winter feed'));
    assert.equal(shortfall, undefined, `${background}: unexpected first-year shortfall — ${shortfall}`);
  }
});

test('a background\'s single starting breeding animal survives its first winter', () => {
  // The Icelandic background starts with exactly one dairy cow. A cow does
  // not calve from a herd of one in its first season (breedRate is far
  // below 1), so it enters the feed check at the same count it started
  // with — the case most exposed to Math.ceil rounding a small shortfall
  // ratio up to "sell the only one."
  const state = newGame({ seed: 1, difficulty: 'settler', background: 'icelandic' });
  runYear(state, {});
  assert.ok((state.livestock.dairyCow || 0) >= 1, 'the founder\'s only cow should not be wiped out in year one');
});
