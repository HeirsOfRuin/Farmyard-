// The controller: holds the draft plan, renders, and hands the year to the engine.
//
// The division of labour matters. This file decides what is on screen and what
// the player has provisionally decided; the ENGINE decides what is true. No
// farm number is computed here — every figure comes from derive.js, so what the
// player is shown and what the year resolves are the same arithmetic.

import {
  newGame, STATUS, saveToStorage, loadFromStorage, clearStorage, serialize, deserialize,
} from '../engine/state.js';
import { runYear } from '../engine/turn.js';
import { farmSummary, netWorth, totalDebt, croppableAcres, breakableAcres } from '../engine/derive.js';
import { playerQuarters, legalDescription, quarterById, maxBrokenAcres } from '../engine/land.js';
import { operator, fullName, age, pendingLifeChoices } from '../engine/family.js';
import { historyFor } from '../data/history.data.js';
import { CROPS } from '../data/crops.data.js';
import { BACKGROUND_LIST } from '../data/names.data.js';
import { DIFFICULTY_LIST } from '../data/difficulty.data.js';
import { CENTENNIAL_YEAR, LAST_YEAR, FIRST_YEAR } from '../data/prices.data.js';
import { renderMap, renderLegend, renderTown, esc } from './map.js';
import { renderAttention, renderPlan, renderMarket, renderBooks, renderFamily } from './panels.js';
import { money, qty, unitPrice } from './format.js';
import {
  activeStep, ackStep, dismissTutorial, reconcileTutorial, markShown,
} from './tutorial.js';

const app = document.getElementById('app');

let state = null;
let draft = emptyDraft();
let tab = 'plan';
let coachCollapsed = false;
let lastCoachStep = null;

// ---------------------------------------------------------------------------
// One layout or the other, decided by how much room there is
// ---------------------------------------------------------------------------
//
// On a desktop the map has its own column beside the ledger, which is the
// whole presentation: map and books side by side. A phone has room for one of
// them at a time, so there the map becomes a TAB.
//
// The alternative was to put both on screen and let the map scroll away above
// the tabs. On a 125-turn game that costs a scroll back to the top on every
// single tab switch, which over a full playthrough is the difference between
// a game you finish and one you put down.
const NARROW = '(max-width: 1000px)';
const narrowQuery = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia(NARROW) : null;
function narrow() { return !!narrowQuery?.matches; }

const TAB_LABELS = {
  map: 'Map', plan: 'The year', market: 'Buy & sell',
  books: 'The books', family: 'Family',
};
function tabsFor() {
  const rest = ['plan', 'market', 'books', 'family'];
  return narrow() ? ['map', ...rest] : rest;
}
let mapMode = 'use';
let selectedQuarter = null;
let modal = null;
let setup = { difficulty: 'settler', background: 'ontario', walkthrough: true };

function emptyDraft() {
  return {
    fieldUse: {}, breakAcres: {}, buyEquipment: [], sellEquipment: [],
    buyLivestock: {}, sellLivestock: {}, buyLand: [], adoptTech: [],
    loans: [], improvements: [], fileHomestead: null, writeWill: null,
    roadWorks: [], takeUpPrograms: [],
    choiceResponse: {}, lifeChoices: {}, familyStance: {}, grainStance: {},
    livestockCap: {},
  };
}

/**
 * The draft a new year starts from.
 *
 * Crops carry forward on their own — the engine keeps each quarter's use until
 * it is changed — but breaking does not, and a player who simply presses "Work
 * the year" should get the obvious year's work rather than a farm that sits
 * still. So the season's breaking is pre-filled with what the outfit can
 * actually turn, taken from the same function the engine will use.
 */
function freshDraft(s) {
  const d = emptyDraft();
  if (!s) return d;
  const capacity = breakableAcres(s);
  let left = capacity.acres;
  if (left < 1) return defaultIdleFields(s, d);
  // Finish a quarter before starting the next; a half-broken field everywhere
  // is nobody's idea of a plan.
  for (const q of playerQuarters(s.quarters)) {
    if (left < 1) break;
    // The true ceiling, not the bare 160 acres — a quarter carries a yard,
    // a road allowance, sloughs that never drain, and a stone pile, so
    // maxBrokenAcres(q) can sit well under 160 depending on soil. Using the
    // raw acreage here kept suggesting a few more acres of breaking every
    // year on ground that was already at its real limit, which the engine
    // would then quietly refuse — the plan asked for sod that was not there.
    const room = maxBrokenAcres(q) - q.brokenAcres;
    if (room < 1) continue;
    const take = Math.min(room, left);
    d.breakAcres[q.id] = Math.round(take);
    left -= take;
  }
  return defaultIdleFields(s, d);
}

/**
 * Ground that has been broken but has nothing assigned to it grows nothing.
 * Newly broken acres default to wheat, because a player who breaks land has
 * plainly decided to farm it and should not have to discover separately that
 * breaking and sowing are two different instructions.
 */
function defaultIdleFields(s, d) {
  for (const q of playerQuarters(s.quarters)) {
    if (q.brokenAcres > 1 && (q.use === 'idle' || !q.use) && !d.fieldUse[q.id]) {
      d.fieldUse[q.id] = 'wheat';
    }
  }
  return d;
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function renderSetup() {
  const saved = loadFromStorage();
  app.innerHTML = `
    <div class="center">
      <h1>Centennial Farm</h1>
      <p class="lede">Manitoba, 1875. A quarter section of unbroken prairie, a ten dollar
        filing fee, and three years to prove it up. One hundred and twenty-five years, four
        or five generations, and one question: is the land still in the family in 1975?</p>

      ${saved.ok ? `
        <section style="margin-bottom:26px">
          <h3 style="margin-bottom:8px">Carry on</h3>
          <button class="btn primary" data-act="resume">
            Resume — ${saved.state.family.surname}s of ${esc(saved.state.townshipLabel)}, ${saved.state.year}
          </button>
          <button class="btn sm" data-act="discard" style="margin-left:8px">discard that game</button>
        </section>` : ''}

      <h3 style="margin-bottom:8px">Who came west</h3>
      <div class="optgrid">
        ${BACKGROUND_LIST.map((b) => `
          <button class="opt" data-bg="${b.id}" aria-pressed="${setup.background === b.id}">
            <div class="lab">${esc(b.name)}</div>
            <div class="det">${esc(b.blurb)}</div>
            <div class="det" style="margin-top:5px"><strong>${esc(b.note)}</strong></div>
            <div class="det">Starts with ${money(b.startingCapital)}</div>
          </button>`).join('')}
      </div>

      <h3 style="margin-bottom:8px">How hard</h3>
      <div class="optgrid">
        ${DIFFICULTY_LIST.map((d) => `
          <button class="opt" data-diff="${d.id}" aria-pressed="${setup.difficulty === d.id}">
            <div class="lab">${esc(d.name)}</div>
            <div class="det">${esc(d.blurb)}</div>
          </button>`).join('')}
      </div>

      <label class="walkthrough-opt">
        <input type="checkbox" id="setup-walkthrough" data-setup="walkthrough" ${setup.walkthrough ? 'checked' : ''} />
        <span>Show the walkthrough &mdash; twelve short notes across the first years,
          each one waiting until you have done the thing before it. You can switch it
          off at any point.</span>
      </label>

      <button class="btn primary wide" data-act="start">File on a homestead</button>
      <p class="det" style="font-size:.78rem;color:var(--ink-3);margin-top:14px">
        The game saves itself in this browser after every year.</p>
    </div>`;
}

function renderGame() {
  const sum = farmSummary(state);
  const op = operator(state);
  const worth = netWorth(state);
  const debt = totalDebt(state);

  app.innerHTML = `
    <div class="topbar">
      <div class="brand">
        <span class="year">${state.year}</span>
        <span class="place">${esc(state.family.surname)}s of ${esc(state.townshipLabel)}
          &middot; ${esc(state.regionDef.name)}
          ${state.flags.centennialEarned ? '&middot; <span class="pill good">Century Farm</span>' : ''}</span>
      </div>
      <div class="stat"><span class="k">Operator</span><span class="v" style="font-family:var(--sans)">${
        op ? `${esc(fullName(op))}, ${age(state.year, op)}` : '—'}</span></div>
      <div class="stat"><span class="k">Acres</span><span class="v">${sum.acresOwned.toLocaleString()}</span></div>
      <div class="stat"><span class="k">Broken</span><span class="v">${Math.round(sum.acresBroken).toLocaleString()}</span></div>
      <div class="stat"><span class="k">Cash</span><span class="v ${state.cash < 0 ? 'neg' : ''}">${money(state.cash)}</span></div>
      <div class="stat"><span class="k">Debt</span><span class="v ${debt > 0 ? 'neg' : ''}">${money(debt)}</span></div>
      <div class="stat"><span class="k">Net worth</span><span class="v ${worth < 0 ? 'neg' : 'pos'}">${money(worth)}</span></div>
      <button class="btn sm" data-act="export" title="Save this game to a file">save to file</button>
      <button class="btn sm" data-act="import" title="Load a game from a file">load</button>
      <button class="btn sm" data-act="theme" title="Light or dark">◐</button>
    </div>

    <div class="main">
      ${narrow() ? '' : `<div class="mapwrap">${renderMapPane(state)}</div>`}

      <div class="side">
        <div class="tabs" role="tablist">
          ${tabsFor().map((t) => `
            <button role="tab" aria-selected="${tab === t}" data-tab="${t}">${TAB_LABELS[t]}</button>`).join('')}
        </div>
        <div class="panel">
          ${tab === 'map' ? renderMapPane(state)
            : tab === 'market' ? renderMarket(state, draft)
            : tab === 'books' ? renderBooks(state)
            : tab === 'family' ? renderFamily(state, draft)
            : `${renderCoach(state)}<section><h3>Needs your decision</h3>${renderAttention(state)}</section>${renderPlan(state, draft)}`}
        </div>
        <div class="actionbar">
          <button class="btn primary wide" data-act="work">Work the year &rarr; ${state.year + 1}</button>
        </div>
      </div>
    </div>
    ${modal ? modal : ''}`;
}

/**
 * The walkthrough card.
 *
 * It sits at the top of the year rather than floating over the screen: an
 * overlay has to be dismissed before the player can look at the thing it is
 * describing, which is exactly backwards. This can be read, ignored, collapsed
 * or switched off, and it never disables a control.
 */
function renderCoach(state) {
  const step = activeStep(state);
  if (!step) return '';
  markShown(state, step.id, state.year);
  const collapsed = coachCollapsed;

  return `
    <section class="coach${collapsed ? ' collapsed' : ''}">
      <div class="coach-head">
        <span class="coach-tag">Walkthrough &middot; ${step.number} of ${step.total}</span>
        <span style="margin-left:auto"></span>
        <button class="btn sm" data-act="coach-collapse">${collapsed ? 'show' : 'hide'}</button>
        <button class="btn sm" data-act="coach-off" title="Switch the walkthrough off for this game">no thanks</button>
      </div>
      ${collapsed ? '' : `
        <h3>${esc(step.title)}</h3>
        <p class="coach-body">${step.body}</p>
        <div class="coach-foot">
          ${step.tab && step.tab !== tab && (step.tab !== 'map' || narrow())
            ? `<button class="btn sm" data-tab="${step.tab}">take me there</button>` : ''}
          ${step.ack
            ? `<button class="btn primary sm" data-act="coach-next" data-step="${step.id}">Got it</button>`
            : `<span class="coach-wait">Do that and this moves on by itself.</span>`}
        </div>`}
    </section>`;
}

/**
 * The township: the map, its view switches, the legend, the selected quarter
 * and the farm's own record underneath.
 *
 * ONE function, used by the desktop's left-hand column and by the phone's Map
 * tab. Rendering it twice — once per layout — would be two maps with the same
 * element ids and two sets of click handlers disagreeing about which quarter
 * is selected.
 */
function renderMapPane(state) {
  return `
    <div class="map-head">
      <h2>The township</h2>
      <span class="hint">${narrow() ? 'Tap' : 'Click'} a quarter to look at it.</span>
      <span style="margin-left:auto"></span>
      <button class="btn sm" data-map="use" ${mapMode === 'use' ? 'disabled' : ''}>what's growing</button>
      <button class="btn sm" data-map="soil" ${mapMode === 'soil' ? 'disabled' : ''}>soil</button>
      <button class="btn sm" data-map="roads" ${mapMode === 'roads' ? 'disabled' : ''}>roads &amp; distance</button>
    </div>
    ${renderMap(state, { selectedId: selectedQuarter, mode: mapMode })}
    <div class="legend">${renderLegend(state, mapMode)}</div>
    <div class="town-wrap">${renderTown(state)}</div>
    ${selectedQuarter ? renderQuarterDetail() : ''}
    ${renderChronicle()}`;
}

/**
 * The record so far: the farm's own history, newest first. This is the thing a
 * century-long game is actually accumulating, and it belongs on screen rather
 * than buried — it is also what fills the space under the map.
 */
function renderChronicle() {
  const entries = [...state.log].reverse().slice(0, 14);
  if (!entries.length) return '';
  return `
    <div style="margin-top:16px">
      <h2 style="margin-bottom:6px">The record</h2>
      <div style="background:var(--paper-2);border:1px solid var(--rule);border-radius:var(--radius);
                  padding:10px 14px;max-height:280px;overflow-y:auto">
        ${entries.map((e) => `
          <div style="display:flex;gap:12px;padding:4px 0;border-bottom:1px dotted var(--rule);font-size:.85rem">
            <span class="num" style="color:var(--wheat);min-width:34px">${e.year}</span>
            <span style="color:var(--ink-2)">${e.title ? `<strong>${esc(e.title)}</strong> — ` : ''}${esc(e.text)}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderQuarterDetail() {
  const q = quarterById(state.quarters, selectedQuarter);
  if (!q) return '';
  const mine = q.owner === 'player';
  return `
    <div style="margin-top:12px;padding:12px 14px;background:var(--paper-2);border:1px solid var(--rule);border-radius:var(--radius)">
      <h3 style="margin-bottom:4px">${esc(legalDescription(q, state.townshipLabel))}</h3>
      <div style="font-size:.85rem;color:var(--ink-2)">
        ${esc(state.regionDef.name)} &middot; ${esc(q.soil)} &middot;
        ${mine ? `${Math.round(q.brokenAcres)} of 160 acres broken, fertility ${Math.round(q.fertility * 100)}%`
               : q.owner ? esc(q.ownerName || q.owner) : 'open for homestead entry'}
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// The year-end report
// ---------------------------------------------------------------------------

function reportModal(record) {
  const h = record.harvest;
  const grain = (record.market.grain || []).filter((l) => l.amount > 0);
  const net = (record.income.total || 0) - (record.expenses.total || 0);

  const body = [];

  for (const ev of record.history) {
    body.push(`<div class="histcard"><h4>${esc(ev.title)}</h4><p>${esc(ev.text)}</p>
      ${ev.chose ? `<p style="margin-top:4px"><em>You: ${esc(ev.chose)}</em></p>` : ''}</div>`);
  }

  // What was ordered from the market, land, and roads panels last turn — a
  // buy or sell button queues an INTENT, not a guarantee, and this is the
  // only place that says which of them actually went through. A queued
  // purchase can still fail here on cash that an earlier item in the same
  // plan already spent, even when the market panel looked affordable when
  // it was clicked.
  if (record.spring.actions?.length) {
    body.push('<h3 style="margin-bottom:6px">This year\'s orders</h3>');
    for (const a of record.spring.actions) {
      body.push(`<div class="note"${a.ok ? '' : ' style="color:var(--alarm)"'}>${esc(a.text)}</div>`);
    }
  }

  const events = record.season.events || [];
  if (events.length) {
    body.push('<h3 style="margin-bottom:6px">The season</h3>');
    for (const e of events) {
      body.push(`<p class="narr"><strong>${esc(e.name)}.</strong> ${esc(e.text)}</p>`);
    }
  } else {
    body.push('<p class="narr">An uneventful season. They are rarer than they sound.</p>');
  }

  body.push('<h3 style="margin:16px 0 6px">Harvest</h3>');
  if (!h.lines?.length) {
    body.push('<div class="empty">Nothing was harvested — there was no crop in the ground to take off.</div>');
  } else {
    body.push('<table class="ledger"><thead><tr><th>Field</th><th>Crop</th>' +
      '<th style="text-align:right">Acres</th><th style="text-align:right">Per acre</th>' +
      '<th style="text-align:right">Total</th></tr></thead><tbody>');
    for (const l of h.lines) {
      body.push(`<tr><td>${esc(l.quarter)}</td><td>${esc(l.crop)}</td>
        <td class="n">${Math.round(l.harvestedAcres)}${l.missedAcres > 1 ? ` <span style="color:var(--alarm)" title="Stood in the field too long to cut this year — the harvest window closed first.">(${Math.round(l.missedAcres)} not cut)</span>` : ''}</td>
        <td class="n">${l.perAcre.toFixed(1)}</td>
        <td class="n">${qty(l.amount, l.unit)}</td></tr>`);
    }
    body.push('</tbody></table>');
  }

  if (grain.length) {
    body.push('<h3 style="margin:16px 0 6px">Sold</h3><table class="ledger"><tbody>');
    for (const l of grain) {
      body.push(`<tr><td>${esc(l.name)}</td><td class="n">${qty(l.amount, l.unit)}</td>
        <td class="n">@ ${unitPrice(l.price)}</td><td class="n">${money(l.gross)}</td></tr>`);
    }
    body.push('</tbody></table>');
  }

  // What never went to the elevator: next year's seed, and feed for the
  // animals and the teams. Computed every year since before this session,
  // never shown — the "Sold" table above looked like the whole crop, with no
  // way to tell that some of it was deliberately kept back rather than lost.
  const retained = Object.entries(record.market.retained || {}).filter(([, v]) => v > 0.5);
  if (retained.length) {
    body.push('<h3 style="margin:16px 0 6px">Held back for seed and feed</h3>');
    for (const [cropId, amount] of retained) {
      const c = CROPS[cropId];
      body.push(`<div class="note">${esc(c?.name || cropId)}: ${qty(amount, c?.unit || '')}</div>`);
    }
  }

  if (record.family?.length) {
    body.push('<h3 style="margin:16px 0 6px">The family</h3>');
    for (const f of record.family) body.push(`<div class="note">${esc(f.text)}</div>`);
  }
  if (record.winter?.succession) {
    body.push('<h3 style="margin:16px 0 6px">Succession</h3>');
    for (const l of record.winter.succession.log) body.push(`<div class="note">${esc(l)}</div>`);
  }
  if (record.notes?.length) {
    body.push('<h3 style="margin:16px 0 6px">Notes on the year</h3>');
    for (const n of record.notes) body.push(`<div class="note">${esc(n)}</div>`);
  }

  body.push(`<h3 style="margin:16px 0 6px">The account</h3>
    <div class="row"><span class="k">Income</span><span class="v">${money(record.income.total)}</span></div>
    <div class="row"><span class="k">Expenses</span><span class="v">-${money(record.expenses.total)}</span></div>
    <div class="row total"><span class="k">Net</span><span class="v" style="color:${net < 0 ? 'var(--alarm)' : 'var(--good)'}">
      ${net < 0 ? '-' : ''}${money(Math.abs(net))}</span></div>`);

  return `<div class="scrim" data-scrim><div class="modal">
      <header><h2>${record.year} &mdash; the year in the books</h2></header>
      <div class="body">${body.join('')}</div>
      <footer><button class="btn primary" data-act="close">Carry on</button></footer>
    </div></div>`;
}

/** A dated decision the player has to answer before the year will run. */
function choiceModal(h) {
  return `<div class="scrim"><div class="modal">
      <header><h2>${esc(h.title)}</h2></header>
      <div class="body">
        <p class="narr">${esc(h.text)}</p>
        <p style="margin:14px 0 10px"><strong>${esc(h.choice.prompt)}</strong></p>
        ${h.choice.options.map((o) => `
          <button class="choice" data-choice="${h.id}" data-option="${o.id}">
            <div class="lab">${esc(o.label)}</div>
            <div class="det">${esc(o.detail)}</div>
          </button>`).join('')}
      </div>
    </div></div>`;
}

/**
 * A marriage or coming-of-age decision — the same shape as choiceModal
 * above, but for something dynamic (which person, if anyone) rather than a
 * fixed year in the history table, so it comes from pendingLifeChoices()
 * instead of historyFor().
 */
function lifeChoiceModal(choice) {
  return `<div class="scrim"><div class="modal">
      <header><h2>${esc(choice.title)}</h2></header>
      <div class="body">
        <p class="narr">${esc(choice.prompt)}</p>
        ${choice.options.map((o) => `
          <button class="choice" data-life="${choice.personId}" data-option="${o.id}">
            <div class="lab">${esc(o.label)}</div>
            <div class="det">${esc(o.detail)}</div>
          </button>`).join('')}
      </div>
    </div></div>`;
}

function endModal() {
  const o = state.outcome || {};
  const sum = farmSummary(state);
  const years = state.year - FIRST_YEAR;
  const title = o.kind === 'complete' ? 'The end of the century'
    : o.kind === 'foreclosed' ? 'The farm is gone'
    : o.kind === 'estateBroken' ? 'The farm was sold to settle the estate'
    : 'The line ends';

  const plaque = state.flags.centennialEarned ? `
    <div class="plaque">
      <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.14em;color:var(--ink-3)">Province of Manitoba</div>
      <div class="big">Century Farm</div>
      <div style="font-size:.9rem;color:var(--ink-2)">The ${esc(state.family.surname)} family<br>
        ${esc(state.townshipLabel)}<br>1875 &ndash; 1975</div>
    </div>` : `
    <div class="empty" style="margin:18px 0">The Century Farm plaque goes to families who held the
      same land for a hundred years. This one did not reach 1975 with the home quarter still in the family.</div>`;

  return `<div class="scrim"><div class="modal">
      <header><h2>${title}</h2></header>
      <div class="body">
        <p class="narr">${esc(o.reason || 'A hundred and twenty-five years, and whatever is standing in the yard is what it all came to.')}</p>
        ${plaque}
        <div class="row"><span class="k">Years farmed</span><span class="v">${years}</span></div>
        <div class="row"><span class="k">Generations</span><span class="v">${state.family.generation}</span></div>
        <div class="row"><span class="k">Acres at the end</span><span class="v">${sum.acresOwned.toLocaleString()}</span></div>
        <div class="row"><span class="k">Net worth</span><span class="v">${money(netWorth(state))}</span></div>
        <div class="row"><span class="k">People born into it</span><span class="v">${state.family.members.length}</span></div>
        <div class="row"><span class="k">Buried</span><span class="v">${state.family.members.filter((m) => m.deathYear).length}</span></div>
      </div>
      <footer><button class="btn" data-act="newgame">Start again</button></footer>
    </div></div>`;
}

// ---------------------------------------------------------------------------
// Working a year
// ---------------------------------------------------------------------------

function workYear() {
  // A year with an unanswered dated decision stops and asks first. The
  // alternative is a choice silently defaulting, which the player experiences
  // as the game making a large decision on their behalf.
  const pending = historyFor(state.year).filter(
    (h) => h.choice && !draft.choiceResponse[h.id]
  );
  if (pending.length) {
    modal = choiceModal(pending[0]);
    render();
    return;
  }

  // Same idea, for a marriage or a child come of age: something the game used
  // to just decide, silently, is now something the year stops and asks about
  // first — exactly the way a scripted history decision already does.
  const pendingLife = pendingLifeChoices(state).filter((c) => !draft.lifeChoices[c.personId]);
  if (pendingLife.length) {
    modal = lifeChoiceModal(pendingLife[0]);
    render();
    return;
  }

  const plan = { ...draft };
  if (!Object.keys(plan.buyLivestock).length) delete plan.buyLivestock;
  if (!Object.keys(plan.sellLivestock).length) delete plan.sellLivestock;

  const { record } = runYear(state, plan);
  draft = freshDraft(state);
  selectedQuarter = null;

  if (record) {
    modal = state.status === STATUS.ACTIVE ? reportModal(record) : reportModal(record);
    if (state.status !== STATUS.ACTIVE) {
      // Show the year first, then the ending.
      const after = endModal();
      modal = modal.replace('data-act="close"', 'data-act="showend"');
      pendingEnd = after;
    }
  }
  // Anything the year just made true is now taught. Done before the save so
  // the walkthrough's progress rides along with it.
  reconcileTutorial(state);
  const saved = saveToStorage(state);
  if (!saved.ok) console.warn('Could not save:', saved.reason);
  render();
}

let pendingEnd = null;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function onClick(e) {
  const t = e.target.closest('[data-act],[data-tab],[data-map],[data-quarter],[data-choice],[data-life],' +
    '[data-bg],[data-diff],[data-buy-equip],[data-buy-stock],[data-sell-stock],' +
    '[data-buy-land],[data-file],[data-tech],[data-will],[data-program],[data-road],[data-family-stance],[data-grain-stance]');
  if (!t) return;

  const act = t.dataset.act;
  if (act === 'start') {
    state = newGame(setup);
    if (!setup.walkthrough) dismissTutorial(state);
    draft = freshDraft(state);
    render();
    return;
  }
  if (act === 'resume') { const r = loadFromStorage(); if (r.ok) { state = r.state; draft = freshDraft(state); render(); } return; }
  if (act === 'discard') { clearStorage(); renderSetup(); return; }
  if (act === 'newgame') { clearStorage(); state = null; modal = null; pendingEnd = null; renderSetup(); return; }
  if (act === 'close') { modal = null; render(); return; }
  if (act === 'coach-next') { ackStep(state, t.dataset.step); saveToStorage(state); render(); return; }
  if (act === 'coach-collapse') { coachCollapsed = !coachCollapsed; render(); return; }
  if (act === 'coach-off') { dismissTutorial(state); saveToStorage(state); render(); return; }
  if (act === 'showend') { modal = pendingEnd; pendingEnd = null; render(); return; }
  if (act === 'work') { workYear(); return; }
  if (act === 'theme') { toggleTheme(); return; }
  if (act === 'export') { exportSave(); return; }
  if (act === 'import') { importSave(); return; }

  if (t.dataset.tab) { tab = t.dataset.tab; render(); return; }
  if (t.dataset.map) { mapMode = t.dataset.map; render(); return; }
  if (t.dataset.quarter) { selectedQuarter = selectedQuarter === t.dataset.quarter ? null : t.dataset.quarter; render(); return; }
  if (t.dataset.bg) { setup.background = t.dataset.bg; renderSetup(); return; }
  if (t.dataset.diff) { setup.difficulty = t.dataset.diff; renderSetup(); return; }

  if (t.dataset.choice) {
    draft.choiceResponse[t.dataset.choice] = t.dataset.option;
    modal = null;
    workYear();
    return;
  }

  if (t.dataset.life) {
    draft.lifeChoices[t.dataset.life] = t.dataset.option;
    modal = null;
    workYear();
    return;
  }

  // Provisional purchases go into the draft and are applied when the year runs,
  // so nothing is spent until the player commits the year.
  if (t.dataset.buyEquip) { draft.buyEquipment.push({ type: t.dataset.buyEquip, count: 1 }); render(); return; }
  if (t.dataset.buyStock) {
    const id = t.dataset.buyStock;
    draft.buyLivestock[id] = (draft.buyLivestock[id] || 0) + 1;
    render(); return;
  }
  if (t.dataset.sellStock) {
    const id = t.dataset.sellStock;
    draft.sellLivestock[id] = (draft.sellLivestock[id] || 0) + 1;
    render(); return;
  }
  // Land, filing, technology, programs, and road work each mean one thing
  // per quarter/id per year — unlike equipment or livestock, clicking twice
  // does not mean "twice as much." These toggle: a second click on the same
  // thing cancels it, rather than silently queuing a duplicate order that
  // either double-charges (roads) or does nothing (land, already owned by
  // the time a second entry resolves).
  if (t.dataset.buyLand) {
    const id = t.dataset.buyLand;
    const i = draft.buyLand.indexOf(id);
    if (i >= 0) draft.buyLand.splice(i, 1); else draft.buyLand.push(id);
    render(); return;
  }
  if (t.dataset.file) {
    draft.fileHomestead = draft.fileHomestead === t.dataset.file ? null : t.dataset.file;
    render(); return;
  }
  if (t.dataset.tech) {
    const id = t.dataset.tech;
    const i = draft.adoptTech.indexOf(id);
    if (i >= 0) draft.adoptTech.splice(i, 1); else draft.adoptTech.push(id);
    render(); return;
  }
  if (t.dataset.program) {
    const id = t.dataset.program;
    draft.takeUpPrograms = draft.takeUpPrograms || [];
    const i = draft.takeUpPrograms.indexOf(id);
    if (i >= 0) draft.takeUpPrograms.splice(i, 1); else draft.takeUpPrograms.push(id);
    render(); return;
  }
  if (t.dataset.road) {
    const qid = t.dataset.road;
    draft.roadWorks = draft.roadWorks || [];
    const i = draft.roadWorks.findIndex((w) => w.quarterId === qid);
    if (i >= 0) draft.roadWorks.splice(i, 1);
    else draft.roadWorks.push({ quarterId: qid, kind: t.dataset.roadkind });
    render(); return;
  }
  if (t.dataset.will) { draft.writeWill = t.dataset.will; render(); return; }
  if (t.dataset.familyStance) {
    const id = t.dataset.familyStance;
    const option = t.dataset.option;
    if (option === 'neutral' || draft.familyStance[id] === option) delete draft.familyStance[id];
    else draft.familyStance[id] = option;
    render(); return;
  }
  if (t.dataset.grainStance) {
    const id = t.dataset.grainStance;
    const option = t.dataset.option;
    draft.grainStance = draft.grainStance || {};
    if (option === 'auto' || draft.grainStance[id] === option) delete draft.grainStance[id];
    else draft.grainStance[id] = option;
    render(); return;
  }
}

function onChange(e) {
  const t = e.target;
  // No re-render: the setup screen would rebuild the checkbox out from under
  // the click that set it.
  if (t.dataset.setup === 'walkthrough') { setup.walkthrough = t.checked; return; }
  if (t.dataset.field) { draft.fieldUse[t.dataset.field] = t.value; render(); return; }
  if (t.dataset.break) {
    const v = Math.max(0, Number(t.value) || 0);
    draft.breakAcres[t.dataset.break] = v;
    // Deliberately no re-render: re-rendering on every keystroke destroys the
    // input the player is typing in, and the value is already captured.
    return;
  }
  if (t.dataset.livestockCap) {
    draft.livestockCap = draft.livestockCap || {};
    // An emptied field clears the standing cap (null, read by phaseSpring as
    // "remove it"), not zero — zero would sell the whole species off.
    draft.livestockCap[t.dataset.livestockCap] = t.value === '' ? null : Math.max(0, Math.floor(Number(t.value) || 0));
    return;
  }
  if (t.dataset.hiredHands != null) {
    draft.hiredHands = Math.max(0, Math.floor(Number(t.value) || 0));
    return;
  }
}

/**
 * Write the game out to a file.
 *
 * Browser storage is per-origin, per-browser and per-device, and it is cleared
 * by things people do routinely. A century of play should not live only
 * somewhere that a cleared cache can take it.
 */
async function exportSave() {
  const filename = `centennial-farm-${state.family.surname}-${state.year}.json`;
  const text = serialize(state);

  // Some hosts do not let an embedded page start a download of its own — an
  // <a download> there is a button that does nothing, which is worse than no
  // button. Where the host offers a save, ask it; otherwise do it ourselves.
  try {
    const downloads = await window.claude?.use?.('downloads');
    if (downloads) {
      await downloads.save({ filename, data: text });
      return;
    }
  } catch (err) {
    // `declined` is the player changing their mind, not a failure.
    if (err?.code === 'declined' || err?.code === 'rate_limited') return;
    alert(`The game could not be written to a file: ${err?.message || 'unknown error'}`);
    return;
  }

  try {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert(`The game could not be written to a file: ${err?.message || 'unknown error'}`);
  }
}

function importSave() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const loaded = deserialize(await file.text());
      state = loaded;
      draft = freshDraft(state);
      modal = null;
      selectedQuarter = null;
      saveToStorage(state);
      render();
    } catch (err) {
      // Say what was wrong with it. A file that silently fails to load is
      // indistinguishable from a game that was never saved.
      alert(`That file could not be read as a saved game.\n\n${err?.message || 'unknown error'}`);
    }
  });
  input.click();
}

function toggleTheme() {
  const root = document.documentElement;
  const now = root.getAttribute('data-theme');
  const next = now === 'dark' ? 'light' : now === 'light' ? 'dark' : 'light';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('centennial-farm.theme', next); } catch { /* private window */ }
}

function render() {
  if (!state) { renderSetup(); return; }
  renderGame();

  // A new walkthrough step is no use below the fold. The panel can be a long
  // scroll by the second year, and the card sits at the top of it — the first
  // screenshot of the finished thing had the card off-screen above a wall of
  // the year's notices. Only on a CHANGE of step, so it never fights a player
  // who has scrolled down to read something.
  const step = activeStep(state);
  if (step && step.id !== lastCoachStep) {
    lastCoachStep = step.id;
    const el = app.querySelector('.coach');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  } else if (!step) {
    lastCoachStep = null;
  }
}

// ---------------------------------------------------------------------------

// Rotating the phone, or dragging a desktop window narrow, changes which
// layout applies. Re-render, and if the Map tab has just stopped existing,
// move off it — otherwise the panel would render a map that now has its own
// column, twice on one screen.
narrowQuery?.addEventListener?.('change', () => {
  if (!narrow() && tab === 'map') tab = 'plan';
  render();
});

document.addEventListener('click', onClick);
document.addEventListener('change', onChange);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal && !pendingEnd) { modal = null; render(); }
});

try {
  const saved = localStorage.getItem('centennial-farm.theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
} catch { /* storage unavailable; the media query still applies */ }

renderSetup();

// Exposed for the smoke test in tools/, which drives the real page.
globalThis.__farm = {
  get state() { return state; },
  set state(s) { state = s; render(); },
  workYear, render,
};
