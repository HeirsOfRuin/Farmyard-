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
    blurb: 'Setbacks hurt, but the farm and the family line are hard to lose outright.',
    order: 1,

    // --- scalars ---
    startingCapitalMult: 1.9,
    hazardFrequency: 0.72,
    hazardSeverity: 0.68,
    priceVolatility: 0.8,
    creditRateSpread: -0.015, // below the era's going rate
    maxLoanToValue: 0.7,
    livingCostMult: 0.85,
    yieldMult: 1.08,

    // --- flags: mechanisms on or off ---
    // A disaster cannot take more than this fraction of a year's crop.
    catastropheFloor: 0.35,
    // The district turns out for you when you are in trouble.
    neighbourAid: true,
    // A written will keeps the land whole; siblings take cash over years.
    willProtectsLand: true,
    // Siblings who want out will accept instalments rather than forcing a sale.
    siblingsAcceptInstalments: true,
    // Foreclosure requires sustained insolvency, not a single bad year.
    foreclosureGraceYears: 4,
    // There is always an heir somewhere willing to take it on.
    guaranteedHeir: true,
    // Off-farm work is available to carry a bad stretch.
    offFarmWorkAvailable: true,

    estateCashDemandRate: 0.3, // share of non-farming heirs demanding cash now
  },

  settler: {
    id: 'settler',
    name: 'Settler',
    blurb: 'The historical baseline. Drought, debt and a divided estate are all real ways to lose.',
    order: 2,

    startingCapitalMult: 1.0,
    hazardFrequency: 1.0,
    hazardSeverity: 1.0,
    priceVolatility: 1.0,
    creditRateSpread: 0,
    maxLoanToValue: 0.55,
    livingCostMult: 1.0,
    yieldMult: 1.0,

    catastropheFloor: 0.12,
    neighbourAid: true,
    willProtectsLand: true,
    siblingsAcceptInstalments: true,
    foreclosureGraceYears: 2,
    guaranteedHeir: false,
    offFarmWorkAvailable: true,

    estateCashDemandRate: 0.55,
  },

  sodbuster: {
    id: 'sodbuster',
    name: 'Sodbuster',
    blurb: 'Thin margins, hard credit, and heirs who want their share in cash. Most lines do not reach 1975.',
    order: 3,

    startingCapitalMult: 0.55,
    hazardFrequency: 1.35,
    hazardSeverity: 1.4,
    priceVolatility: 1.25,
    creditRateSpread: 0.03, // above the going rate; you are a poor risk
    maxLoanToValue: 0.4,
    livingCostMult: 1.12,
    yieldMult: 0.94,

    // No floor. A drought year can take everything and sometimes does.
    catastropheFloor: 0,
    // Nobody is coming. The district is as poor as you are.
    neighbourAid: false,
    // A will is a piece of paper. If the heirs want cash, the land is sold.
    willProtectsLand: false,
    siblingsAcceptInstalments: false,
    foreclosureGraceYears: 1,
    guaranteedHeir: false,
    offFarmWorkAvailable: false,

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
export const CLAIMED_DIFFERENCES = [
  { metric: 'centennialRate', direction: 'desc', label: 'reached 1975 with the line intact' },
  { metric: 'medianAcres2000', direction: 'desc', label: 'median acres in 2000' },
  { metric: 'ruinRate', direction: 'asc', label: 'lost the farm' },
  { metric: 'medianRuinYear', direction: 'desc', label: 'median year of ruin' },
];
