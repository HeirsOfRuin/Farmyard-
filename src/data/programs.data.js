// Government programs, relief and tax measures, 1875-2000.
//
// Farming here was never a purely private business. Relief after the frosts of
// the 1880s, the PFRA and the Wheat Board out of the dust of the thirties, the
// Prairie Farm Assistance Act, crop insurance, ad hoc cheques when Washington
// and Brussels fought a subsidy war over prairie heads — the state is in this
// story from the beginning, and leaving it out makes the century harder and
// less true than it was.
//
// `kind: 'automatic'` programs arrive and are reported. `kind: 'decision'`
// programs are chosen, with conditions and obligations attached. Everything
// here is read by src/engine/programs.js; nothing in this file is decoration.

export const PROGRAMS = {
  // ---- AUTOMATIC -------------------------------------------------------
  seedGrainRelief: {
    id: 'seedGrainRelief', name: 'Seed grain relief', kind: 'automatic',
    from: 1878, to: 1910,
    // Municipalities advanced seed after a failure. It was a loan, secured on
    // the crop, and collecting it back was a running sore for twenty years.
    asDebt: true, rate: 0.06, termYears: 3,
    trigger: 'cropFailure', severity: 0.45,
    perAcre: 0.9, // 1875 dollars of seed advanced per cropped acre
    note: 'The municipality will advance seed after a failure. It is a loan, and they do come back for it.',
  },
  reliefWorks: {
    id: 'reliefWorks', name: 'Municipal relief', kind: 'automatic',
    from: 1931, to: 1939,
    trigger: 'destitute',
    // Flat relief for a household with nothing. Small, grudging, and it kept
    // families on the land through the worst of it.
    perAdult: 34, // 1875 terms; the engine inflates
    note: 'Relief vouchers for a family with nothing left. Nobody took it gladly.',
  },
  pfaa: {
    id: 'pfaa', name: 'Prairie Farm Assistance Act', kind: 'automatic',
    // 1939. Payments to farms whose township yield fell below a threshold,
    // funded by a levy of one per cent on grain sales.
    from: 1939, to: 1973,
    trigger: 'cropFailure', severity: 0.55,
    perAcre: 2.4, levyRate: 0.01, maxAcres: 200,
    note: 'A payment when the crop fails, paid for by a one per cent levy on everyone’s grain.',
  },
  fuelTaxExemption: {
    id: 'fuelTaxExemption', name: 'Farm fuel tax exemption', kind: 'automatic',
    from: 1947, to: 2000,
    // Marked fuel, purple in Manitoba, exempt from road tax because a tractor
    // does not use the roads. Quietly one of the largest ongoing farm subsidies
    // there has ever been.
    upkeepRelief: 0.12,
    note: 'Marked fuel, exempt from road tax. A tractor does not use the highway, so it does not pay for it.',
  },
  specialGrainsProgram: {
    id: 'specialGrainsProgram', name: 'Special Canadian Grains Program', kind: 'automatic',
    // The 1986-87 response to the US-EC export subsidy war. A billion dollars,
    // paid on acres, and it is the reason a great many farms saw 1988.
    from: 1986, to: 1987,
    // 1875 dollars, like every other figure here — the engine inflates it.
    // This was written as 9.5 meaning "$9.50 an acre", which the engine duly
    // multiplied by the 1986 index and paid out at $95 an acre, four times the
    // real cheque. Every per-acre figure in this file is in 1875 terms.
    perAcre: 2.5, // ~$25/acre in 1986, which is what the SCGP actually paid
    note: 'An ad hoc cheque on seeded acres, because the price collapsed for reasons nobody here caused.',
  },
  crowBuyout: {
    id: 'crowBuyout', name: 'Crow Benefit buyout', kind: 'automatic',
    // When the WGTA was repealed in 1995 the Crow Benefit was capitalised and
    // paid out to LANDOWNERS — $1.6 billion, one time. The game already charges
    // the farmer the freight increase; this is the other half of that bargain.
    from: 1995, to: 1996,
    // $1.6 billion over roughly 57 million prairie acres, weighted toward the
    // farms furthest from port, came to something near $35 an acre in Manitoba.
    // In 1875 terms that is 2.6, NOT 16 — as written it paid $213 an acre and
    // handed a 3,000-acre farm two thirds of a million dollars in one year.
    perOwnedAcre: 2.6, once: true,
    note: 'The Crow Benefit, capitalised and paid out to the owner of the land. Once, and then the freight is yours.',
  },

  // ---- DECISIONS -------------------------------------------------------
  pfra: {
    id: 'pfra', name: 'PFRA water and shelterbelt work', kind: 'decision',
    from: 1935, to: 2000,
    // The Prairie Farm Rehabilitation Administration cost-shared dugouts,
    // dams, shelterbelts and community pasture. Federal money against the
    // thing that had just blown the topsoil into the fence lines.
    cost: 55, costShare: 0.5,
    grants: { droughtResist: 0.18, livestockCapacity: 1.25, erosionGuard: 0.3 },
    repeatable: false,
    note: 'Ottawa will pay half of a dugout and a shelterbelt. Water that does not have to be hauled, and a windbreak that holds the soil down.',
  },
  debtReview: {
    id: 'debtReview', name: 'Farm debt review', kind: 'decision',
    // The Farmers' Creditors Arrangement Act (1934) and the Farm Debt Review
    // Boards (1986) did the same thing half a century apart: a mediator, a
    // write-down, and a farm that keeps farming on terms its creditors hate.
    from: 1934, to: 2000,
    availableWhen: 'distressed',
    writeDown: 0.35,
    creditPenaltyYears: 6, creditPenalty: 0.45,
    note: 'A mediator, and a write-down your creditors will not forget. No lender will look at you for years afterwards.',
  },
  safetyNet: {
    id: 'safetyNet', name: 'GRIP and NISA', kind: 'decision',
    // 1991. A revenue guarantee and a stabilisation account you pay into in the
    // good years and draw from in the bad. The paperwork was considerable.
    from: 1991, to: 2000,
    // 1875 dollars. Written as 3.6 this billed $48 an acre in 1995 — the
    // producer's share of a GRIP premium was nearer twelve.
    premiumPerAcre: 0.9,
    // Matched government contribution into the account, drawn when income falls.
    matchRate: 1.0, revenueFloor: 0.7,
    note: 'Pay in when the year is good, draw out when it is not, and Ottawa matches what you put in.',
  },
};

export const PROGRAM_LIST = Object.values(PROGRAMS);

export function programsAvailable(year) {
  return PROGRAM_LIST.filter((p) => year >= p.from && year <= p.to);
}

export function program(id) {
  const p = PROGRAMS[id];
  if (!p) throw new Error(`Unknown program id: ${id}`);
  return p;
}

/**
 * Municipal and school tax relief.
 *
 * Multiplies the ordinary tax bill. Farm land carried the school tax as well as
 * the municipal one, and the burden of it was a live political grievance for
 * most of a century — the province eventually took a share of it off. In the
 * thirties municipalities simply could not collect, and arrears were deferred
 * and then very largely forgiven, because the alternative was a tax sale of
 * half the district.
 */
export const TAX_RELIEF = [
  { from: 1932, to: 1939, factor: 0.45, label: 'Depression arrears deferral — the municipality cannot collect and knows it' },
  { from: 1940, to: 1945, factor: 0.8, label: 'Wartime tax concession on farm land' },
  { from: 1972, to: 2000, factor: 0.72, label: 'Provincial school tax rebate on farmland' },
];

export function taxReliefFor(year) {
  for (const r of TAX_RELIEF) {
    if (year >= r.from && year <= r.to) return r;
  }
  return null;
}

/** An extra deferral in a year the farm was hit hard, whatever the era. */
export const DISASTER_TAX_DEFERRAL = 0.5;

// Income tax on farm profit.
//
// The Income War Tax Act of 1917 was supposed to be temporary. It was not, and
// leaving it out of a game that runs to 2000 meant a farm netting two hundred
// thousand dollars in 1995 kept all of it — which is how the reference player
// finished the century sitting on $1.9 million in cash.
//
// `exempt` is the income below which a farm paid nothing, in that year's
// dollars; `rate` is the EFFECTIVE average rate on what was over it, not a
// marginal bracket. Farmers had more room to move than most taxpayers — cash
// accounting, inventory deferral, income averaging brought in 1945,
// incorporation later, and the capital gains exemption on farm property from
// 1985 — so these sit well below the headline rates of the day, deliberately.
export const INCOME_TAX = [
  { from: 1917, to: 1929, exempt: 3000, rate: 0.05 },
  { from: 1930, to: 1939, exempt: 2400, rate: 0.08 },
  // The war put nearly everyone on the roll for the first time.
  { from: 1940, to: 1948, exempt: 1500, rate: 0.22 },
  { from: 1949, to: 1971, exempt: 3000, rate: 0.20 },
  { from: 1972, to: 1987, exempt: 8000, rate: 0.24 },
  { from: 1988, to: 2000, exempt: 16000, rate: 0.26 },
];

export function incomeTaxFor(year) {
  return INCOME_TAX.find((t) => year >= t.from && year <= t.to) || null;
}
