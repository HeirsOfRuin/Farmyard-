// The two mechanics the whole century rests on, each of which was silently
// broken in a way no existing test could see.
//
// Both are REGRESSION tests for bugs that cost the game its shape: the farm
// stopped being able to break land in 1890 and never grew again, and
// summerfallow — the practice prairie farms gave up a third of their acres to
// — bought them nothing at all. Neither threw, neither failed an invariant,
// and both looked like balance problems for as long as they went unmeasured.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newGame, STATUS } from '../src/engine/state.js';
import { runYear } from '../src/engine/turn.js';
import { breakableAcres, bestBreaker, rotationFactor } from '../src/engine/derive.js';
import { playerQuarters, maxBrokenAcres, croppableShare } from '../src/engine/land.js';
import { CROPS } from '../src/data/crops.data.js';
import { EQUIPMENT } from '../src/data/equipment.data.js';
import { makePlan } from '../sim/bot.js';

test('a farm that owns a faster tillage tool can still break sod', () => {
  const state = newGame({ seed: 4, difficulty: 'settler' });
  // A gang plow turns sod; a disc harrow works ground that is already broken
  // and out-works the plow on it. Asking "what is the best tiller" and using
  // the answer to break land stopped every farm in the game from breaking
  // another acre the day it bought a disc.
  state.equipment = [
    { type: 'horses', count: 2, condition: 1 },
    { type: 'gangPlow', count: 1, condition: 1 },
    { type: 'discHarrow', count: 1, condition: 1 },
  ];
  const breaker = bestBreaker(state);
  assert.ok(breaker, 'a farm with a gang plow in the shed has something that will break sod');
  assert.equal(breaker.id, 'gangPlow', `expected the plow, got ${breaker?.id}`);
  assert.ok(
    breakableAcres(state).acres > 0,
    'a farm with a plow and a disc must still be able to break land'
  );
});

test('every era has something that will turn new ground', () => {
  // Not one decade of the century may be a dead end. Before this, no implement
  // available after 1950 could break sod at all.
  for (const year of [1875, 1900, 1925, 1950, 1975, 2000]) {
    const breakers = Object.values(EQUIPMENT).filter(
      (e) => e.canBreakSod && year >= e.from && year <= e.to
    );
    assert.ok(breakers.length > 0, `nothing on sale in ${year} will break sod`);
  }
});

test('summerfallow counts as a break in the rotation', () => {
  // wheat, fallow, wheat is a ROTATION. Recorded only where a crop was
  // harvested, the fallow year vanished from the history and the engine read
  // the same quarter as continuous wheat — a permanent quarter off its yield,
  // in every era, including the 1990s.
  // The history is what GREW in past years, most recent last, and the crop
  // being judged is the one going in now. So the fallow belongs at the end.
  const cropped = { cropHistory: ['wheat', 'wheat', 'wheat'] };
  const rotated = { cropHistory: ['wheat', 'wheat', 'fallow'] };
  const wheat = CROPS.wheat;

  assert.ok(
    rotationFactor(rotated, wheat) > rotationFactor(cropped, wheat),
    'a fallow year between two wheat crops must be worth something'
  );
  assert.equal(
    rotationFactor(rotated, wheat), 1,
    'wheat on last year\'s summerfallow carries no continuous-cropping penalty'
  );
});

test('a fallow year is written into the history of the quarter that took it', () => {
  const state = newGame({ seed: 7, difficulty: 'settler' });
  let sawFallow = false;
  while (state.status === STATUS.ACTIVE && state.year < 1930) {
    runYear(state, makePlan(state));
    for (const q of playerQuarters(state.quarters)) {
      if ((q.cropHistory || []).includes('fallow')) sawFallow = true;
    }
  }
  assert.ok(
    sawFallow,
    'no quarter recorded a summerfallow year in fifty-five years of farming — ' +
      'the history is only being written where a crop came off'
  );
});

test('no quarter is ever entirely under crop', () => {
  // A quarter carries a yard, a road allowance, sloughs and a bush corner.
  const state = newGame({ seed: 9, difficulty: 'settler' });
  for (const q of state.quarters) {
    assert.ok(croppableShare(q) < 1, `${q.id} claims every acre is croppable`);
    assert.ok(maxBrokenAcres(q) < 160, `${q.id} allows all 160 acres to be broken`);
  }
});
