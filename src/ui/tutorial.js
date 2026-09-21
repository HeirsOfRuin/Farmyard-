// The walkthrough.
//
// This game has a homestead system, a capacity model, a rotation, livestock,
// credit, succession and a century of history in it, and none of that is
// guessable from a first look at the screen. Without a way in, the first ten
// years are spent finding out what the buttons do, and a player's impression
// of the game is formed entirely during the part where they are confused.
//
// TWO RULES shape it:
//
// 1. It teaches by DOING, not by reading. Every step that can be finished by
//    an action in the game is finished that way — `done(state)` watches for
//    the thing itself, so nobody is told "now break some sod" and then has to
//    press an unrelated "next" to prove they read it. Only the steps that are
//    pure orientation carry an acknowledge button.
//
// 2. It never blocks. No overlay, no forced order, nothing disabled. The card
//    sits at the top of the year and can be collapsed or dismissed for good.
//    A player who already knows what they are doing should be able to ignore
//    it completely, and a tutorial that has to be clicked through is a tax on
//    every replay.
//
// Steps are skipped when they are already true — resuming an 1890 farm does
// not start by explaining what unbroken sod is.

import { playerQuarters } from '../engine/land.js';
import { PROVE_UP_YEARS, PROVE_UP_ACRES } from '../engine/turn.js';

/**
 * `done(state)` — the step is finished, tick it and move on.
 * `ack: true`  — orientation only; the player says when they have read it.
 * `tab`        — where the thing being described lives, so the card can offer
 *                a button that goes straight there.
 */
export const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    ack: true,
    title: 'One quarter section, and three years to earn it',
    body: `You have filed on a quarter: 160 acres of prairie that has never been
      turned. The filing fee is paid. What you have now is sod, a little money and
      whatever you brought west.
      <br><br>
      The farm makes one move a year. You set what to do with the year, press
      <strong>Work the year</strong>, and spring, summer, harvest and winter all
      happen at once. Then you read what it cost you and do it again — a hundred
      and twenty-five times.`,
  },
  {
    id: 'map',
    tab: 'map',
    ack: true,
    title: 'The township is a grid, and it is not all yours',
    body: `Thirty-six sections, four quarters each. The hatched quarter with the
      dot is yours. Blue is the railway's land grant, which is for sale and never
      free. Pale quarters are open to file on. The rest is neighbours.
      <br><br>
      Distance is real here: every quarter is half a mile across and you travel the
      road allowances, not the diagonal. Land on the far side of the township costs
      you days you do not get back. <strong>Tap a quarter</strong> to see its soil,
      its road and how far out it is.`,
  },
  {
    // Breaking and working the year were two steps until a walkthrough of the
    // real page showed the second could never appear: sod is only broken once
    // a year has been worked, so by the time the first step ticked, the second
    // was already satisfied and got skipped. One step, one action.
    id: 'break',
    title: 'Nothing grows until the sod is broken',
    body: `Native prairie has to be turned once before it will take a crop, and it
      is the slowest work on the farm. Below, set how many acres to break — you will
      not get many the first year, because a walking plow behind oxen is about an
      acre a day. That is the point: the farm grows at the speed of the outfit you
      can afford.
      <br><br>
      Then press <strong>Work the year</strong>. Spring, summer, harvest and winter
      all run, the weather happens whether you like it or not, and the books settle.
      Afterwards open <strong>The books</strong> — every dollar in and out is listed
      there, and it is the honest record of whether this farm is working.`,
    done: (s) => s.year > s.startYear,
  },
  {
    id: 'capacity',
    title: 'Broken acres are not croppable acres',
    body: `This is the thing that decides how big a farm can get. Breaking land is
      one limit; <strong>getting a crop into it in the spring window</strong> is
      another, and harvesting it before the snow is a third.
      <br><br>
      The year tab shows <em>acres the outfit can crop</em> and what is limiting it
      — tillage, seeding or harvest. Owning land you cannot seed earns nothing and
      still pays tax. Fix the limit before you buy more ground.`,
    ack: true,
    from: (s) => s.year >= s.startYear + 1,
  },
  {
    id: 'buy',
    tab: 'market',
    title: 'Buy the implement that is holding you back',
    body: `<strong>Buy &amp; sell</strong> is implements, livestock, land and the
      grain you have in the bin. Buy the machine the year tab named as your limit —
      a better plow, a drill, a binder — and the ceiling moves.
      <br><br>
      Machinery is also the biggest way to lose a farm. It is bought with borrowed
      money, the payments come whether the crop does or not, and worn iron costs
      more every year you keep it.`,
    done: (s) => s.equipment.length > (s.startingEquipmentCount ?? 0),
    // Retired if it has not happened in five years. Steps are ordered, so one
    // waiting on an action the player never takes holds back everything behind
    // it — a farmer who never buys an implement would never reach the advice
    // about writing a will, which is the most useful sentence in here.
    expires: 5,
  },
  {
    id: 'feed',
    title: 'Stock have to be fed through a Manitoba winter',
    body: `Animals are the difference between a bad year and a ruinous one — they
      turn grass into money and they can be sold when nothing else can. But they eat
      from November to April, and the hay has to be grown this summer.
      <br><br>
      If the year tab warns that feed is short, put acres to <strong>hay</strong> or
      the stock go in the fall at whatever the buyer feels like paying.`,
    ack: true,
    from: (s) => Object.values(s.livestock || {}).some((n) => n > 0),
  },
  {
    id: 'proveUp',
    title: 'Prove up the homestead',
    body: `The quarter is not yours yet. ${PROVE_UP_YEARS} years living on it and
      ${PROVE_UP_ACRES} acres broken earns the patent, and then the land is the
      family's outright. Until then you are a squatter with paperwork.`,
    done: (s) => s.flags.homesteadProved,
    expires: 8,
  },
  {
    id: 'rotation',
    title: 'Summerfallow is not a wasted year',
    body: `Wheat after wheat after wheat mines the ground and seeds it with weeds.
      Before herbicide the only answer was to give a field a year off and work it
      black all summer — which is why prairie farms grew nothing on a third of their
      acres and still came out ahead.
      <br><br>
      Set a field to <strong>fallow</strong> and rotate which one takes the year.
      It banks moisture for next spring too.`,
    ack: true,
    from: (s) => s.year >= s.startYear + 4,
  },
  {
    id: 'family',
    tab: 'family',
    title: 'The farm outlives the farmer',
    body: `The <strong>Family</strong> tab is the other half of the game. People are
      born, marry, work, leave for the city and die. When the operator dies, the farm
      passes — and the estate is split between everyone with a claim.
      <br><br>
      That is how most farms were lost: not to drought, but to a division the farm
      could not pay for. Children who want to farm are your succession. Children who
      have gone to the city want their share in money.`,
    ack: true,
    from: (s) => s.year >= s.startYear + 6,
  },
  {
    id: 'will',
    tab: 'family',
    title: 'Write a will — it is the cheapest thing you will ever buy',
    body: `A will names the heir and keeps the land whole; without one the estate is
      settled against the farm and quarters go to pay the siblings out. It costs a
      few dollars at a solicitor in town.
      <br><br>
      Write one as soon as there is somebody to name, and write another when that
      changes. Nothing else in this game protects a century of work so cheaply.`,
    done: (s) => !!s.family.will,
    expires: 12,
  },
  {
    id: 'done',
    ack: true,
    title: 'That is the whole game',
    body: `Break ground, keep the outfit ahead of the acres, stay out of debt you
      cannot service in a bad year, and raise somebody who wants it.
      <br><br>
      Ahead of you: the boom of 1900, the war, the dust and the thirties, the
      combines, the interest shock of 1981, and the end of the Crow rate in 1995.
      <strong>1975 is the centennial</strong> — a hundred years in the same family,
      on the same land. Most lines do not make it.`,
    from: (s) => s.year >= s.startYear + 8,
  },
];

/**
 * The step to show now, or null when there is nothing to teach.
 *
 * Steps already satisfied are marked seen and skipped rather than shown —
 * a player resuming an established farm should not be told what sod is.
 */
export function activeStep(state) {
  const t = state.tutorial;
  if (!t || t.dismissed) return null;
  const seen = new Set(t.seen || []);

  for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
    const step = TUTORIAL_STEPS[i];
    if (seen.has(step.id)) continue;
    // Already true when we got here: nothing to teach, so record it quietly.
    if (step.done && step.done(state)) { seen.add(step.id); continue; }
    // Not relevant yet — and it holds the queue, because these are ordered.
    if (step.from && !step.from(state)) return null;
    // Waited long enough. The player is plainly not going to do this one.
    if (step.expires != null) {
      const since = t.firstShown?.[step.id];
      if (since != null && state.year - since >= step.expires) { seen.add(step.id); continue; }
    }
    return { ...step, number: i + 1, total: TUTORIAL_STEPS.length };
  }
  return null;
}

/** Note the year a step first came up, so `expires` has something to count from. */
export function markShown(state, id, year) {
  const t = state.tutorial;
  if (!t) return;
  t.firstShown = t.firstShown || {};
  if (t.firstShown[id] == null) t.firstShown[id] = year;
}

/** Fold anything now satisfied into `seen`. Called once a year, after the turn. */
export function reconcileTutorial(state) {
  const t = state.tutorial;
  if (!t || t.dismissed) return;
  const seen = new Set(t.seen || []);
  for (const step of TUTORIAL_STEPS) {
    if (seen.has(step.id)) continue;
    if (step.done && step.done(state)) { seen.add(step.id); continue; }
    const since = t.firstShown?.[step.id];
    if (step.expires != null && since != null && state.year - since >= step.expires) seen.add(step.id);
  }
  t.seen = [...seen];
}

export function ackStep(state, id) {
  const t = state.tutorial;
  if (!t) return;
  t.seen = [...new Set([...(t.seen || []), id])];
}

export function dismissTutorial(state) {
  if (state.tutorial) state.tutorial.dismissed = true;
}
