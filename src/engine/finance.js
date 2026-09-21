// Money: borrowing, servicing debt, and what happens when it cannot be served.
//
// Credit in this game is period-correct. A homesteader in 1880 had no mortgage
// market at all and borrowed from the implement dealer and the storekeeper at
// rates that would be illegal later. The Manitoba Farm Loans Association (1917),
// the Canadian Farm Loan Board (1929), the Farm Credit Corporation (1959) and
// the 1967 Bank Act each widened what was possible, and the engine gates them
// by year.

import {
  borrowingRate, creditLimit, totalDebt, netWorth, landValue, equipmentValue, debtService,
} from './derive.js';
import { playerQuarters, quarterValueFactor, ACRES_PER_QUARTER } from './land.js';
import { landPrice, inflate } from '../data/prices.data.js';

/**
 * Allocate a debt id from the GAME's own counter.
 *
 * This deliberately does not use a module-level counter. The batch runner
 * plays sixty games in one process, and a module counter would give the same
 * seed different ids depending on what ran before it — which breaks the
 * determinism every balance measurement depends on, silently, and only shows
 * up as two identical runs serializing differently.
 */
function nextDebtId(state) {
  state.nextDebtId = (state.nextDebtId || 0) + 1;
  return `d${state.nextDebtId}`;
}

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
  // An implement dealer's note is secured on the implement itself, so a small
  // one is available even to a farm the land-based limit would refuse. That is
  // precisely what these notes existed for, and without it a farm whose plow
  // wore out simply wound down with no way to replace a fifty dollar tool.
  const limit = source.id === 'dealer'
    ? Math.max(creditLimit(state), inflate(60, state.year))
    : creditLimit(state);
  if (amount > limit) {
    return { ok: false, reason: `${source.name} will advance at most $${Math.floor(limit)} against what you have.` };
  }
  if (source.maxAmount && amount > source.maxAmount) {
    return { ok: false, reason: `${source.name} does not carry more than $${source.maxAmount}.` };
  }
  const term = Math.min(termYears || source.maxTerm, source.maxTerm);
  const rate = borrowingRate(state) + source.ratePremium;
  state.debts.push({
    id: nextDebtId(state),
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
 * Can the farm still stand?
 *
 * Tested on DEBT SERVICE, not on net worth. Farms did not fail because their
 * assets fell below their liabilities — a section of land is worth a great
 * deal and its owner can still be finished. They failed because they could not
 * make the payments, and the lender moved on an asset that was perfectly
 * valuable. That is what happened in 1931 and again in 1982.
 *
 * Testing net worth instead made every farm invincible the moment it owned
 * enough land: foreclosures stopped entirely after 1920 and the Depression and
 * the interest shock cost nobody the farm, which is precisely backwards.
 */
export function assessSolvency(state, { unpaidInterest = 0, soldUnderDuress = 0 } = {}) {
  const worth = netWorth(state);
  const debt = totalDebt(state);
  const service = debtService(state);

  // Three ways to be in trouble, any of which counts as a year of distress.
  //
  // The thresholds matter more than the list. A lender did not move on a farm
  // that was a few dollars short — partial payments were carried for years,
  // and a farmer selling stock in a bad autumn was a farmer farming, not a
  // farmer failing. Set too tight (missing $3 of interest on a $500 note),
  // this wiped out most of the 1880s and left nothing standing to be tested
  // by the 1930s.
  //
  //   - a SUBSTANTIAL part of the year's interest went unpaid
  //   - LAND had to be sold to meet ordinary obligations
  //   - the farm is genuinely underwater
  const interestDue = service.interest;

  // A lender does not move on a farm over trivial arrears. Where the debt is
  // small against what the place is worth, being short of the interest is a
  // bad year, not the beginning of a foreclosure — the note gets carried and
  // everyone gets on with it. Without this floor a homestead owing $100 could
  // be foreclosed over five dollars of unpaid interest, three years running,
  // and half of all farms were gone by 1887.
  const material = debt > Math.max(0, worth) * 0.15;

  const couldNotPay = material && interestDue > 0 && unpaidInterest > interestDue * 0.35;
  const soldToSurvive = soldUnderDuress > 0;
  const underwater = worth < 0;

  // THE CREDIT CHANNEL, which is how farms were actually lost in 1982 and in
  // 1933 — not by failing to make a payment, but by the security going out
  // from under a payment they were still making. When land fell forty per cent
  // and the bank's loan-to-value went through the roof, the loan was called and
  // the farm was sold although it had never missed a cent.
  //
  // Without this, a farm servicing its debt was untouchable: the 1981 test ran
  // a farm geared to sixty per cent of its assets through prime at 22.75% and
  // it came out with zero years of distress, the same as a farm with no debt
  // at all. A shock that costs the geared farm nothing is not a shock.
  // `creditEase` is a multiplier on normal conditions, and it runs well above 1
  // in a boom — 3.4 in 1979. The gate is therefore "tighter than normal", not
  // an absolute floor: 0.81 through 1981-84 and 0.25 in 1933 are both squeezes,
  // and a threshold set below both of them caught neither.
  const squeeze = (state.modifiers?.creditEase ?? 1) < 0.9;
  const security = landValue(state) + equipmentValue(state) * 0.4;
  const overSecured = squeeze && debt > security * 0.72;

  const distressed = couldNotPay || soldToSurvive || underwater || overSecured;

  if (distressed) {
    state.distressYears = (state.distressYears || 0) + 1;
  } else {
    // One clear year does not wipe the slate — a lender remembers. Recovery
    // is real but it is not instant.
    state.distressYears = Math.max(0, (state.distressYears || 0) - 1);
  }

  const grace = state.difficultyDef.foreclosureGraceYears;
  // Credit conditions decide how patient the lender is. In 1933 and 1982 they
  // were not patient, and the history tables say so.
  const creditEase = state.modifiers?.creditEase ?? 1;
  const effectiveGrace = creditEase < 0.6 ? Math.max(1, grace - 1) : grace;

  return {
    insolvent: distressed,
    underwater,
    couldNotPay,
    soldToSurvive,
    overSecured,
    years: state.distressYears || 0,
    foreclosing: (state.distressYears || 0) > effectiveGrace,
    netWorth: worth,
    grace: effectiveGrace,
    serviceDue: service.total,
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
