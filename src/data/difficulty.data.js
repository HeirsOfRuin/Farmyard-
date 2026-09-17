// Difficulty tiers.
//
// These differ by FLAGS as well as scalars, deliberately. A tier that only
// multiplies numbers produces three games that play the same with different
// arithmetic, and the difference exists in the menu copy rather than in the
// game. The flags below turn whole mechanisms on and off — whether the
// community bails you out, whether a will protects the farm from an estate
// split, whether ruin is possible at all.
//
// Every claimed difference here is checked by sim/verify-tiers.js against a
// sample large enough to see it. If a difference cannot be measured, it is not
// a difference and it comes out.

export const DIFFICULTIES = {
  homesteader: {
    id: 'homesteader',
    name: 'Homesteader',
    blurb: 'Setbacks hurt but rarely end you. About one line in four reaches the centennial.',
    order: 1,

    // --- scalars ---
    startingCapitalMult: 2.4,
    hazardFrequency: 0.55,
    hazardSeverity: 0.5,
    priceVolatility: 0.75,
    creditRateSpread: -0.025, // below the era's going rate
    maxLoanToValue: 0.7,
    livingCostMult: 0.7,
    yieldMult: 1.22,

    // --- flags: mechanisms on or off ---
    // A disaster cannot take more than this fraction of a year's crop.
    catastropheFloor: 0.5,
    // The district turns out for you when you are in trouble.
    neighbourAid: true,
    // A written will keeps the land whole; siblings take cash over years.
    willProtectsLand: true,
    // Siblings who want out will accept instalments rather than forcing a sale.
    siblingsAcceptInstalments: true,
    // Foreclosure requires sustained insolvency, not a single bad year.
    foreclosureGraceYears: 7,
    // There is always an heir somewhere willing to take it on.
    guaranteedHeir: true,
    // Off-farm work is available to carry a bad stretch.
    offFarmWorkAvailable: true,
    offFarmWorkMult: 1.15,

    estateCashDemandRate: 0.3, // share of non-farming heirs demanding cash now
  },

  settler: {
    id: 'settler',
    name: 'Settler',
    blurb: 'Drought, debt and a divided estate are all real ways to lose. Roughly one line in six sees 1975.',
    order: 2,

    startingCapitalMult: 1.3,
    hazardFrequency: 0.85,
    hazardSeverity: 0.85,
    priceVolatility: 1.0,
    creditRateSpread: -0.005,
    maxLoanToValue: 0.6,
    livingCostMult: 0.9,
    yieldMult: 1.08,

    catastropheFloor: 0.25,
    neighbourAid: true,
    willProtectsLand: true,
    siblingsAcceptInstalments: true,
    foreclosureGraceYears: 4,
    guaranteedHeir: false,
    offFarmWorkAvailable: true,
    offFarmWorkMult: 1.0,

    estateCashDemandRate: 0.55,
  },

  sodbuster: {
    id: 'sodbuster',
    name: 'Sodbuster',
    blurb: 'Thin margins, hard credit, heirs who want cash. Almost no line survives the first decade, let alone to 1975.',
    order: 3,

    startingCapitalMult: 0.95,
    hazardFrequency: 1.15,
    hazardSeverity: 1.2,
    priceVolatility: 1.25,
    creditRateSpread: 0.025, // above the going rate; you are a poor risk
    maxLoanToValue: 0.42,
    livingCostMult: 1.0,
    yieldMult: 1.0,

    // Almost no floor. A drought year can take nearly everything, and does.
    catastropheFloor: 0.05,
    // Nobody is coming. The district is as poor as you are.
    neighbourAid: false,
    // A will is a piece of paper. If the heirs want cash, the land is sold.
    willProtectsLand: false,
    siblingsAcceptInstalments: false,
    foreclosureGraceYears: 2,
    guaranteedHeir: false,
    // Off-farm work is still there — a man with no money and no connections
    // still went out on the grading gang — but it pays badly and the farm
    // has less to spare. Removing it outright ended 88% of runs inside five
    // years, which is not a hard tier, it is a broken one.
    offFarmWorkAvailable: true,
    offFarmWorkMult: 0.55,

    estateCashDemandRate: 0.8,
  },
};

export const DIFFICULTY_LIST = Object.values(DIFFICULTIES).sort((a, b) => a.order - b.order);

export function difficulty(id) {
  const d = DIFFICULTIES[id];
  if (!d) throw new Error(`Unknown difficulty id: ${id}`);
  return d;
}

// The tier properties that sim/verify-tiers.js must show a measurable
// difference in. Listed here so the claim and the test cannot drift apart.
// The tier properties that sim/verify-tiers.js must show a measurable
// difference in. Listed here so the claim and the test cannot drift apart.
//
// Note what is NOT claimed: the raw foreclosure rate. It is confounded — an
// easier tier guarantees an heir, so its farms never end for want of one and
// instead live long enough to eventually be foreclosed, which pushes the
// foreclosure rate UP on the easier setting. Survival to 1975 and to 2000 are
// the honest measures, and the foreclosure rate is still printed as a
// supporting figure so the confound is visible rather than hidden.
export const CLAIMED_DIFFERENCES = [
  { metric: 'centennialRate', direction: 'desc', label: 'reached 1975 with the line intact' },
  { metric: 'medianYearsPlayed', direction: 'desc', label: 'median years the line lasted' },
  { metric: 'medianRuinYear', direction: 'desc', label: 'median year of ruin' },
];
