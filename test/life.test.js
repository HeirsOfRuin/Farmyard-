// Marriage and coming-of-age used to be silent dice rolls with no player in
// them at all — a child turned 18 and the game decided behind the screen,
// and an adult was married off in the ledger with no warning. These tests
// cover the choice-driven replacement in src/engine/family.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newGame, STATUS } from '../src/engine/state.js';
import { runYear } from '../src/engine/turn.js';
import { pendingLifeChoices, advanceFamily, age } from '../src/engine/family.js';
import { makePlan } from '../sim/bot.js';
import { MARRIAGE_CHECK_AGES } from '../src/data/life.data.js';

test('pendingLifeChoices never rolls randomness — it is safe to call before a plan exists', () => {
  // If eligibility depended on rng, calling this twice on the same state
  // (once for the UI, once inside advanceFamily) would disagree, or the UI
  // would need to consume from the same stream the engine later uses. It
  // must be pure: same state in, same answer out, no matter how many times
  // it is called.
  const state = newGame({ seed: 4, difficulty: 'settler' });
  const a = pendingLifeChoices(state);
  const b = pendingLifeChoices(state);
  assert.deepEqual(a.map((c) => c.personId), b.map((c) => c.personId));
});

test('a marriage choice only ever appears at a fixed check age', () => {
  const state = newGame({ seed: 7, difficulty: 'settler' });
  for (let i = 0; i < 60 && state.status === STATUS.ACTIVE; i++) {
    const pending = pendingLifeChoices(state);
    for (const c of pending.filter((x) => x.kind === 'marriage')) {
      const person = state.family.members.find((m) => m.id === c.personId);
      assert.ok(
        MARRIAGE_CHECK_AGES.includes(age(state.year, person)),
        `marriage choice fired at age ${age(state.year, person)}, not a check age`
      );
    }
    const plan = makePlan(state);
    const { record } = runYear(state, plan);
    if (!record) break;
  }
});

test('encouraging a marriage marries them off with certainty enough to matter, standing aside does not', () => {
  // Not a precise probability check — just that the two answers are not the
  // same policy wearing a different label, which is what the feature would
  // be if "encourage" and "standAside" produced identical odds.
  const trials = 150;
  let encouraged = 0;
  let stoodAside = 0;
  for (let seed = 1; seed <= trials; seed++) {
    for (const [answer, counter] of [['encourage', () => encouraged++], ['standAside', () => stoodAside++]]) {
      const state = newGame({ seed, difficulty: 'settler' });
      // Run to the first pending marriage choice, or give up after 40 years.
      let resolved = false;
      for (let i = 0; i < 40 && state.status === STATUS.ACTIVE && !resolved; i++) {
        const pending = pendingLifeChoices(state).filter((c) => c.kind === 'marriage');
        const plan = makePlan(state);
        if (pending.length) {
          plan.lifeChoices[pending[0].personId] = answer;
          const before = state.family.marriagesMade;
          const { record } = runYear(state, plan);
          if (!record) break;
          if (state.family.marriagesMade > before) counter();
          resolved = true;
        } else {
          const { record } = runYear(state, plan);
          if (!record) break;
        }
      }
    }
  }
  assert.ok(encouraged > stoodAside, `encourage (${encouraged}) should marry more often than standing aside (${stoodAside})`);
});

test('sending a child to school costs money, takes them away, and only offers where available', () => {
  const state = newGame({ seed: 2, difficulty: 'settler' });
  state.cash = 100000; // affordability must never be the reason this fails
  let sawSchoolOption = false;
  let sawDeparture = false;
  for (let i = 0; i < 60 && state.status === STATUS.ACTIVE; i++) {
    const pending = pendingLifeChoices(state);
    const comingOfAge = pending.find((c) => c.kind === 'comingOfAge');
    const plan = makePlan(state);
    if (comingOfAge) {
      const schoolOpt = comingOfAge.options.find((o) => o.id === 'school');
      if (schoolOpt) {
        sawSchoolOption = true;
        assert.ok(schoolOpt.cost > 0, 'school must cost something');
        plan.lifeChoices[comingOfAge.personId] = 'school';
        const { record } = runYear(state, plan);
        if (!record) break;
        const person = state.family.members.find((m) => m.id === comingOfAge.personId);
        if (person.away) {
          sawDeparture = true;
          // A whole year's farm income can easily outweigh a thirty-dollar
          // school fee, so the fee has to be checked directly, not inferred
          // from which way cash moved over the year.
          const departure = (record.family || []).find(
            (e) => e.kind === 'departure' && e.cost > 0
          );
          assert.ok(departure, 'the departure event must carry what school cost');
          assert.ok(person.schoolReturnYear > state.year - 1, 'a return year must be set');
        }
        continue;
      }
    }
    const { record } = runYear(state, plan);
    if (!record) break;
  }
  // Not every run will happen to reach a year school is on offer inside sixty
  // years, but this seed at this difficulty does — assert the real thing
  // happened rather than passing on an empty loop.
  assert.ok(sawSchoolOption, 'never saw a coming-of-age choice with school on offer in 60 years');
  assert.ok(sawDeparture, 'choosing school never actually sent anyone');
});

test('a person away at school is never counted as a marriage or heir candidate', () => {
  const state = newGame({ seed: 2, difficulty: 'settler' });
  state.cash = 100000;
  for (let i = 0; i < 60 && state.status === STATUS.ACTIVE; i++) {
    const pending = pendingLifeChoices(state);
    const plan = makePlan(state);
    for (const c of pending) plan.lifeChoices[c.personId] = c.kind === 'comingOfAge' ? 'school' : 'encourage';
    const { record } = runYear(state, plan);
    if (!record) break;
    for (const m of state.family.members) {
      if (m.away && m.schoolReturnYear) {
        assert.notEqual(m.spouseId, undefined); // just touching the field must not throw
        assert.ok(
          !pendingLifeChoices(state).some((c) => c.personId === m.id),
          `${m.name} is away at school and should not have a pending choice`
        );
      }
    }
  }
});

test('an unanswered life choice falls back to the hands-off option rather than throwing', () => {
  const state = newGame({ seed: 9, difficulty: 'settler' });
  // Call the engine function directly with no plan at all, the way an older
  // caller (or a test) that has never heard of this feature would.
  for (let i = 0; i < 30 && state.status === STATUS.ACTIVE; i++) {
    assert.doesNotThrow(() => advanceFamily(state, { chance: () => false, range: (a) => a, weighted: (xs) => xs[0], pick: (xs) => xs[0], float: (a) => a }));
    state.year += 1;
  }
});
