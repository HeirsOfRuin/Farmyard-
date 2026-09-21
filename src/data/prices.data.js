// Historical price and cost series, 1875-2000. All figures are NOMINAL dollars
// of the year in question. A dollar in 1875 and a dollar in 1995 are different
// animals and the game does not pretend otherwise — that is most of what makes
// a long mortgage feel the way it did.
//
// Wheat carries an explicit year-by-year series because it is the crop the
// whole province was organised around and its volatility (1917's fixed $2.24,
// 1932's $0.35, 1974's spike) is the shape of the century. Everything else is
// derived from wheat by ratio, or given its own anchors where it genuinely
// decoupled.

import { CROPS } from './crops.data.js';

export const FIRST_YEAR = 1875;
export const LAST_YEAR = 2000;
export const CENTENNIAL_YEAR = 1975;

// Farm-gate wheat, $/bushel, Manitoba. One entry per year from FIRST_YEAR.
export const WHEAT_PRICE = [
  /* 1875 */ 0.85, 0.95, 1.05, 0.78, 0.72,
  /* 1880 */ 0.85, 0.95, 0.88, 0.72, 0.62,
  /* 1885 */ 0.58, 0.62, 0.65, 0.90, 0.78,
  /* 1890 */ 0.72, 0.85, 0.62, 0.55, 0.48,
  /* 1895 */ 0.45, 0.52, 0.68, 0.78, 0.62,
  /* 1900 */ 0.65, 0.60, 0.62, 0.68, 0.85,
  /* 1905 */ 0.78, 0.68, 0.85, 0.92, 0.88,
  /* 1910 */ 0.82, 0.75, 0.78, 0.72, 1.05,
  /* 1915 */ 0.92, 1.45, 2.21, 2.24, 2.15, // 1917-18 fixed by the Board of Grain Supervisors
  /* 1920 */ 1.85, 1.05, 0.92, 0.78, 1.35,
  /* 1925 */ 1.28, 1.20, 1.18, 0.95, 1.05,
  /* 1930 */ 0.55, 0.42, 0.35, 0.48, 0.62, // 1932 is the floor of the Depression
  /* 1935 */ 0.72, 0.85, 1.12, 0.68, 0.58,
  /* 1940 */ 0.62, 0.68, 0.78, 1.10, 1.22,
  /* 1945 */ 1.32, 1.45, 1.72, 1.85, 1.72,
  /* 1950 */ 1.62, 1.68, 1.68, 1.55, 1.48,
  /* 1955 */ 1.42, 1.45, 1.42, 1.48, 1.45,
  /* 1960 */ 1.48, 1.62, 1.72, 1.72, 1.68,
  /* 1965 */ 1.72, 1.78, 1.65, 1.52, 1.42,
  /* 1970 */ 1.42, 1.48, 1.72, 3.85, 4.65, // 1973-74: the Soviet grain deals
  /* 1975 */ 3.85, 3.25, 2.75, 3.35, 4.15,
  /* 1980 */ 4.85, 4.65, 4.15, 4.25, 4.35,
  /* 1985 */ 3.65, 2.95, 3.15, 4.85, 4.45, // 1986: the US-EC export subsidy war
  /* 1990 */ 3.35, 2.95, 3.45, 3.55, 4.15,
  /* 1995 */ 5.25, 5.45, 4.25, 3.65, 3.35,
  /* 2000 */ 3.45,
];

if (WHEAT_PRICE.length !== LAST_YEAR - FIRST_YEAR + 1) {
  throw new Error(
    `WHEAT_PRICE has ${WHEAT_PRICE.length} entries, expected ${LAST_YEAR - FIRST_YEAR + 1}`
  );
}

/**
 * Linear interpolation across [year, value] anchor pairs. Clamps outside the
 * anchor range rather than extrapolating — extrapolating a price series off the
 * end of its evidence is how you get $9,000 land in 1876.
 */
export function interpolate(anchors, year) {
  if (year <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (year >= last[0]) return last[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [y0, v0] = anchors[i];
    const [y1, v1] = anchors[i + 1];
    if (year >= y0 && year <= y1) {
      if (y1 === y0) return v1;
      return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0);
    }
  }
  return last[1];
}

export function wheatPrice(year) {
  const i = Math.max(0, Math.min(WHEAT_PRICE.length - 1, year - FIRST_YEAR));
  return WHEAT_PRICE[i];
}

// Per-crop pricing. `ratio` anchors give a multiple of that year's wheat price
// (grains and oilseeds track wheat closely). `absolute` anchors give $/unit
// directly, for the crops that had their own market and did not track it.
export const CROP_PRICING = {
  wheat: { ratio: [[1875, 1.0], [2000, 1.0]] },
  // Oats are a 34 lb bushel against wheat's 60 lb, and fed rather than exported.
  oats: { ratio: [[1875, 0.44], [1920, 0.48], [1950, 0.42], [1980, 0.38], [2000, 0.44]] },
  barley: { ratio: [[1875, 0.55], [1930, 0.52], [1970, 0.55], [2000, 0.62]] },
  // Flax always carried a large premium as an industrial oil.
  flax: { ratio: [[1875, 1.55], [1920, 1.85], [1950, 2.15], [1980, 1.75], [2000, 1.9]] },
  rye: { ratio: [[1878, 0.7], [1930, 0.62], [1970, 0.7], [2000, 0.72]] },
  rapeseed: { ratio: [[1956, 1.75], [1970, 1.95], [1978, 2.1]] },
  canola: { ratio: [[1978, 2.05], [1990, 2.2], [2000, 2.3]] },
  // $/cwt.
  sunflower: { absolute: [[1946, 3.1], [1960, 4.2], [1975, 9.5], [1985, 9.0], [2000, 11.5]] },
  // $/ton, on contract to the Fort Garry refinery.
  sugarbeet: { absolute: [[1940, 10.5], [1955, 14.0], [1970, 17.5], [1980, 34.0], [1997, 43.0]] },
  // $/cwt. Local market only until the processing plants arrive.
  potato: { absolute: [[1875, 0.55], [1900, 0.48], [1930, 0.55], [1950, 1.35], [1975, 3.1], [2000, 5.4]] },
  // $/ton. Hay outran the grain price over the century as livestock intensified.
  hay: { absolute: [[1875, 5.5], [1900, 5.0], [1920, 12.0], [1935, 6.5], [1950, 16.0], [1975, 42.0], [2000, 72.0]] },
  pasture: { absolute: [[1875, 3.0], [2000, 40.0]] },
  // $/cord, standing firewood. Mostly burned at home rather than sold.
  bush: { absolute: [[1875, 2.75], [1920, 6.0], [1950, 11.0], [1975, 35.0], [2000, 95.0]] },
};

/**
 * $/unit for a crop in a given year. Returns 0 for crops that yield nothing.
 *
 * Throws if asked to price a crop outside the years it existed. The anchor
 * tables clamp at their ends, so without this guard asking for canola in 1875
 * returns a confident $1.74 and nothing anywhere complains — exactly the shape
 * of bug that survives a green test suite. A caller that legitimately does not
 * know whether a crop exists yet should check `cropsAvailable(year)` first.
 */
export function cropPrice(cropId, year) {
  const rule = CROP_PRICING[cropId];
  if (!rule) return 0;
  const c = CROPS[cropId];
  if (c && (year < c.from || year > c.to)) {
    throw new Error(
      `cropPrice(${cropId}, ${year}): outside its window ${c.from}-${c.to}. ` +
        `Check cropsAvailable(${year}) before pricing.`
    );
  }
  if (rule.absolute) return interpolate(rule.absolute, year);
  return wheatPrice(year) * interpolate(rule.ratio, year);
}

// General cost-of-living / manufactured-goods index, 1875 = 100. Drives living
// expenses, machinery list prices and building costs. Note the long deflation
// to 1896 and the WWI spike — both were real and both mattered to a farm with
// fixed-dollar debt.
export const PRICE_INDEX = [
  [1875, 100], [1885, 88], [1896, 72], [1905, 82], [1913, 92],
  [1918, 155], [1920, 178], [1925, 148], [1929, 145], [1933, 104],
  [1937, 118], [1940, 118], [1945, 142], [1948, 182], [1950, 188],
  [1955, 212], [1960, 232], [1965, 252], [1970, 300], [1975, 430],
  [1980, 700], [1985, 960], [1990, 1180], [1995, 1330], [2000, 1470],
];

// Farm wages ran well ahead of consumer prices over the century — the hired man
// went from $18/month and board to competing with a town job. This is why
// labour-saving machinery kept paying for itself.
export const WAGE_INDEX = [
  [1875, 100], [1890, 105], [1900, 118], [1913, 165], [1920, 290],
  [1925, 230], [1930, 215], [1933, 110], [1937, 155], [1940, 175],
  [1945, 285], [1950, 420], [1955, 530], [1960, 640], [1965, 790],
  [1970, 1010], [1975, 1620], [1980, 2500], [1985, 3300], [1990, 4100],
  [1995, 4700], [2000, 5400],
];

// Improved farmland, $/acre, Manitoba average. The 1913 peak, the Depression
// collapse, and the 1975-81 run-up followed by the crash are the three land
// events that made and unmade farms.
export const LAND_PRICE = [
  [1875, 4], [1880, 6], [1882, 11], [1885, 7], [1890, 9],
  [1900, 17], [1906, 27], [1913, 42], [1920, 48], [1925, 34],
  [1930, 28], [1933, 14], [1937, 17], [1940, 19], [1945, 26],
  [1950, 38], [1955, 46], [1960, 54], [1965, 68], [1970, 92],
  [1975, 205], [1979, 390], [1981, 470], [1985, 310], [1988, 300],
  [1992, 360], [1995, 415], [2000, 520],
];

// Unbroken land sells at a discount to improved. The gap narrowed as the
// frontier closed and there was no more free land to compare against.
export const RAW_LAND_DISCOUNT = [[1875, 0.4], [1900, 0.55], [1930, 0.62], [1970, 0.72], [2000, 0.8]];

// Nominal interest on farm credit. Homesteaders had no mortgage market at all
// and borrowed from implement dealers and storekeepers at brutal rates; the
// 1981 spike is the prime rate peak that took out a generation of farms.
export const INTEREST_RATE = [
  [1875, 0.12], [1885, 0.10], [1900, 0.08], [1917, 0.065], [1925, 0.07],
  [1930, 0.07], [1935, 0.055], [1945, 0.045], [1959, 0.05], [1965, 0.06],
  [1970, 0.085], [1975, 0.095], [1979, 0.135], [1981, 0.215], [1982, 0.175],
  [1985, 0.115], [1990, 0.135], [1995, 0.095], [2000, 0.085],
];

// Freight to tidewater, $/bushel. The Crow's Nest Pass Agreement of 1897 fixed
// statutory grain rates and they stayed near-frozen for most of a century; the
// Western Grain Transportation Act was repealed effective 1 August 1995 and the
// cost landed on the farmer all at once.
export const FREIGHT_RATE = [
  [1875, 0.26], [1882, 0.21], [1890, 0.17], [1897, 0.12], [1920, 0.12],
  [1950, 0.13], [1970, 0.14], [1983, 0.17], [1994, 0.19], [1995, 0.34],
  [1998, 0.41], [2000, 0.44],
];

// Annual household living cost for one adult, nominal dollars. A family scales
// this by size and by the standard of living they hold themselves to.
// Annual CASH cost of living per adult. Deliberately modest for the early
// decades: a homestead household bought flour it had not grown, sugar, tea,
// coal oil, boots, cloth, nails and matches, and made, grew or did without
// nearly everything else. Cash was the scarce thing on a prairie farm, and
// what left in a year was small. (An earlier set of figures ran roughly half
// again too high and made the household 45-67% of gross income, which no farm
// could carry.)
export const LIVING_COST_PER_ADULT = [
  [1875, 62], [1900, 78], [1920, 205], [1933, 125], [1945, 215],
  [1960, 520], [1975, 1650], [1985, 3900], [2000, 6900],
];

export function priceIndex(year) { return interpolate(PRICE_INDEX, year); }
export function wageIndex(year) { return interpolate(WAGE_INDEX, year); }
// Municipal and school taxes on farmland, as a share of assessed market value.
//
// This is a MILL RATE, not a fee, and that distinction is the whole point.
// The game charged a flat $9 a quarter in 1875 dollars, indexed to consumer
// prices — but land went up 130-fold over the century while consumer prices
// went up 15-fold, so by 2000 the farm was paying 83 cents an acre against a
// real Manitoba bill of six to ten dollars. Holding land you never cropped was
// free, and the reference player duly ended the century sitting on 3,840 acres
// while seeding 1,200 of them.
//
// Rates rose as rural municipalities and school districts took on real
// spending, and eased after the 1970s when farmland won school-tax rebates.
export const PROPERTY_TAX_RATE = [
  [1875, 0.010], [1885, 0.012], [1900, 0.013], [1913, 0.015], [1925, 0.017],
  [1935, 0.018], [1945, 0.015], [1960, 0.014], [1975, 0.014], [1990, 0.013],
  [2000, 0.013],
];

export function landPrice(year) { return interpolate(LAND_PRICE, year); }
export function propertyTaxRate(year) { return interpolate(PROPERTY_TAX_RATE, year); }
export function rawLandDiscount(year) { return interpolate(RAW_LAND_DISCOUNT, year); }
export function interestRate(year) { return interpolate(INTEREST_RATE, year); }
export function freightRate(year) { return interpolate(FREIGHT_RATE, year); }
export function livingCostPerAdult(year) { return interpolate(LIVING_COST_PER_ADULT, year); }

/** Inflate a cost quoted in 1875 dollars into a given year's dollars. */
export function inflate(base1875, year) {
  return (base1875 * priceIndex(year)) / 100;
}

/** Inflate a wage quoted in 1875 dollars into a given year's dollars. */
export function inflateWage(base1875, year) {
  return (base1875 * wageIndex(year)) / 100;
}
