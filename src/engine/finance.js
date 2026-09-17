// Money: borrowing, servicing debt, and what happens when it cannot be served.
//
// Credit in this game is period-correct. A homesteader in 1880 had no mortgage
// market at all and borrowed from the implement dealer and the storekeeper at
// rates that would be illegal later. The Manitoba Farm Loans Association (1917),
// the Canadian Farm Loan Board (1929), the Farm Credit Corporation (1959) and
// the 1967 Bank Act each widened what was possible, and the engine gates them
// by year.

import { borrowingRate, creditLimit, totalDebt, netWorth, landValue, debtService } from './derive.js';
import { playerQuarters, quarterValueFactor, ACRES_PER_QUARTER } from './land.js';
import { landPrice } from '../data/prices.data.js';

let debtSeq = 1;
export function resetDebtIds() { debtSeq = 1; }

export const CREDIT_SOURCES = [
  { id: 'dealer', name: 'Implement dealer note', from: 1875, to: 1935, maxTerm: 3, ratePremium: 0.045,
    note: 'A note against the machine itself, due in three falls. The dealer takes the machine back if you miss.' },
  { id: 'storekeeper', name: 'Store credit', from: 1875, to: 1950, maxTerm: 1, ratePremium: 0.06, maxAmount: 400,
    note: 'Carried on the books at the general store until the crop is sold. Everyone in the district knows your balance.' },
  { id: 'loanCompany', name: 'Mortgage loan company', from: 1882, to: 1940, maxTerm: 10, ratePremium: 0.02,
    note: 'An eastern loan company against the land. They do not know you and they do not need to.' },
  { id: 'farmLoans', name: 'Manitoba Farm Loans Association', from: 1917, to: 1960, maxTerm: 20, ratePremium: -0.005,
    note: 'Provincial long-term credit on farm land, at terms set for a farm rather than a bank.' },
  { id: 'fcc', name: 'Farm Credit Corporation', from: 1959, to: 2000, maxTerm: 25, ratePremium: -0.01,
    note: 'Federal long-term farm credit. Amortised over a working life instead of a business cycle.' },
  { id: 'bank', name: 'Chartered bank mortgage', from: 1967, to: 2000, maxTerm: 20, ratePremium: 0.005,
    note: 'The banks came to farm lending in 1967 and came enthusiastically.' },
  { id: 'operating', name: 'Operating loan', from: 1920, to: 2000, maxTerm: 1, ratePremium: 0.015,
    note: 'Seed, fuel and fertilizer in spring, paid off out of the fall cheque. Or not.' },
];

export function creditSourcesAvailable(state) {
  return CREDIT_SOURCES.filter((s) => state.year >= s.from && state.year <= s.to);
}

/** Take a loan. Returns {ok} or {ok:false, reason} — never silently partial. */
export function borrow(state, { amount, sourceId, termYears }) {
  const source = CREDIT_SOURCES.find((s) => s.id === sourceId);
  if (!source) return { ok: false, reason: `No such lender: ${sourceId}` };
  if (state.year < source.from || state.year > source.to) {
    return { ok: false, reason: `${source.name} is not available in ${state.year}.` };
  }
  if (amount <= 0) return { ok: false, reason: 'Nothing to borrow.' };
  const limit = creditLimit(state);
  if (amount > limit) {
    return { ok: false, reason: `${source.name} will advance at most $${Math.floor(limit)} against what you have.` };
  }
  if (source.maxAmount && amount > source.maxAmount) {
    return { ok: false, reason: `${source.name} does not carry more than $${source.maxAmount}.` };
  }
  const term = Math.min(termYears || source.maxTerm, source.maxTerm);
  const rate = borrowingRate(state) + source.ratePremium;
  state.debts.push({
    id: `d${debtSeq++}`,
    source: sourceId,
    sourceName: source.name,
    principal: amount,
    original: amount,
    rate,
    termYears: term,
    yearTaken: state.year,
  });
  state.cash += amount;
  return { ok: true, rate, term };
}

export function repay(state, debtId, amount) {
  const d = state.debts.find((x) => x.id === debtId);
  if (!d) return { ok: false, reason: 'No such debt.' };
  const pay = Math.min(amount, d.principal, state.cash);
  if (pay <= 0) return { ok: false, reason: 'No cash available to put against it.' };
  d.principal -= pay;
  state.cash -= pay;
  if (d.principal < 0.01) state.debts = state.debts.filter((x) => x.id !== d.id);
  return { ok: true, paid: pay };
}

/**
 * Service the year's debt. If cash will not cover it, the shortfall is rolled
 * into new debt at a penalty — which is exactly how farms got into trouble, one
 * manageable year at a time.
 */
export function serviceDebt(state) {
  const due = debtService(state);
  const entries = [];
  let paid = 0;
  let unpaid = 0;

  for (const d of state.debts) {
    const interest = d.principal * d.rate * (state.modifiers?.interestMult ?? 1);
    const yearsLeft = d.termYears > 0 ? Math.max(1, d.termYears - (state.year - d.yearTaken)) : 0;
    const principalDue = yearsLeft > 0 ? d.principal / yearsLeft : 0;

    // Interest is paid first, then whatever is left goes against principal.
    const payInterest = Math.min(interest, Math.max(0, state.cash));
    state.cash -= payInterest;
    const payPrincipal = Math.min(principalDue, Math.max(0, state.cash));
    state.cash -= payPrincipal;
    paid += payInterest + payPrincipal;

    // Principal falls by what was actually paid against it. Unpaid principal
    // is NOT added back on — it is already the principal, and adding it again
    // doubles the debt every year, which is a spiral rather than a farm.
    d.principal -= payPrincipal;

    // Unpaid INTEREST capitalises, with a small penalty. This is the real
    // compounding that took farms, and it is bounded by the interest rate.
    const shortInterest = interest - payInterest;
    if (shortInterest > 0.01) {
      d.principal += shortInterest * 1.05;
      unpaid += shortInterest;
    }

    if (d.principal < 0.01) d.principal = 0;
    entries.push({
      debtId: d.id, source: d.sourceName, interest, principalDue,
      paid: payInterest + payPrincipal, short: shortInterest,
    });
  }
  state.debts = state.debts.filter((d) => d.principal > 0.01);
  return { due, paid, unpaid, entries };
}

/**
 * Can the farm still stand? Insolvency alone is not ruin — a bad year is a bad
 * year. Sustained insolvency past the tier's grace period is.
 */
export function assessSolvency(state) {
  const worth = netWorth(state);
  const debt = totalDebt(state);
  const insolvent = worth < 0 || (debt > 0 && state.cash < 0);
  if (insolvent) {
    state.insolventYears = (state.insolventYears || 0) + 1;
  } else {
    state.insolventYears = 0;
  }
  const grace = state.difficultyDef.foreclosureGraceYears;
  return {
    insolvent,
    years: state.insolventYears || 0,
    foreclosing: (state.insolventYears || 0) > grace,
    netWorth: worth,
    grace,
  };
}

/**
 * Sell land under duress. Returns what was raised and which quarters went.
 * Land sold in a forced sale goes at a discount, because everyone knows.
 */
export function forcedLandSale(state, amountNeeded) {
  const owned = playerQuarters(state.quarters)
    .filter((q) => q.id !== state.homeQuarterId) // the home quarter goes last
    .sort((a, b) => quarterValueFactor(a) - quarterValueFactor(b)); // worst first
  const base = landPrice(state.year) * (state.regionDef.landValueFactor ?? 1);
  const sold = [];
  let raised = 0;
  for (const q of owned) {
    if (raised >= amountNeeded) break;
    const value = base * quarterValueFactor(q) * ACRES_PER_QUARTER * 0.82; // distress discount
    q.owner = 'neighbour';
    q.ownerName = 'sold';
    q.use = 'wheat';
    raised += value;
    sold.push({ id: q.id, value });
  }
  state.cash += raised;
  return { raised, sold };
}
