// The year: one function, five ordered phases, one record out.
//
//   1. Spring plan     - decisions applied: land, machinery, stock, credit, crops
//   2. Growing season  - weather and misfortune rolled into `conditions`
//   3. Harvest         - yield x CAPACITY. What you got to, not what grew.
//   4. Market & settle - sell, service debt, feed the family, stay solvent
//   5. Winter & family - feed the stock, births, deaths, succession
//
// Every phase writes into one `record`, and that record IS the year-end ledger
// the player reads. The report is a byproduct of resolving the year, never a
// second pass that recomputes it — so the ledger cannot disagree with what
// actually happened.

import { streamFor } from './rng.js';
import { STATUS, ownedQuarters } from './state.js';
import {
  yieldPerAcre, neutralConditions, seasonCapacity, springDays, harvestDays,
  feedRequired, grazingCapacity, livingCost, annualWage, labourForce, netWorth,
  totalDebt, farmSummary, bestImplement, clamp, currentVariety, equipmentPrice,
  creditLimit, croppableAcres, breakableAcres, weedControlLevel,
  carryingCapacity, livestockUnits, speciesCap, draftPower,
  BASE_THRESHING_DAYS, BASE_BREAKING_DAYS,
} from './derive.js';
import {
  ACRES_PER_QUARTER, playerQuarters, quarterById, workableAcres,
  breakingCostPerAcre, quarterValueFactor,
} from './land.js';
import { crop as cropDef, CROPS, cropsAvailable, WHEAT_VARIETIES } from '../data/crops.data.js';
import { equipment as equipDef, EQUIPMENT } from '../data/equipment.data.js';
import { LIVESTOCK, LIVESTOCK_PRICING } from '../data/livestock.data.js';
import { TECHNOLOGIES } from '../data/tech.data.js';
import { historyFor } from '../data/history.data.js';
import { landPrice, rawLandDiscount, inflate, priceIndex, cropPrice, LAST_YEAR } from '../data/prices.data.js';
import { rollYearEvents, describeEvents } from './events.js';
import { serviceDebt, assessSolvency, forcedLandSale, borrow, repay, creditSourcesAvailable } from './finance.js';
import { sellGrain, livestockIncome, applySpoilage, consumeFeed, storageCapacity, interpAnchors, defaultSaleOrders } from './market.js';
import { advanceFamily, operator, fullName, age, isAlive, heirCandidates } from './family.js';
import { runSuccession, needsSuccession, writeWill, RETIREMENT_AGE } from './succession.js';

export const HOMESTEAD_FEE = 10;
export const PROVE_UP_YEARS = 3;
export const PROVE_UP_ACRES = 30; // breaking required to earn the patent

/**
 * Run one year. Returns the mutated state and the year's record.
 *
 * `plan` carries the player's (or the bot's) decisions. Every field is
 * optional: an empty plan is a valid year in which nothing was decided and the
 * farm carries on as it was, which is exactly what a quiet year should cost.
 */
export function runYear(state, plan = {}) {
  if (state.status !== STATUS.ACTIVE) {
    return { state, record: null, refused: `The run ended in ${state.outcome?.year}.` };
  }

  const record = {
    year: state.year,
    opening: { cash: state.cash, debt: totalDebt(state), netWorth: netWorth(state) },
    history: [],
    spring: {},
    season: {},
    harvest: {},
    market: {},
    settle: {},
    winter: {},
    family: [],
    notes: [],
    income: {},
    expenses: {},
  };

  // The operator's traits are read in several places; resolve once per year.
  const op = operator(state);
  state.operatorTraits = op ? op.traits : [];

  phaseHistory(state, record, plan);
  phaseSpring(state, record, plan);
  phaseSeason(state, record, plan);
  phaseHarvest(state, record, plan);
  phaseMarket(state, record, plan);
  phaseSettle(state, record, plan);
  phaseWinter(state, record, plan);

  record.closing = {
    cash: state.cash,
    debt: totalDebt(state),
    netWorth: netWorth(state),
    summary: farmSummary(state),
  };
  record.income.total = sumValues(record.income);
  record.expenses.total = sumValues(record.expenses);

  state.ledger.push(record);

  if (state.status === STATUS.ACTIVE) {
    if (state.year >= LAST_YEAR) {
      state.status = STATUS.COMPLETE;
      state.outcome = {
        kind: 'complete',
        year: state.year,
        generation: state.family.generation,
        centennial: state.flags.centennialEarned,
      };
    } else {
      state.year += 1;
    }
  }

  return { state, record };
}

// ---------------------------------------------------------------------------
// Phase 0: history
// ---------------------------------------------------------------------------

function phaseHistory(state, record, plan) {
  // Expire last year's temporary modifiers before this year's are applied.
  state.activeEffects = (state.activeEffects || []).filter((e) => e.expiresAfter >= state.year);
  state.modifiers = {};
  for (const e of state.activeEffects) mergeModifiers(state.modifiers, e.effects);

  for (const h of historyFor(state.year)) {
    record.history.push({ id: h.id, title: h.title, text: h.text, milestone: !!h.milestone });
    state.log.push({ year: state.year, kind: 'history', title: h.title, text: h.text });

    const fx = h.effects || {};
    applyHistoryEffects(state, record, fx);

    if (fx.permanent) {
      state.activeEffects.push({ effects: fx, expiresAfter: LAST_YEAR });
    } else {
      state.activeEffects.push({ effects: fx, expiresAfter: state.year + (fx.durationYears || 1) - 1 });
    }
    mergeModifiers(state.modifiers, fx);

    // A year that asks the player something.
    if (h.choice) {
      const answer = plan.choiceResponse?.[h.id] ?? plan.choiceResponse;
      const option = h.choice.options.find((o) => o.id === answer);
      if (option) {
        record.history[record.history.length - 1].chose = option.label;
        applyHistoryEffects(state, record, option.effects || {});
        mergeModifiers(state.modifiers, option.effects || {});
        state.activeEffects.push({
          effects: option.effects || {},
          expiresAfter: option.effects?.permanent ? LAST_YEAR : state.year + (option.effects?.durationYears || 1) - 1,
        });
      } else {
        // No answer given: the default is to do nothing, and the player is told
        // that a decision passed them by rather than it vanishing silently.
        record.notes.push(`A decision was put to you in ${state.year} and went unanswered: ${h.choice.prompt}`);
      }
    }
  }
}

function applyHistoryEffects(state, record, fx) {
  if (fx.unlockVariety) state.availableVarieties = [...new Set([...(state.availableVarieties || []), fx.unlockVariety])];
  if (fx.unlockTech) state.unlockedTech = [...new Set([...(state.unlockedTech || []), fx.unlockTech])];
  if (fx.compulsoryBoard) state.flags.compulsoryBoard = true;
  if (fx.centennial) {
    // The plaque requires the SAME FAMILY to have held the land a century.
    // That is the whole achievement, so it is checked, never assumed.
    const home = quarterById(state.quarters, state.homeQuarterId);
    const held = home && home.owner === 'player';
    if (held) {
      state.flags.centennialEarned = true;
      record.notes.push(
        'One hundred years on the same land, in the same family. The province sends a Century Farm plaque and a certificate.'
      );
    } else {
      record.notes.push(
        'A century since the first furrow — but the home quarter is no longer in the family, and the plaque is for farms that held on.'
      );
    }
  }
  if (fx.closeCrop) {
    // The market for a crop ends. Any acres in it are wasted, and the player
    // is told why rather than finding an empty field.
    for (const q of playerQuarters(state.quarters)) {
      if (q.use === fx.closeCrop) {
        q.use = 'fallow';
        record.notes.push(`The ${CROPS[fx.closeCrop].name.toLowerCase()} acres have no buyer now and went to fallow.`);
      }
    }
  }
  if (fx.neighbourDistress) state.neighbourDistress = fx.neighbourDistress;
  if (fx.forceEvent) state.forcedEvents = [...(state.forcedEvents || []), fx.forceEvent];
  if (fx.floodSeverity) state.forcedSeverity = fx.floodSeverity;
  if (fx.joinPool) state.flags.joinedPool = true;
  if (fx.liftPayment) state.pendingLiftPayment = true;
  if (fx.forceFallowFraction) state.forceFallowFraction = fx.forceFallowFraction;
}

function mergeModifiers(mods, fx) {
  for (const key of ['priceMult', 'landMult', 'interestMult', 'creditEase', 'freightMult', 'yieldMult', 'hogPriceMult', 'gradingPenalty', 'haulMiles', 'labourShortage', 'illnessRisk']) {
    if (fx[key] == null) continue;
    if (key === 'gradingPenalty' || key === 'labourShortage' || key === 'illnessRisk') {
      mods[key] = (mods[key] || 0) + fx[key];
    } else {
      mods[key] = (mods[key] ?? 1) * fx[key];
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 1: spring
// ---------------------------------------------------------------------------

function phaseSpring(state, record, plan) {
  const rng = streamFor(state.seed, state.year, 'spring');
  const sp = record.spring;
  sp.actions = [];

  // --- a will, if they thought of it ---------------------------------------
  if (plan.writeWill) {
    const r = writeWill(state, plan.writeWill);
    sp.actions.push(r.ok ? `Will drawn up naming ${r.heirName}.` : `No will: ${r.reason}`);
    if (r.ok) record.expenses.legal = (record.expenses.legal || 0) + r.cost;
  }

  // --- credit ---------------------------------------------------------------
  for (const loan of plan.loans || []) {
    const r = borrow(state, loan);
    sp.actions.push(r.ok
      ? `Borrowed $${Math.round(loan.amount).toLocaleString()} at ${(r.rate * 100).toFixed(1)}% over ${r.term} years.`
      : `Could not borrow: ${r.reason}`);
    if (r.ok) record.income.borrowed = (record.income.borrowed || 0) + loan.amount;
  }
  for (const rp of plan.repayments || []) {
    const r = repay(state, rp.debtId, rp.amount);
    if (r.ok) record.expenses.debtPrepayment = (record.expenses.debtPrepayment || 0) + r.paid;
  }

  // --- land -----------------------------------------------------------------
  if (plan.fileHomestead) {
    const q = quarterById(state.quarters, plan.fileHomestead);
    if (!q) sp.actions.push('That quarter does not exist.');
    else if (q.owner) sp.actions.push(`${q.id} is not open to file on.`);
    else if (q.tenure !== 'homestead') sp.actions.push(`${q.id} is ${q.tenure} land — it must be bought, not filed on.`);
    else if (state.cash < HOMESTEAD_FEE) sp.actions.push(`No $${HOMESTEAD_FEE} for the filing fee.`);
    else {
      state.cash -= HOMESTEAD_FEE;
      q.owner = 'player'; q.ownerName = 'you';
      q.yearAcquired = state.year; q.acquiredBy = 'homestead';
      record.expenses.landFees = (record.expenses.landFees || 0) + HOMESTEAD_FEE;
      sp.actions.push(`Filed on ${q.quarter} ${q.section} — $${HOMESTEAD_FEE} and three years to prove it up.`);
    }
  }

  for (const qid of plan.buyLand || []) {
    const q = quarterById(state.quarters, qid);
    if (!q || q.owner === 'player') continue;
    const price = quarterPurchasePrice(state, q);
    if (state.cash < price) { sp.actions.push(`${q.id} wanted $${Math.round(price).toLocaleString()} and the account would not stand it.`); continue; }
    state.cash -= price;
    const from = q.ownerName;
    q.owner = 'player'; q.ownerName = 'you';
    q.yearAcquired = state.year; q.acquiredBy = 'purchase';
    record.expenses.landPurchase = (record.expenses.landPurchase || 0) + price;
    sp.actions.push(`Bought ${q.quarter} ${q.section} from ${from} for $${Math.round(price).toLocaleString()}.`);
  }

  for (const qid of plan.sellLand || []) {
    const q = quarterById(state.quarters, qid);
    if (!q || q.owner !== 'player' || q.id === state.homeQuarterId) continue;
    const price = quarterPurchasePrice(state, q) * 0.94;
    q.owner = 'neighbour'; q.ownerName = 'sold'; q.use = 'wheat';
    state.cash += price;
    record.income.landSale = (record.income.landSale || 0) + price;
    sp.actions.push(`Sold ${q.quarter} ${q.section} for $${Math.round(price).toLocaleString()}.`);
  }

  // --- machinery, stock, technology ----------------------------------------
  for (const buy of plan.buyEquipment || []) {
    const def = EQUIPMENT[buy.type];
    if (!def) continue;
    if (state.year < def.from || state.year > def.to) {
      sp.actions.push(`No ${def.name.toLowerCase()} on the market in ${state.year}.`);
      continue;
    }
    const price = equipmentPrice(state, def) * (buy.count || 1);
    if (state.cash < price) { sp.actions.push(`A ${def.name.toLowerCase()} wanted $${Math.round(price).toLocaleString()}; the account would not stand it.`); continue; }
    state.cash -= price;
    // Merge into the existing entry rather than stacking a second one. Three
    // separate "oxen x1" rows are three yokes of oxen eating three lots of
    // feed, which is not what buying one more ox means.
    const existing = state.equipment.find((i) => i.type === buy.type);
    if (existing) {
      existing.count = (existing.count || 1) + (buy.count || 1);
      // A new unit alongside an old one lifts the average condition.
      existing.condition = Math.min(1, (existing.condition ?? 1) * 0.6 + 0.4);
    } else {
      state.equipment.push({ type: buy.type, count: buy.count || 1, yearBought: state.year, condition: 1 });
    }
    record.expenses.machinery = (record.expenses.machinery || 0) + price;
    sp.actions.push(`Bought a ${def.name.toLowerCase()} — $${Math.round(price).toLocaleString()}.`);
  }
  for (const type of plan.sellEquipment || []) {
    const idx = state.equipment.findIndex((i) => i.type === type);
    if (idx < 0) continue;
    const item = state.equipment[idx];
    const def = equipDef(type);
    const price = equipmentPrice(state, def) * clamp(item.condition, 0.2, 1) * 0.45;
    state.equipment.splice(idx, 1);
    state.cash += price;
    record.income.machinerySale = (record.income.machinerySale || 0) + price;
    sp.actions.push(`Sold the ${def.name.toLowerCase()} for $${Math.round(price).toLocaleString()}.`);
  }

  for (const [id, count] of Object.entries(plan.buyLivestock || {})) {
    if (!count) continue;
    const l = LIVESTOCK[id];
    if (!l || state.year < l.from || state.year > l.to) { sp.actions.push(`No market for ${id} in ${state.year}.`); continue; }
    const each = interpAnchors(LIVESTOCK_PRICING[id], state.year);
    const cost = each * count;
    if (state.cash < cost) { sp.actions.push(`${count} ${l.name.toLowerCase()} wanted $${Math.round(cost).toLocaleString()}; not this year.`); continue; }
    state.cash -= cost;
    state.livestock[id] = (state.livestock[id] || 0) + count;
    record.expenses.livestockPurchase = (record.expenses.livestockPurchase || 0) + cost;
    sp.actions.push(`Bought ${count} ${l.name.toLowerCase()} for $${Math.round(cost).toLocaleString()}.`);
  }
  for (const [id, count] of Object.entries(plan.sellLivestock || {})) {
    const have = state.livestock[id] || 0;
    const n = Math.min(have, count);
    if (n <= 0) continue;
    const each = interpAnchors(LIVESTOCK_PRICING[id], state.year);
    state.livestock[id] = have - n;
    state.cash += each * n;
    record.income.livestockSale = (record.income.livestockSale || 0) + each * n;
    sp.actions.push(`Sold ${n} ${LIVESTOCK[id].name.toLowerCase()} for $${Math.round(each * n).toLocaleString()}.`);
  }

  for (const techId of plan.adoptTech || []) {
    const t = TECHNOLOGIES[techId];
    if (!t || state.technologies.includes(techId)) continue;
    if (state.year < t.from) { sp.actions.push(`${t.name} does not exist yet.`); continue; }
    if (t.requires && !state.technologies.includes(t.requires)) {
      sp.actions.push(`${t.name} needs ${TECHNOLOGIES[t.requires].name} first.`); continue;
    }
    if (t.requiresImplement && !state.equipment.some((i) => i.type === t.requiresImplement)) {
      sp.actions.push(`${t.name} needs a ${EQUIPMENT[t.requiresImplement].name.toLowerCase()}.`); continue;
    }
    const cost = t.cost ? inflate(t.cost / (priceIndex(t.costYear || 1875) / 100), state.year) : 0;
    if (state.cash < cost) { sp.actions.push(`${t.name} wanted $${Math.round(cost).toLocaleString()}.`); continue; }
    state.cash -= cost;
    state.technologies.push(techId);
    record.expenses.improvements = (record.expenses.improvements || 0) + cost;
    sp.actions.push(`Took up ${t.name.toLowerCase()}${cost ? ` — $${Math.round(cost).toLocaleString()}` : ''}.`);
  }

  if (plan.setVariety) {
    const v = WHEAT_VARIETIES.find((x) => x.id === plan.setVariety);
    if (v && state.year >= v.from) {
      if (state.wheatVariety !== v.id) sp.actions.push(`Changed seed to ${v.name}.`);
      state.wheatVariety = v.id;
    }
  }

  if (plan.hiredHands != null) {
    state.hiredHands = Math.max(0, Math.floor(plan.hiredHands));
  }

  // --- improvements ---------------------------------------------------------
  for (const imp of plan.improvements || []) {
    const q = quarterById(state.quarters, imp.quarterId);
    if (!q || q.owner !== 'player') continue;
    const costs = { drain: 9, stonePick: 4, fence: 3 };
    const cost = inflate(costs[imp.kind] || 0, state.year) * ACRES_PER_QUARTER * 0.25;
    if (state.cash < cost) continue;
    state.cash -= cost;
    if (imp.kind === 'drain') q.drained = true;
    if (imp.kind === 'stonePick') q.stonePicked = true;
    if (imp.kind === 'fence') q.fenced = true;
    record.expenses.improvements = (record.expenses.improvements || 0) + cost;
    sp.actions.push(`${imp.kind === 'drain' ? 'Drained' : imp.kind === 'stonePick' ? 'Picked stone on' : 'Fenced'} ${q.quarter} ${q.section}.`);
  }

  // --- assign the fields ----------------------------------------------------
  const available = new Set(cropsAvailable(state.year).map((c) => c.id));
  for (const q of playerQuarters(state.quarters)) {
    const want = plan.fieldUse?.[q.id];
    if (!want) continue;
    if (!available.has(want)) {
      record.notes.push(`${q.quarter} ${q.section}: ${CROPS[want]?.name || want} cannot be grown in ${state.year}.`);
      continue;
    }
    const c = CROPS[want];
    if (c.requiresImplement && !state.equipment.some((i) => i.type === c.requiresImplement)) {
      record.notes.push(`${q.quarter} ${q.section}: ${c.name.toLowerCase()} needs a ${EQUIPMENT[c.requiresImplement].name.toLowerCase()}, so it went to fallow.`);
      q.use = 'fallow';
      continue;
    }
    q.lastUse = q.use;
    q.use = want;
  }

  // The LIFT program of 1970 paid farmers to grow nothing, and the acres came
  // out of production whether the plan called for it or not.
  if (state.forceFallowFraction) {
    const owned = playerQuarters(state.quarters);
    const n = Math.round(owned.length * state.forceFallowFraction);
    for (const q of owned.slice(0, n)) q.use = 'fallow';
    state.forceFallowFraction = null;
  }

  // --- breaking and seeding, each in its own season -------------------------
  // These do NOT compete. New land was broken in June and July, after the crop
  // was in and before harvest, and backset in the fall. Charging breaking
  // against the seeding window produces a farm that breaks land every spring
  // and never gets a crop planted.
  const conditions = neutralConditions();
  const days = springDays(state, conditions);
  sp.springDays = days;

  const breakPlan = Object.entries(plan.breakAcres || {});
  const breakCapacity = breakableAcres(state);
  let breakDaysUsed = 0;
  sp.broken = 0;
  sp.breakableAcres = breakCapacity.acres;
  if (breakPlan.length) {
    const breaker = bestImplement(state, 'till');
    if (!breaker || !breaker.canBreakSod) {
      record.notes.push('Nothing on the place will turn native sod. No new land was broken.');
    } else {
      for (const [qid, acres] of breakPlan) {
        const q = quarterById(state.quarters, qid);
        if (!q || q.owner !== 'player') continue;
        const room = ACRES_PER_QUARTER - q.brokenAcres;
        let want = Math.min(acres, room);
        if (want <= 0) continue;
        // The same figure the UI offers the player — one derivation, so the
        // acres they are told they can break are the acres they get.
        const rate = breakCapacity.perDay;
        const daysLeft = BASE_BREAKING_DAYS - breakDaysUsed;
        const possible = Math.max(0, rate * daysLeft);
        const did = Math.min(want, possible);
        const perAcre = breakingCostPerAcre(q) * (priceIndex(state.year) / 100);
        const cost = perAcre * did;
        if (cost > state.cash) {
          // Only as many acres as the cash will pay for, and never fewer than
          // none: with an overdrawn account this produced a NEGATIVE number of
          // acres broken, and the land silently un-broke itself.
          const afford = Math.max(0, state.cash) / Math.max(0.01, perAcre);
          const actual = Math.max(0, Math.min(did, afford));
          q.brokenAcres += actual;
          state.cash -= actual * perAcre;
          sp.broken += actual;
          breakDaysUsed += actual / Math.max(0.01, rate);
          record.expenses.breaking = (record.expenses.breaking || 0) + actual * perAcre;
        } else {
          q.brokenAcres += did;
          state.cash -= cost;
          sp.broken += did;
          breakDaysUsed += did / Math.max(0.01, rate);
          record.expenses.breaking = (record.expenses.breaking || 0) + cost;
        }
        if (did < want) {
          record.notes.push(
            `${q.quarter} ${q.section}: wanted ${Math.round(want)} acres broken, got ${Math.round(did)} — ` +
              `the outfit and the season would not do more.`
          );
        }
      }
    }
  }

  // Seeding. This is the constraint that decides how big a farm can be.
  //
  // The figure comes from croppableAcres() — the SAME function the planning
  // screen and the bot ask. It is not recomputed here. An earlier version had
  // this arithmetic written out twice, and the two copies disagreed by about
  // seven per cent, which is a farm the player is shown and does not have.
  const seedDaysAvailable = days;
  const capacity = croppableAcres(state);

  const toSeed = playerQuarters(state.quarters)
    .filter((q) => {
      const c = CROPS[q.use];
      return c && c.seedRate >= 0 && !['idle', 'pasture', 'bush'].includes(q.use);
    })
    .map((q) => ({ q, acres: workableAcres(q) }));

  const wantedAcres = toSeed.reduce((s, x) => s + x.acres, 0);
  const maxAcres = capacity.spring;

  sp.acresWanted = wantedAcres;
  sp.acresPossible = maxAcres;
  sp.tillPerDay = capacity.tillPerDay || 0;
  sp.seedPerDay = capacity.seedPerDay || 0;
  sp.bottleneck = capacity.bottleneck;

  let budget = maxAcres;
  sp.seeded = 0;
  sp.notSeeded = 0;
  for (const { q, acres } of toSeed) {
    if (q.use === 'fallow') { q.seededAcres = 0; continue; } // fallow is worked, not seeded
    const got = Math.min(acres, Math.max(0, budget));
    q.seededAcres = got;
    budget -= got;
    sp.seeded += got;
    if (got < acres - 0.5) sp.notSeeded += acres - got;
  }
  if (sp.notSeeded > 1) {
    record.notes.push(
      `${Math.round(sp.notSeeded)} acres were not seeded — the outfit could work ${Math.round(maxAcres)} acres ` +
        `in ${Math.round(seedDaysAvailable)} days and there were ${Math.round(wantedAcres)} to do. ` +
        `The ${capacity.bottleneck} is what is holding the farm back.`
    );
  }

  // Seed comes OUT OF THE BIN first, and only the shortfall is bought.
  //
  // A farmer kept back next year's seed from the crop — which the marketing
  // phase already does — and buying it again at the elevator would be paying
  // for the same bushels twice. The engine was doing exactly that: seed was
  // held back from sale AND charged in cash, which cost more than the grain
  // was worth (25.6% of gross against grain's 24.4%) and made the crop a
  // losing proposition in every era.
  let seedBought = 0;
  let seedFromBin = 0;
  let inputCost = 0;
  const seeder = bestImplement(state, 'seed');
  const waste = seeder?.seedWaste ?? 1.25;

  for (const { q } of toSeed) {
    const c = CROPS[q.use];
    if (!c || !q.seededAcres || !c.seedRate) continue;
    const needed = c.seedRate * q.seededAcres * waste;
    const inBin = state.granary[c.id] || 0;
    const fromBin = Math.min(inBin, needed);
    state.granary[c.id] = inBin - fromBin;
    seedFromBin += fromBin;

    const short = needed - fromBin;
    if (short > 0.01) {
      // Bought seed is cleaned and graded, so it carries a premium.
      seedBought += short * seedUnitCost(state, c);
    }
  }

  for (const { q } of toSeed) {
    if (!q.seededAcres) continue;
    for (const techId of state.technologies) {
      const t = TECHNOLOGIES[techId];
      if (t?.costPerAcre) {
        inputCost += inflate(t.costPerAcre / (priceIndex(t.costYear || 1950) / 100), state.year) * q.seededAcres;
      }
    }
  }

  const cashNeeded = seedBought + inputCost;
  const affordable = Math.min(cashNeeded, Math.max(0, state.cash));
  state.cash -= affordable;
  record.expenses.seed = seedBought;
  record.expenses.inputs = inputCost;
  sp.seedFromBin = seedFromBin;
  if (affordable < cashNeeded - 0.5) {
    record.notes.push(
      'There was not enough cash to buy all the seed and inputs the plan called for. ' +
        'Keeping more of the crop back next fall would cost nothing.'
    );
  }
}

function seedUnitCost(state, c) {
  // Seed is priced off the crop itself, plus a premium for clean seed.
  // Crops outside their window are never seeded, so this cannot be reached
  // with one — but if it ever is, that is a bug worth hearing about rather
  // than a silent $1.00 a bushel.
  if (state.year < c.from || state.year > c.to) {
    throw new Error(`seedUnitCost: ${c.id} is not available in ${state.year}`);
  }
  return cropPrice(c.id, state.year) * 1.15;
}

// ---------------------------------------------------------------------------
// Phase 2: growing season
// ---------------------------------------------------------------------------

function phaseSeason(state, record, plan) {
  const rng = streamFor(state.seed, state.year, 'season');

  // Set each quarter's moisture for the year before anything reads it.
  const baseMoisture = clamp(rng.normal(0.62, 0.13), 0.15, 1.0);
  for (const q of playerQuarters(state.quarters)) {
    let m = baseMoisture;
    // Last year's summerfallow banked moisture for this crop — the entire
    // agronomic argument for giving up a third of your acres.
    if (q.lastUse === 'fallow') m += CROPS.fallow.moistureBank;
    if (state.technologies.includes('zeroTill')) m += TECHNOLOGIES.zeroTill.effect.moistureBank;
    q.moisture = clamp(m, 0.05, 1.1);
  }

  const { conditions, fired } = rollYearEvents(state, rng, {
    forced: state.forcedEvents || [],
    severityOverride: state.forcedSeverity,
  });
  state.forcedEvents = [];
  state.forcedSeverity = null;

  state.yearHazards = {
    illnessRisk: state.modifiers?.illnessRisk || 0,
  };

  record.season.events = describeEvents(fired);
  record.season.conditions = {
    weatherYield: conditions.weatherYield,
    moistureShift: conditions.moistureShift,
    springDaysLost: conditions.springDaysLost,
    harvestDaysLost: conditions.harvestDaysLost,
    gradeFactor: conditions.gradeFactor,
    rustSeverity: conditions.rustSeverity,
  };
  state.yearConditions = conditions;

  // Effects that hit the farm rather than the crop.
  for (const p of conditions.pending || []) {
    if (p.kind === 'livestockLoss') {
      for (const [id, count] of Object.entries(state.livestock)) {
        const lost = Math.floor(count * p.fraction);
        if (lost > 0) {
          state.livestock[id] = count - lost;
          record.notes.push(`Lost ${lost} ${LIVESTOCK[id].name.toLowerCase()}.`);
        }
      }
    } else if (p.kind === 'draftLoss') {
      for (const item of state.equipment) {
        if (equipDef(item.type).category !== 'power' || !equipDef(item.type).feed) continue;
        const lost = Math.floor((item.count || 1) * p.fraction);
        if (lost > 0) {
          item.count = Math.max(0, (item.count || 1) - lost);
          record.notes.push(`Lost ${lost} ${equipDef(item.type).name.toLowerCase()}.`);
        }
      }
      state.equipment = state.equipment.filter((i) => (i.count ?? 1) > 0);
    } else if (p.kind === 'cash') {
      state.cash += p.amount;
      record.expenses.misfortune = (record.expenses.misfortune || 0) - p.amount;
    } else if (p.kind === 'destroyBuilding') {
      const idx = state.equipment.findIndex((i) => i.type === p.id);
      if (idx >= 0) {
        state.equipment.splice(idx, 1);
        record.notes.push(`The ${EQUIPMENT[p.id].name.toLowerCase()} is gone.`);
      }
    } else if (p.kind === 'injury') {
      const op = operator(state);
      if (op) {
        op.injuredUntil = state.year + (p.severity > 0.6 ? 1 : 0);
        op.health = clamp(op.health - p.severity * 0.25, 0.2, 1);
        record.notes.push(`${fullName(op)} was hurt and was not much use for the rest of the season.`);
      }
    } else if (p.kind === 'soilDamage') {
      for (const q of playerQuarters(state.quarters)) q.fertility = clamp(q.fertility - p.amount, 0.1, 1.1);
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 3: harvest
// ---------------------------------------------------------------------------

function phaseHarvest(state, record, plan) {
  const conditions = state.yearConditions || neutralConditions();
  const days = harvestDays(state, conditions);
  const cap = seasonCapacity(state, 'harvest', days);

  const fields = playerQuarters(state.quarters)
    .filter((q) => q.seededAcres > 0 && CROPS[q.use]?.yieldBase > 0);

  // What grew, per field, before any question of getting to it.
  const standing = fields.map((q) => {
    const perAcre = yieldPerAcre(state, q, q.use, conditions);
    return { q, perAcre, acres: q.seededAcres, total: perAcre * q.seededAcres, unit: CROPS[q.use].unit };
  });

  const totalAcres = standing.reduce((s, x) => s + x.acres, 0);
  const canHarvest = cap.acres;

  record.harvest.days = days;
  record.harvest.capacityAcres = canHarvest;
  record.harvest.standingAcres = totalAcres;
  record.harvest.implement = cap.implement?.name || null;
  record.harvest.lines = [];

  if (totalAcres > 0 && !cap.implement) {
    record.notes.push(`There were ${Math.round(totalAcres)} acres standing and nothing on the place to cut them with.`);
  }

  // Fields are taken in order of value — you cut the best crop first.
  standing.sort((a, b) => b.perAcre * cropValueHint(state, b.q.use) - a.perAcre * cropValueHint(state, a.q.use));

  let budget = canHarvest;
  let lost = 0;
  for (const s of standing) {
    const got = Math.min(s.acres, Math.max(0, budget));
    budget -= got;
    const c = CROPS[s.q.use];
    const impl = cap.implement;
    const fieldLoss = impl?.fieldLoss ?? 0.1;
    const harvested = s.perAcre * got * (1 - fieldLoss) * (conditions.gradeFactor ?? 1);
    const missed = s.acres - got;
    lost += missed;

    if (harvested > 0) {
      state.granary[s.q.use] = (state.granary[s.q.use] || 0) + harvested;
    }
    record.harvest.lines.push({
      quarter: `${s.q.quarter} ${s.q.section}`,
      crop: c.name,
      cropId: s.q.use,
      acres: s.acres,
      harvestedAcres: got,
      perAcre: s.perAcre,
      amount: harvested,
      unit: c.unit,
      missedAcres: missed,
    });
    s.q.cropHistory = [...(s.q.cropHistory || []), s.q.use].slice(-6);
    s.q.yearsCropped = (s.q.yearsCropped ?? 0) + 1;
  }

  record.harvest.acresLost = lost;
  if (lost > 1) {
    record.notes.push(
      `${Math.round(lost)} acres were still standing when the weather closed in. ` +
        `The outfit could take off ${Math.round(canHarvest)} acres in ${Math.round(days)} days.`
    );
  }

  // Threshing: before the combine, cutting and threshing were separate jobs,
  // and the separator (or a hired crew) was its own constraint.
  const harvester = cap.implement;
  if (harvester?.needsThreshing) {
    const thresh = seasonCapacity(state, 'thresh', BASE_THRESHING_DAYS);
    const cutAcres = totalAcres - lost;
    if (thresh.acres < cutAcres) {
      const unthreshed = cutAcres - thresh.acres;
      // A custom threshing crew will do the rest, for money and their board.
      const rate = inflate(0.09, state.year);
      const bushelsAtRisk = record.harvest.lines.reduce((s, l) => s + l.amount, 0) * (unthreshed / Math.max(1, cutAcres));
      const fee = bushelsAtRisk * rate;
      if (state.cash >= fee) {
        state.cash -= fee;
        record.expenses.customThreshing = fee;
        record.notes.push(`A custom threshing crew took off what the place could not — $${Math.round(fee).toLocaleString()} and their board.`);
      } else {
        // Grain that is cut but not threshed spoils in the stook.
        for (const l of record.harvest.lines) {
          const spoil = l.amount * (unthreshed / Math.max(1, cutAcres)) * 0.6;
          state.granary[l.cropId] = Math.max(0, (state.granary[l.cropId] || 0) - spoil);
          l.amount -= spoil;
        }
        record.notes.push('There was no threshing outfit and no money to hire one. Grain spoiled in the stook.');
      }
    }
  }

  record.harvest.totals = {};
  for (const l of record.harvest.lines) {
    record.harvest.totals[l.cropId] = (record.harvest.totals[l.cropId] || 0) + l.amount;
  }
}

/**
 * Rough value of a crop, used only to decide which field to cut first when
 * capacity will not reach them all. You take the best crop off first.
 */
function cropValueHint(state, cropId) {
  const c = CROPS[cropId];
  if (!c || state.year < c.from || state.year > c.to) return 0;
  return cropPrice(cropId, state.year);
}

// ---------------------------------------------------------------------------
// Phase 4: market
// ---------------------------------------------------------------------------

function phaseMarket(state, record, plan) {
  const rng = streamFor(state.seed, state.year, 'market');
  const conditions = state.yearConditions || neutralConditions();

  // Sell the surplus and hold back the seed and the feed. A farm with no
  // marketing plan still sells its crop — it does not sit on it by accident —
  // but it does not sell the oats the horses eat either.
  const seededByCrop = {};
  for (const l of record.harvest.lines || []) {
    seededByCrop[l.cropId] = (seededByCrop[l.cropId] || 0) + l.harvestedAcres;
  }
  const defaults = defaultSaleOrders(state, {
    feedRequired: feedRequired(state),
    seededByCrop,
  });
  const orders = plan.grainSales || defaults.orders;
  record.market.retained = defaults.held;

  const sale = sellGrain(state, orders, { gradeFactor: conditions.gradeFactor });
  record.market.grain = sale.lines;
  record.income.grain = sale.proceeds;
  for (const l of sale.lines) if (l.refused) record.notes.push(l.reason);

  const stock = livestockIncome(state, rng);
  record.market.livestock = stock.lines;
  record.income.livestock = stock.total;

  // Off-farm work.
  //
  // This is not a convenience — it is how homesteads were actually financed.
  // Nearly every settler worked out in the first years: on railway grading
  // gangs, on harvest excursions, in lumber camps over the winter, or for
  // established farmers. The farm did not pay for itself until there were
  // enough broken acres to live on, and the gap was closed with wages.
  if (state.difficultyDef.offFarmWorkAvailable) {
    const labour = labourForce(state);
    const sum = farmSummary(state);
    const wage = annualWage(state);

    // Wage work came in two kinds and the distinction matters.
    //
    // WINTER work was available to everybody, every year, because there is no
    // farm work in Manitoba between November and March. Men went to the
    // lumber camps, cut cordwood, hauled freight, worked in town. It did not
    // depend on how big the farm was.
    //
    // SUMMER work — railway grading gangs, the harvest excursions — was only
    // open to labour the farm's own acres did not need, and it is what
    // financed a homestead through the years before it could feed itself.
    const eraAccess = state.year < 1900 ? 1.0 : state.year < 1930 ? 0.9
      : state.year < 1950 ? 0.7 : state.year < 1970 ? 0.5 : 0.4;

    const adults = state.family.members.filter((m) => {
      if (m.deathYear || m.away) return false;
      const a = state.year - m.birthYear;
      return a >= 16 && a <= 65;
    }).length;

    // How readily this farm can get wage work at all is a tier difference.
    const access = state.difficultyDef.offFarmWorkMult ?? 1;

    // Winter: a few months' wages, for up to two people. Enough to carry a
    // homestead through the years before it can feed itself, and not so much
    // that the farm becomes a sideline to the wage — it was running at half
    // the farm's whole income, which is a labourer with a quarter section,
    // not a farmer.
    const winter = Math.min(adults, 2) * wage * 0.2 * eraAccess * access;

    // Summer: only genuinely spare hands, and worth more per head.
    const needed = sum.acresCropped / 55;
    const spare = Math.max(0, labour.family - needed);
    const summer = Math.min(spare, 2) * wage * 0.35 * eraAccess * access;

    const amount = winter + summer;
    if (amount > 1) {
      state.cash += amount;
      record.income.offFarmWork = amount;
      record.market.offFarmLabel = state.year < 1900
        ? 'Winter work and the harvest excursion'
        : state.year < 1950 ? 'Winter work off the farm'
        : 'Off-farm wages';
    }
  }

  // Region-specific off-farm income: winter fishing on Lake Winnipeg is why
  // Interlake families survived years the land could not carry them.
  const off = state.regionDef.offFarmIncome;
  if (off && state.year <= off.throughYear && state.difficultyDef.offFarmWorkAvailable) {
    const amount = inflate(off.amount, state.year);
    state.cash += amount;
    record.income.offFarmRegional = amount;
    record.market.regionalLabel = off.label;
  }

  if (state.pendingLiftPayment) {
    const acres = playerQuarters(state.quarters).filter((q) => q.use === 'fallow').reduce((s, q) => s + q.brokenAcres, 0);
    const payment = acres * 6;
    state.cash += payment;
    record.income.programPayment = payment;
    record.notes.push(`LIFT payment on ${Math.round(acres)} summerfallow acres — $${Math.round(payment).toLocaleString()}.`);
    state.pendingLiftPayment = false;
  }
}

// ---------------------------------------------------------------------------
// Phase 5a: settle up
// ---------------------------------------------------------------------------

function phaseSettle(state, record, plan) {
  const wages = (state.hiredHands || 0) * annualWage(state);
  state.cash -= wages;
  record.expenses.wages = wages;

  const living = livingCost(state);
  state.cash -= living;
  record.expenses.living = living;

  // Machinery upkeep and fuel, whether it ran well or not.
  let upkeep = 0;
  for (const item of state.equipment) {
    const e = equipDef(item.type);
    upkeep += inflate((e.upkeep || 0) / (priceIndex(e.priceYear || 1875) / 100), state.year) * (item.count || 1);
  }
  state.cash -= upkeep;
  record.expenses.upkeep = upkeep;

  // Municipal taxes on the land.
  const taxes = playerQuarters(state.quarters).length * inflate(9, state.year) * quarterTaxFactor(state);
  state.cash -= taxes;
  record.expenses.taxes = taxes;

  const service = serviceDebt(state);
  record.expenses.interest = service.entries.reduce((s, e) => s + e.interest, 0);
  record.expenses.principal = service.entries.reduce((s, e) => s + Math.min(e.principalDue, e.paid), 0);
  record.settle.debtService = service;
  if (service.unpaid > 0.5) {
    record.notes.push(
      `$${Math.round(service.unpaid).toLocaleString()} of interest could not be paid and was added to the principal.`
    );
  }

  // If the account is overdrawn, something has to give.
  if (state.cash < 0) {
    const need = -state.cash;
    record.settle.shortfall = need;

    // First, sell stock. It is the fastest thing to turn into money and the
    // reason mixed farms bent where grain farms broke.
    let raised = 0;
    for (const [id, count] of Object.entries(state.livestock)) {
      if (raised >= need || !count) continue;
      const each = interpAnchors(LIVESTOCK_PRICING[id], state.year);
      const sell = Math.min(count, Math.ceil((need - raised) / Math.max(1, each)));
      state.livestock[id] = count - sell;
      raised += sell * each;
      if (sell > 0) record.notes.push(`Sold ${sell} ${LIVESTOCK[id].name.toLowerCase()} to meet the bills.`);
    }
    state.cash += raised;
    record.income.forcedStockSale = raised;

    // The store carries you.
    //
    // A farm short at the end of the year ran an account at the general store
    // and settled it when the crop sold. It was not a mortgage and it did not
    // compound at sixteen per cent — it was the ordinary way a cash-poor
    // household bridged a winter, and everyone in the district did it.
    //
    // Routing every small shortfall through commercial credit instead was
    // what produced the spiral: a farm twenty dollars short in November took
    // an interest-bearing note, could not clear it, and was insolvent inside
    // three years.
    const storeLimit = inflate(45, state.year) + Math.max(0, netWorth(state)) * 0.03;
    if (state.cash < 0 && -state.cash <= storeLimit) {
      const carried = -state.cash;
      state.cash = 0;
      state.storeAccount = (state.storeAccount || 0) + carried;
      record.income.storeCredit = carried;
      record.notes.push(
        `$${Math.round(carried).toLocaleString()} carried on the store account until the crop is sold.`
      );
    }

    // The store account is settled out of the next year that can afford it.
    if (state.storeAccount > 0 && state.cash > state.storeAccount) {
      state.cash -= state.storeAccount;
      record.expenses.storeAccount = state.storeAccount;
      state.storeAccount = 0;
    }

    // Beyond what the store will carry, it is a loan. A farmer short at the
    // end of a bad year went to the bank or the dealer before they sold land.
    if (state.cash < 0) {
      const sources = creditSourcesAvailable(state);
      const src = sources.find((x) => x.id === 'operating') || sources.find((x) => x.maxTerm <= 3) || sources[0];
      // Cap the rescue. Lending a farm its way out of every shortfall lets
      // capitalised interest compound into a debt no crop could service, which
      // is a spiral rather than a farm.
      const room = creditLimit(state);
      const ceiling = Math.max(0, netWorth(state) * 0.25);
      const want = Math.min(-state.cash * 1.15, room, ceiling);
      if (src && want > 1) {
        const r = borrow(state, { amount: want, sourceId: src.id, termYears: src.maxTerm });
        if (r.ok) {
          record.income.emergencyCredit = want;
          record.notes.push(
            `Short at the end of the year. $${Math.round(want).toLocaleString()} carried on ` +
              `${src.name.toLowerCase()} at ${(r.rate * 100).toFixed(1)}%.`
          );
        }
      }
    }

    // Only then land, at a distress price, because there is nothing else left.
    if (state.cash < 0) {
      const sale = forcedLandSale(state, -state.cash);
      if (sale.sold.length) {
        record.income.forcedLandSale = sale.raised;
        record.notes.push(
          `Nothing left to sell but ground: ${sale.sold.length} quarter` +
            `${sale.sold.length > 1 ? 's went' : ' went'} to meet the bills.`
        );
      }
    }
  }

  const solvency = assessSolvency(state, {
    unpaidInterest: service.unpaid,
    // LAND only. Selling stock in a bad autumn is ordinary farm practice —
    // it is what mixed farming is for — and counting it as distress made
    // every hard year a step toward foreclosure.
    soldUnderDuress: record.income.forcedLandSale || 0,
  });
  record.settle.solvency = solvency;

  if (solvency.foreclosing) {
    state.status = STATUS.RUINED;
    const why = solvency.couldNotPay
      ? 'The interest could not be met and the lender called the mortgage.'
      : solvency.underwater
        ? 'The farm owed more than everything on it was worth.'
        : 'Year after year of selling something to make the payment, until there was nothing left to sell.';
    state.outcome = {
      kind: 'foreclosed',
      year: state.year,
      generation: state.family.generation,
      reason: `${why} ${solvency.years} years of it.`,
    };
    record.notes.push(state.outcome.reason);
  } else if (solvency.insolvent) {
    const left = solvency.grace + 1 - solvency.years;
    record.notes.push(
      solvency.couldNotPay
        ? `Interest went unpaid and was added to the principal. ${left} more year${left === 1 ? '' : 's'} like this and the lender can act.`
        : `Something had to be sold to make the payments. ${left} more year${left === 1 ? '' : 's'} like this and the lender can act.`
    );
  }
}

function quarterTaxFactor(state) {
  return 1;
}

// ---------------------------------------------------------------------------
// Phase 5b: winter and family
// ---------------------------------------------------------------------------

function phaseWinter(state, record, plan) {
  const rng = streamFor(state.seed, state.year, 'winter');
  if (state.status !== STATUS.ACTIVE) return;

  // --- feed the stock -------------------------------------------------------
  const required = feedRequired(state);
  const conditions = state.yearConditions || neutralConditions();
  if (conditions.feedDemandMult) {
    required.hay *= conditions.feedDemandMult;
    required.grain *= conditions.feedDemandMult;
  }
  const grazed = grazingCapacity(state);
  required.hay = Math.max(0, required.hay - grazed * 0.6);

  const fed = consumeFeed(state, required);
  record.winter.feed = { required, ...fed };

  if (fed.hayShort > 0.5 || fed.grainShort > 5) {
    // Short of feed, animals are sold in November at whatever they bring.
    const shortfallRatio = clamp(
      (fed.hayShort / Math.max(1, required.hay) + fed.grainShort / Math.max(1, required.grain)) / 2, 0, 1
    );
    let soldTotal = 0;
    for (const [id, count] of Object.entries(state.livestock)) {
      if (!count) continue;
      const sell = Math.ceil(count * shortfallRatio * 0.7);
      if (sell <= 0) continue;
      const each = interpAnchors(LIVESTOCK_PRICING[id], state.year) * 0.75; // everyone is selling
      state.livestock[id] = count - sell;
      state.cash += each * sell;
      soldTotal += sell;
    }
    if (soldTotal > 0) {
      record.income.feedShortSale = (record.income.feedShortSale || 0);
      record.notes.push(
        `Short of winter feed: ${soldTotal} head sold in November at what the buyers felt like paying.`
      );
    }
  }

  // --- storage --------------------------------------------------------------
  const spoil = applySpoilage(state);
  record.winter.storage = spoil;
  if (spoil.overflow > 50) {
    record.notes.push(
      `${Math.round(spoil.overflow)} bushels would not fit in the bins and went outside. Much of it will not be worth selling.`
    );
  }

  // --- the land rests, or does not ------------------------------------------
  for (const q of playerQuarters(state.quarters)) {
    const c = CROPS[q.use];
    if (!c) continue;
    // Guard the ratio: a quarter that was never seeded has 0 seeded acres, and
    // 0/0 or undefined/n would put NaN into fertility, where it would silently
    // make every future harvest on this quarter NaN.
    const seeded = Number.isFinite(q.seededAcres) ? q.seededAcres : 0;
    const brokenBase = Math.max(1, q.brokenAcres || 1);
    let delta = -(c.fertilityDraw || 0) * (seeded / brokenBase);
    if (c.fertilityRestore) delta += c.fertilityRestore;
    // Manure from the farm's own animals, and bought fertilizer.
    const stockUnits = Object.values(state.livestock).reduce((s, v) => s + v, 0);
    if (state.technologies.includes('manureSpreading') && stockUnits > 0) {
      delta += Math.min(0.02, stockUnits / 400);
    }
    for (const t of state.technologies) {
      const def = TECHNOLOGIES[t];
      if (def?.effect?.fertilityOffset) delta += def.effect.fertilityOffset;
    }
    const next = q.fertility + delta;
    q.fertility = Number.isFinite(next) ? clamp(next, 0.12, 1.05) : q.fertility;

    // Weeds build on ground that is cropped and are knocked back by a year of
    // summerfallow worked black all summer — and, from 1947, by chemistry.
    const control = weedControlLevel(state);
    let weeds = q.weedPressure ?? 0.12;
    if (q.use === 'fallow') weeds -= 0.4;
    else if (q.use === 'pasture' || q.use === 'hay') weeds -= 0.05;
    else weeds += 0.09 * (1 - control);
    q.weedPressure = clamp(weeds, 0, 1);

    q.seededAcres = 0;
  }

  // --- machinery ages -------------------------------------------------------
  // Farm machinery was repaired, welded, shimmed and kept going, not run to
  // destruction and thrown away. Condition therefore decays TOWARD a
  // serviceable floor rather than to zero — the annual upkeep charge is what
  // that maintenance costs.
  //
  // Straight-line decay to nothing meant a walking plow became useless after
  // fifteen years, capacity collapsed, and farms spent decades breaking two
  // acres a year on 160 they owned. Nobody farmed like that because nobody
  // let a plow get to that state.
  const mechanical = state.operatorTraits?.includes('mechanical');
  const FLOOR = 0.45;
  for (const item of state.equipment) {
    const e = equipDef(item.type);
    const life = e.lifespanYears || 20;
    let wear = 1 / life;
    if (mechanical) wear *= 0.7;
    const cond = item.condition ?? 1;
    // Approach the floor asymptotically; upkeep holds it there.
    item.condition = clamp(FLOOR + (cond - FLOOR) * (1 - wear * 1.6), FLOOR * 0.6, 1);
  }
  // Animals are the exception: they age out and have to be replaced.
  for (const item of state.equipment) {
    const e = equipDef(item.type);
    if (e.category !== 'power' || !e.feed) continue;
    const age = state.year - (item.yearBought || state.year);
    if (age > (e.lifespanYears || 12)) {
      item.count = Math.max(0, (item.count || 1) - 1);
      if (item.count === 0) {
        record.notes.push(`The ${e.name.toLowerCase()} is worn out with age and gone.`);
      }
    }
  }
  state.equipment = state.equipment.filter((i) => (i.count ?? 1) > 0);

  // Horses breed and replace themselves — that is why horse power compounded
  // and tractor power did not — but a farm kept the teams it had work for and
  // sold the rest. Every surplus team eats 55 bushels of oats a year, and an
  // uncapped herd was eating more than half the crop by the 1890s.
  const draftNeeded = ['till', 'seed', 'harvest']
    .map((op) => bestImplement(state, op))
    .filter((i) => i && !i.byHand && !i.selfPowered)
    .reduce((m, i) => Math.max(m, i.draftNeeded || 0), 0);

  const horses = state.equipment.find((i) => i.type === 'horses');
  if (horses && rng.chance(0.25)) horses.count = (horses.count || 1) + 1;

  // Sell down surplus draft. Keep enough to pull the biggest implement with a
  // margin, and at least one unit while there is still horse-drawn work.
  if (draftNeeded > 0) {
    const wanted = draftNeeded * 1.35;
    for (const item of state.equipment) {
      const e = equipDef(item.type);
      if (e.category !== 'power' || !e.feed) continue;
      while ((item.count || 1) > 1 && draftPower(state) - e.draft >= wanted) {
        item.count -= 1;
        const price = equipmentPrice(state, e) * 0.5;
        state.cash += price;
        record.income.surplusStockSale = (record.income.surplusStockSale || 0) + price;
      }
    }
  }

  // --- livestock increase, bounded by what the place can carry --------------
  const stockman = state.operatorTraits?.includes('stockman');
  for (const [id, count] of Object.entries(state.livestock)) {
    if (!count) continue;
    const l = LIVESTOCK[id];
    if (!l) continue;
    const born = Math.floor(count * l.breedRate * 0.5 * (stockman ? 1.15 : 1));
    const died = Math.floor(count * l.mortality * (stockman ? 0.7 : 1));
    state.livestock[id] = Math.max(0, count + born - died);
  }

  // Species that are limited by a building rather than by grass are trimmed to
  // their own ceiling first.
  for (const id of Object.keys(state.livestock)) {
    const cap = speciesCap(state, id);
    const have = state.livestock[id] || 0;
    if (Number.isFinite(cap) && have > cap) {
      const n = have - cap;
      const each = interpAnchors(LIVESTOCK_PRICING[id], state.year);
      state.livestock[id] = cap;
      state.cash += each * n;
      record.income.surplusStockSale = (record.income.surplusStockSale || 0) + each * n;
    }
  }

  // Increase beyond the farm's carrying capacity is sold, which is exactly
  // what a farmer did every fall: you keep what you can winter and the rest
  // goes to town. Without this the herd compounds without limit.
  const capacity = carryingCapacity(state);
  let units = livestockUnits(state);
  if (units > capacity) {
    const keepShare = capacity / units;
    let sold = 0;
    let proceeds = 0;
    // Sell the increase, heaviest feeders first.
    for (const id of ['hogs', 'sheep', 'beefCow', 'dairyCow', 'chickens']) {
      const have = state.livestock[id] || 0;
      if (!have) continue;
      const keep = Math.max(id === 'chickens' ? 8 : 1, Math.floor(have * keepShare));
      const n = have - keep;
      if (n <= 0) continue;
      const each = interpAnchors(LIVESTOCK_PRICING[id], state.year);
      state.livestock[id] = keep;
      proceeds += each * n;
      sold += n;
      if (livestockUnits(state) <= capacity) break;
    }
    if (sold > 0) {
      state.cash += proceeds;
      record.income.surplusStockSale = (record.income.surplusStockSale || 0) + proceeds;
      record.notes.push(
        `${sold} head sold off — the place will winter about ${Math.round(capacity)} animal units ` +
          'and there is no feed or room for more.'
      );
    }
  }

  // --- prove up the homestead ----------------------------------------------
  if (!state.flags.homesteadProved) {
    const home = quarterById(state.quarters, state.homeQuarterId);
    const years = state.year - (home?.yearAcquired ?? state.year);
    if (home && home.owner === 'player' && years >= PROVE_UP_YEARS && home.brokenAcres >= PROVE_UP_ACRES) {
      state.flags.homesteadProved = true;
      record.notes.push(
        `The homestead is proved up: ${PROVE_UP_YEARS} years' residence and ${Math.round(home.brokenAcres)} acres broken. ` +
          'The patent is issued and the land is yours outright.'
      );
    }
  }

  // --- the family -----------------------------------------------------------
  const famEvents = advanceFamily(state, rng);
  record.family = famEvents;
  for (const e of famEvents) {
    state.log.push({ year: state.year, kind: e.kind, text: e.text });
    if (e.kind === 'marriage') applyDowry(state, record, rng, e);
  }

  // --- succession -----------------------------------------------------------
  const op = operator(state);

  // A widow who took the farm on to keep it for the children hands it over
  // when one of them is grown and wants it. Without this the caretaker simply
  // becomes the permanent operator and the line stops advancing.
  if (op && !op.deathYear && op.role === 'spouse' && !op.parentIds?.length) {
    const grown = heirCandidates(state).find(
      (c) => c.id !== op.id && c.wantsFarm === true && c.parentIds?.length &&
        age(state.year, c) >= 24
    );
    if (grown) op.wantsRetire = true;
  }

  if (op && !op.deathYear && age(state.year, op) >= RETIREMENT_AGE && !op.wantsRetire) {
    // An operator past retirement age hands over when there is someone to hand
    // over to. Staying on past seventy is possible and it costs the farm.
    op.wantsRetire = plan.retire !== false;
  }
  const need = needsSuccession(state);
  if (need.needed) {
    const result = runSuccession(state, rng, { reason: need.reason, deceased: need.deceased });
    record.winter.succession = { reason: need.reason, log: result.log, ok: result.ok };
    for (const line of result.log) state.log.push({ year: state.year, kind: 'succession', text: line });
  }

  // --- the land market ------------------------------------------------------
  // The CPR's land grant was largely sold off by about 1910, and homestead
  // entries were essentially finished by then too. After that the only way a
  // prairie farm got bigger was when a neighbour quit — which is why farms
  // grew in the crises of the 1880s, the 1930s and the 1980s and barely moved
  // in between. Without this the township is simply a shop and one family
  // buys most of it.
  {
    const rngL = streamFor(state.seed, state.year, 'landmarket');
    for (const q of state.quarters) {
      if (q.owner === 'railway' || q.owner === 'school') {
        // Company and school land passes into settlers' hands over time.
        const settleChance = state.year < 1885 ? 0.04 : state.year < 1900 ? 0.11
          : state.year < 1912 ? 0.18 : 0.35;
        if (rngL.chance(settleChance)) {
          q.owner = 'neighbour';
          q.ownerName = rngL.pick(NEIGHBOUR_NAMES(state));
          q.brokenAcres = rngL.range(20, 70);
          q.use = 'wheat';
        }
      } else if (q.owner === 'neighbour' && !q.forSale && state.year >= 1945 && rngL.chance(consolidationRate(state.year))) {
        // The prairies emptied out. Manitoba had roughly 58,000 farms in 1941
        // and half that by 1991 — the survivors farmed the difference. Without
        // this the land market closes in 1910 and farms are stuck at a size
        // that cannot carry a $100,000 combine, which is why almost nobody
        // reached 2000.
        q.forSale = true;
        q.forSaleSince = state.year;
      } else if (q.owner === null && state.year > 1905 && rngL.chance(0.3)) {
        // Unclaimed homestead land does not stay unclaimed forever.
        q.owner = 'neighbour';
        q.ownerName = rngL.pick(NEIGHBOUR_NAMES(state));
        q.brokenAcres = rngL.range(15, 55);
        q.use = 'wheat';
      }
      // A quarter that came up for sale and was not bought is taken by
      // somebody else. You do not get to wait for a better year.
      if (q.forSale && q.owner === 'neighbour') {
        if (q.forSaleSince == null) q.forSaleSince = state.year;
        else if (state.year - q.forSaleSince >= 2 || rngL.chance(0.45)) {
          q.forSale = false;
          q.forSaleSince = null;
          q.ownerName = rngL.pick(NEIGHBOUR_NAMES(state));
        }
      }
    }
  }

  // --- neighbours in trouble sell out --------------------------------------
  if (state.neighbourDistress) {
    const rngN = streamFor(state.seed, state.year, 'neighbours');
    const forSale = [];
    for (const q of state.quarters) {
      if (q.owner !== 'neighbour') continue;
      if (rngN.chance(state.neighbourDistress * 0.3)) {
        q.forSale = true;
        forSale.push(q.id);
      }
    }
    if (forSale.length) {
      record.notes.push(
        `${forSale.length} quarter${forSale.length > 1 ? 's in the district are' : ' in the district is'} coming up for sale. ` +
          'Somebody’s bad year is how a farm gets bigger.'
      );
    }
    state.neighbourDistress = 0;
  }
}

function applyDowry(state, record, rng, e) {
  const scale = priceIndex(state.year) / 100;
  if (e.dowry === 'cash') {
    const amount = Math.round(rng.float(60, 320) * scale);
    state.cash += amount;
    record.income.dowry = (record.income.dowry || 0) + amount;
    record.notes.push(`The marriage brought $${amount.toLocaleString()} from her people.`);
  } else if (e.dowry === 'livestock') {
    const id = rng.pick(['dairyCow', 'beefCow', 'chickens']);
    const n = id === 'chickens' ? rng.range(8, 20) : rng.range(1, 3);
    state.livestock[id] = (state.livestock[id] || 0) + n;
    record.notes.push(`The marriage brought ${n} ${LIVESTOCK[id].name.toLowerCase()}.`);
  } else if (e.dowry === 'land') {
    const free = state.quarters.filter((q) => q.owner === 'neighbour' && !q.forSale);
    const q = rng.pick(free);
    if (q) {
      q.owner = 'player'; q.ownerName = 'you';
      q.yearAcquired = state.year; q.acquiredBy = 'marriage';
      record.notes.push(`${q.quarter} ${q.section} came into the family with the marriage. This is how farms grow.`);
    }
  } else if (e.dowry === 'connections') {
    state.modifiers.creditEase = (state.modifiers.creditEase ?? 1) * 1.25;
    record.notes.push('Her family is known to the bank, and it shows in what they will advance.');
  }
}

// ---------------------------------------------------------------------------

/**
 * How often a neighbour gives up, by era. The post-war decades emptied the
 * countryside steadily, and the debt crisis of the 1980s emptied it fast.
 */
function consolidationRate(year) {
  if (year >= 1980 && year <= 1990) return 0.055; // the farm debt crisis
  if (year >= 1960) return 0.035;
  if (year >= 1945) return 0.025;
  return 0;
}

/** Surnames of families already in the district, for a quarter changing hands. */
function NEIGHBOUR_NAMES(state) {
  const existing = [...new Set(
    state.quarters.filter((q) => q.owner === 'neighbour' && q.ownerName).map((q) => q.ownerName)
  )].filter((n) => n !== 'sold' && !n.includes('estate'));
  return existing.length ? existing : [state.family.surname === 'Bell' ? 'Craik' : 'Bell'];
}

function quarterPurchasePrice(state, q) {
  const base = landPrice(state.year) * (state.regionDef.landValueFactor ?? 1);
  let price = base * quarterValueFactor(q) * ACRES_PER_QUARTER;
  if (q.tenure === 'railway' || q.tenure === 'hbc') price *= 1.15; // the company knows what it has
  if (q.brokenAcres === 0) price *= rawLandDiscount(state.year);
  if (q.forSale) price *= 0.88; // a forced sale is a buyer's market
  return price * (state.modifiers?.landMult ?? 1);
}

function sumValues(obj) {
  let s = 0;
  for (const [k, v] of Object.entries(obj)) if (k !== 'total' && typeof v === 'number') s += v;
  return s;
}

export { quarterPurchasePrice };
