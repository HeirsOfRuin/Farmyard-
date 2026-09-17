// Government programs: who qualifies, what they pay, and what they cost.
//
// Everything here is read by the turn pipeline. The point of putting it in one
// place is that a program's eligibility, its payment and its obligations stay
// together — a relief measure that pays out in one file and is forgotten in
// another is how "declared but never consumed" happens, and that has already
// cost this codebase thirty-five dead effects.

import {
  PROGRAMS, PROGRAM_LIST, programsAvailable, taxReliefFor, DISASTER_TAX_DEFERRAL,
} from '../data/programs.data.js';
import { inflate } from '../data/prices.data.js';
import { playerQuarters, ACRES_PER_QUARTER } from './land.js';
import { netWorth, totalDebt, livingCost } from './derive.js';

/** Programs the farm has taken up or enrolled in. */
export function enrolled(state) {
  return state.programs || (state.programs = { joined: [], history: [], nisaBalance: 0 });
}

export function isEnrolled(state, id) {
  return enrolled(state).joined.includes(id);
}

/**
 * Does this farm qualify for a program right now?
 * Returns { ok } or { ok: false, reason } — never a bare false, because a
 * program the player cannot have should say why.
 */
export function eligibility(state, p, context = {}) {
  if (state.year < p.from || state.year > p.to) {
    return { ok: false, reason: `not available in ${state.year}` };
  }
  if (p.once && enrolled(state).history.some((h) => h.id === p.id)) {
    return { ok: false, reason: 'already paid, once only' };
  }
  if (!p.repeatable && p.kind === 'decision' && isEnrolled(state, p.id)) {
    return { ok: false, reason: 'already taken up' };
  }
  if (p.trigger === 'cropFailure') {
    const ratio = context.yieldRatio ?? 1;
    if (ratio > 1 - (p.severity ?? 0.5)) {
      return { ok: false, reason: 'the crop was not short enough to qualify' };
    }
  }
  if (p.trigger === 'destitute') {
    const broke = state.cash < livingCost(state) * 0.35 && netWorth(state) < totalDebt(state) * 1.6;
    if (!broke) return { ok: false, reason: 'the farm is not destitute, and they check' };
  }
  if (p.availableWhen === 'distressed') {
    const distress = state.distressYears || 0;
    if (distress < 1 && totalDebt(state) < netWorth(state) * 0.4) {
      return { ok: false, reason: 'for farms actually in trouble' };
    }
  }
  return { ok: true };
}

/** Acres the farm had in crop, which is what most programs pay on. */
function croppedAcres(state) {
  return playerQuarters(state.quarters)
    .filter((q) => !['idle', 'pasture', 'bush', 'fallow'].includes(q.use))
    .reduce((s, q) => s + q.brokenAcres, 0);
}

/**
 * Run every automatic program for the year. Called from the market phase, so
 * payments land alongside the crop cheque where a farmer would have seen them.
 */
export function runAutomaticPrograms(state, record, context = {}) {
  const out = [];
  for (const p of programsAvailable(state.year)) {
    if (p.kind !== 'automatic') continue;
    const elig = eligibility(state, p, context);
    if (!elig.ok) continue;

    if (p.id === 'fuelTaxExemption') continue; // applied against upkeep, not paid out

    let amount = 0;
    if (p.perAcre) {
      const acres = Math.min(croppedAcres(state), p.maxAcres ?? Infinity);
      amount = inflate(p.perAcre, state.year) * acres;
    } else if (p.perOwnedAcre) {
      amount = inflate(p.perOwnedAcre, state.year) * playerQuarters(state.quarters).length * ACRES_PER_QUARTER;
    } else if (p.perAdult) {
      const adults = state.family.members.filter((m) => !m.deathYear && !m.away).length;
      amount = inflate(p.perAdult, state.year) * adults;
    }
    if (amount <= 0.5) continue;

    if (p.asDebt) {
      // Seed relief was an advance, not a gift, and the municipality came back
      // for it. Modelling it as free money would be the wrong lesson entirely.
      state.debts.push({
        id: `relief${state.year}`,
        source: 'relief',
        sourceName: `${p.name} (${state.year})`,
        principal: amount, original: amount,
        rate: p.rate ?? 0.06, termYears: p.termYears ?? 3,
        yearTaken: state.year,
      });
      state.cash += amount;
      record.income.seedRelief = (record.income.seedRelief || 0) + amount;
      record.notes.push(
        `${p.name}: $${Math.round(amount).toLocaleString()} advanced against the crop. It is a loan.`
      );
    } else {
      state.cash += amount;
      record.income.programPayment = (record.income.programPayment || 0) + amount;
      record.notes.push(`${p.name}: $${Math.round(amount).toLocaleString()}.`);
    }

    enrolled(state).history.push({ id: p.id, year: state.year, amount });
    out.push({ id: p.id, name: p.name, amount, asDebt: !!p.asDebt });
  }

  // The PFAA levy: everyone paid one per cent on grain sales, whether they ever
  // collected or not. A safety net somebody else funds is not a safety net.
  const pfaa = PROGRAMS.pfaa;
  if (state.year >= pfaa.from && state.year <= pfaa.to) {
    const levy = (record.income.grain || 0) * pfaa.levyRate;
    if (levy > 0.5) {
      state.cash -= levy;
      record.expenses.pfaaLevy = levy;
    }
  }

  return out;
}

/** Take up or enrol in a program. Returns {ok} or {ok:false, reason}. */
export function takeUpProgram(state, id, record) {
  const p = PROGRAMS[id];
  if (!p) return { ok: false, reason: `No such program: ${id}` };
  if (p.kind !== 'decision') return { ok: false, reason: `${p.name} is not something you apply for.` };
  const elig = eligibility(state, p);
  if (!elig.ok) return { ok: false, reason: `${p.name}: ${elig.reason}` };

  if (p.cost) {
    const share = inflate(p.cost, state.year) * (1 - (p.costShare ?? 0));
    if (state.cash < share) {
      return { ok: false, reason: `Your share of ${p.name} is $${Math.round(share).toLocaleString()}.` };
    }
    state.cash -= share;
    if (record) record.expenses.improvements = (record.expenses.improvements || 0) + share;
  }

  if (id === 'debtReview') {
    // A write-down, and a reputation that follows you.
    const before = totalDebt(state);
    for (const d of state.debts) d.principal *= 1 - p.writeDown;
    state.storeAccount = (state.storeAccount || 0) * (1 - p.writeDown);
    state.creditPenaltyUntil = state.year + p.creditPenaltyYears;
    const after = totalDebt(state);
    if (record) {
      record.notes.push(
        `Debt review: $${Math.round(before - after).toLocaleString()} written down. ` +
          `No lender will look at you properly until ${state.creditPenaltyUntil}.`
      );
    }
    enrolled(state).history.push({ id, year: state.year, amount: before - after });
    return { ok: true, writtenDown: before - after };
  }

  enrolled(state).joined.push(id);
  if (record) record.notes.push(`Took up ${p.name}.`);
  return { ok: true };
}

/** Annual premiums and payouts for programs the farm is enrolled in. */
export function runEnrolledPrograms(state, record, context = {}) {
  if (!isEnrolled(state, 'safetyNet')) return;
  const p = PROGRAMS.safetyNet;
  const acres = croppedAcres(state);
  const premium = inflate(p.premiumPerAcre, state.year) * acres;

  if (premium > 0.5 && state.cash >= premium) {
    state.cash -= premium;
    record.expenses.safetyNetPremium = premium;
    // Ottawa matches what you put in, and it sits in the account.
    enrolled(state).nisaBalance += premium * (1 + p.matchRate);
  }

  // Draw on it when the year has gone badly.
  const ratio = context.yieldRatio ?? 1;
  const balance = enrolled(state).nisaBalance;
  if (ratio < p.revenueFloor && balance > 1) {
    const draw = Math.min(balance, balance * (1 - ratio));
    enrolled(state).nisaBalance -= draw;
    state.cash += draw;
    record.income.safetyNetDraw = draw;
    record.notes.push(
      `Drew $${Math.round(draw).toLocaleString()} out of the stabilisation account. ` +
        'That is what it was for.'
    );
  }
}

/**
 * The real tax factor, replacing a stub that returned a hardcoded 1.
 * Municipal and school taxes on farm land, less whatever relief the era offers,
 * less a deferral in a year the farm was hit hard.
 */
export function quarterTaxFactor(state, context = {}) {
  let factor = 1;
  const relief = taxReliefFor(state.year);
  if (relief) factor *= relief.factor;
  if ((context.yieldRatio ?? 1) < 0.4) factor *= DISASTER_TAX_DEFERRAL;
  return factor;
}

export function taxReliefLabel(state) {
  const r = taxReliefFor(state.year);
  return r ? r.label : null;
}

/** Fuel tax exemption, applied against machinery upkeep. */
export function upkeepReliefFactor(state) {
  const p = PROGRAMS.fuelTaxExemption;
  if (state.year < p.from || state.year > p.to) return 1;
  return 1 - p.upkeepRelief;
}

/** What the farm could take up right now, for the UI and the bot. */
export function offeredPrograms(state, context = {}) {
  return programsAvailable(state.year)
    .filter((p) => p.kind === 'decision')
    .map((p) => ({ program: p, ...eligibility(state, p, context) }));
}

export { PROGRAMS, PROGRAM_LIST };
