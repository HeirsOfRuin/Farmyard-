// Invariants that must hold no matter what the player or the dice do.
//
// These are deliberately about things that CANNOT be true of a farm, not about
// specific balance numbers. Magnitude assertions ("wheat yields 16 bushels")
// get deleted on the first rebalance; assertions about impossibility survive it
// and keep catching the same class of bug.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newGame, STATUS, serialize, deserialize } from '../src/engine/state.js';
import { runYear } from '../src/engine/turn.js';
import { playerQuarters, distanceFromYard, distanceBetween } from '../src/engine/land.js';
import { netWorth, farmSummary, croppableAcres, timelinessFactor, fieldLogistics } from '../src/engine/derive.js';
import { makePlan } from '../sim/bot.js';
import { CROPS } from '../src/data/crops.data.js';

/** Play a game and check every year against the invariants as it goes. */
function playChecked(seed, difficulty = 'settler', background = 'ontario', maxYears = 130) {
  const state = newGame({ seed, difficulty, background });
  const prevBroken = new Map();
  let years = 0;

  while (state.status === STATUS.ACTIVE && years < maxYears) {
    const { record } = runYear(state, makePlan(state));
    if (!record) break;
    years++;

    for (const q of playerQuarters(state.quarters)) {
      // Land cannot un-break itself, and a quarter is 160 acres, always.
      assert.ok(q.brokenAcres >= 0, `${record.year} ${q.id}: negative broken acres (${q.brokenAcres})`);
      assert.ok(q.brokenAcres <= 160.01, `${record.year} ${q.id}: ${q.brokenAcres} acres broken on a 160-acre quarter`);
      const was = prevBroken.get(q.id);
      if (was != null) {
        assert.ok(q.brokenAcres >= was - 0.01,
          `${record.year} ${q.id}: broken acres fell from ${was} to ${q.brokenAcres}`);
      }
      prevBroken.set(q.id, q.brokenAcres);

      // Every number on a quarter must stay a number. NaN in fertility
      // silently makes every future harvest on that quarter NaN.
      for (const k of ['fertility', 'moisture', 'brokenAcres', 'seededAcres', 'weedPressure', 'yearsCropped']) {
        assert.ok(Number.isFinite(q[k]), `${record.year} ${q.id}: ${k} is ${q[k]}`);
      }
      assert.ok(q.fertility > 0 && q.fertility <= 1.1, `${record.year} ${q.id}: fertility ${q.fertility}`);
      assert.ok(q.weedPressure >= 0 && q.weedPressure <= 1,
        `${record.year} ${q.id}: weed pressure ${q.weedPressure}`);
      // Geography: an unset roadLag or roadImprovement would reach arithmetic
      // and produce NaN, which is how fertility was silently poisoned before.
      assert.ok(Number.isFinite(q.roadLag), `${record.year} ${q.id}: roadLag ${q.roadLag}`);
      assert.ok(Number.isFinite(q.roadImprovement),
        `${record.year} ${q.id}: roadImprovement ${q.roadImprovement}`);
      const d = distanceFromYard(state, q);
      assert.ok(Number.isFinite(d) && d >= 0, `${record.year} ${q.id}: distance ${d}`);
      const t = timelinessFactor(state, q);
      assert.ok(t > 0 && t <= 1, `${record.year} ${q.id}: timeliness ${t}`);
      assert.ok(CROPS[q.use], `${record.year} ${q.id}: unknown crop "${q.use}"`);
    }

    // Money must stay finite, and the granary must never go negative.
    assert.ok(Number.isFinite(state.cash), `${record.year}: cash is ${state.cash}`);
    assert.ok(Number.isFinite(netWorth(state)), `${record.year}: net worth is not finite`);
    for (const [crop, amount] of Object.entries(state.granary)) {
      assert.ok(amount >= -0.01, `${record.year}: negative ${crop} in the granary (${amount})`);
      assert.ok(Number.isFinite(amount), `${record.year}: ${crop} amount is ${amount}`);
    }
    for (const d of state.debts) {
      assert.ok(d.principal >= 0 && Number.isFinite(d.principal), `${record.year}: bad debt principal ${d.principal}`);
    }

    // Harvest can never exceed what was standing.
    for (const l of record.harvest.lines || []) {
      assert.ok(l.harvestedAcres <= l.acres + 0.01,
        `${record.year}: harvested ${l.harvestedAcres} of ${l.acres} acres`);
      assert.ok(Number.isFinite(l.amount), `${record.year}: harvest amount is ${l.amount}`);
      assert.ok(l.amount >= 0, `${record.year}: negative harvest`);
    }

    // The operator must be alive and must exist.
    if (state.status === STATUS.ACTIVE) {
      const op = state.family.members.find((m) => m.id === state.family.operatorId);
      assert.ok(op, `${record.year}: no operator`);
      assert.ok(!op.deathYear, `${record.year}: the operator is dead and still operating`);
    }
  }
  return { state, years };
}

test('a full run holds every invariant, on every tier', () => {
  for (const tier of ['homesteader', 'settler', 'sodbuster']) {
    const { years } = playChecked(11, tier);
    assert.ok(years > 0, `${tier}: no years played`);
  }
});

test('invariants hold across many seeds and every background', () => {
  for (const bg of ['ontario', 'mennonite', 'icelandic']) {
    for (let seed = 1; seed <= 6; seed++) playChecked(seed, 'settler', bg);
  }
});

test('the clock always advances, and a finished run refuses to run again', () => {
  const state = newGame({ seed: 5 });
  const y0 = state.year;
  runYear(state, {});
  assert.equal(state.year, y0 + 1, 'an empty plan must still advance the year');

  state.status = STATUS.RUINED;
  state.outcome = { year: state.year };
  const { record, refused } = runYear(state, {});
  assert.equal(record, null);
  assert.ok(refused, 'a finished run must refuse, not silently replay');
});

test('an empty plan is a valid year', () => {
  // A quiet year in which the player decides nothing must not throw, and must
  // not produce NaN anywhere. This is the most common year in the game.
  const state = newGame({ seed: 21 });
  for (let i = 0; i < 20; i++) {
    const { record } = runYear(state, {});
    if (!record) break;
    assert.ok(Number.isFinite(state.cash));
    assert.ok(Number.isFinite(record.closing.netWorth));
  }
});

test('saves round-trip exactly, mid-game', () => {
  const state = newGame({ seed: 33, difficulty: 'sodbuster', background: 'icelandic' });
  for (let i = 0; i < 15; i++) runYear(state, makePlan(state));
  const json = serialize(state);
  const back = deserialize(json);
  assert.equal(serialize(back), json, 'a save must reload to exactly the same game');
  assert.ok(back.difficultyDef && back.regionDef && back.backgroundDef, 'definitions must be reattached');
});

test('the same seed always produces the same run', () => {
  const play = () => {
    const s = newGame({ seed: 4242, difficulty: 'settler', background: 'mennonite' });
    for (let i = 0; i < 30 && s.status === STATUS.ACTIVE; i++) runYear(s, makePlan(s));
    return serialize(s);
  };
  assert.equal(play(), play(), 'determinism is what makes balance measurement possible');
});

test('distance is symmetric, zero at home, and never diagonal', () => {
  const state = newGame({ seed: 12 });
  const qs = state.quarters;
  for (const a of qs.slice(0, 8)) {
    for (const b of qs.slice(0, 8)) {
      const ab = distanceBetween(a, b);
      const ba = distanceBetween(b, a);
      assert.equal(ab, ba, `distance is not symmetric between ${a.id} and ${b.id}`);
      assert.ok(ab >= 0, 'distance is negative');
      if (a.id === b.id) assert.equal(ab, 0, 'a quarter is not zero miles from itself');
      // Manhattan: you travel the road allowances, so the distance is never
      // shorter than the straight line would be.
      const straight = Math.hypot(a.row - b.row, a.col - b.col) * 0.5;
      assert.ok(ab >= straight - 1e-9, `${a.id}->${b.id} took a diagonal shortcut`);
    }
  }
  const home = qs.find((q) => q.id === state.homeQuarterId);
  assert.equal(distanceFromYard(state, home), 0, 'the yard is not zero miles from itself');
});

test('a gathered farm out-works a scattered one, and less so as speed rises', () => {
  // The claim the whole geography layer makes. If it cannot be measured it is
  // decoration and should be cut rather than shipped.
  const build = (year, equip, spread) => {
    const st = newGame({ seed: 5 });
    st.year = year;
    for (const m of st.family.members) { m.birthYear = year - 35; m.deathYear = null; m.away = false; }
    const home = st.quarters[10];
    st.homeQuarterId = home.id;
    const sorted = [...st.quarters].sort((a, b) => distanceFromYard(st, a) - distanceFromYard(st, b));
    const pick = spread ? [sorted[0], ...sorted.slice(-3)] : sorted.slice(0, 4);
    for (const q of pick) { q.owner = 'player'; q.brokenAcres = 120; q.use = 'wheat'; }
    st.equipment = st.equipment.filter((e) => !['oxen', 'horses', 'dieselTractor', 'grainTruck', 'wagon'].includes(e.type));
    for (const t of equip) st.equipment.push({ type: t, count: 1, condition: 1, yearBought: year });
    return st;
  };

  const yieldOf = (st) => playerQuarters(st.quarters)
    .reduce((sum, q) => sum + timelinessFactor(st, q), 0) / playerQuarters(st.quarters).length;

  const slowTight = yieldOf(build(1885, ['oxen', 'wagon'], false));
  const slowSpread = yieldOf(build(1885, ['oxen', 'wagon'], true));
  const fastTight = yieldOf(build(1975, ['dieselTractor', 'grainTruck'], false));
  const fastSpread = yieldOf(build(1975, ['dieselTractor', 'grainTruck'], true));

  const slowPenalty = slowTight - slowSpread;
  const fastPenalty = fastTight - fastSpread;

  assert.ok(slowPenalty > 0.05,
    `scattering a horse-era farm should cost real yield, cost ${(slowPenalty * 100).toFixed(1)}%`);
  assert.ok(fastPenalty < slowPenalty / 3,
    `speed should largely erase the penalty: slow ${(slowPenalty * 100).toFixed(1)}%, ` +
      `fast ${(fastPenalty * 100).toFixed(1)}%`);
});

test('the planning figure and the resolving figure are the same number', () => {
  // The acres the player is told they can crop and the acres the engine
  // actually seeds must come from ONE function. Where the plan changes the
  // outfit mid-spring (a machine bought before seeding), the two legitimately
  // differ — so this compares only the years where nothing was bought, which
  // is where any gap would be pure drift.
  for (let seed = 1; seed <= 5; seed++) {
    const state = newGame({ seed });
    for (let i = 0; i < 25; i++) {
      const plan = makePlan(state);
      // Anything in the plan that changes the INPUTS changes the capacity
      // legitimately, and that is not drift. Three things do it:
      //   - buying or selling a machine before seeding
      //   - hiring a hand (an extra crew, which doubled capacity and read as 2x)
      //   - changing what a field grows, because capacity now depends on the
      //     road time to the fields actually in crop
      const changedFieldUse = Object.entries(plan.fieldUse || {}).some(([id, use]) => {
        const q = state.quarters.find((x) => x.id === id);
        return q && q.use !== use;
      });
      const changedOutfit =
        (plan.buyEquipment || []).length > 0 ||
        (plan.sellEquipment || []).length > 0 ||
        (plan.hiredHands ?? 0) !== (state.hiredHands ?? 0) ||
        changedFieldUse;
      const before = croppableAcres(state);
      const { record } = runYear(state, plan);
      if (!record) break;

      const possible = record.spring.acresPossible || 0;
      if (!changedOutfit) {
        assert.ok(Math.abs(possible - before.spring) < 0.01,
          `${record.year}: planning said ${before.spring.toFixed(2)} acres, ` +
            `the engine used ${possible.toFixed(2)} — the two derivations have drifted`);
      }
      assert.ok((record.spring.seeded || 0) <= possible + 0.01,
        `${record.year}: seeded more acres than were possible`);
    }
  }
});
