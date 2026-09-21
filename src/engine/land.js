// The township, its quarter sections, and everything that happens to ground.
//
// Layout follows the Dominion Land Survey, because the survey is not decoration
// here — it decided what a settler could get and on what terms:
//
//   * A section is one mile square, 640 acres, divided into four quarters of
//     160 acres each (NW, NE, SW, SE).
//   * Sections are numbered 1-36 within a township, boustrophedon from the SE
//     corner: 1-6 east to west along the south, 7-12 west to east above it,
//     and so on.
//   * EVEN-numbered sections were open for homestead — $10 filing fee, three
//     years to prove up. ODD-numbered sections were largely CPR railway land
//     grant and had to be bought. Sections 8 and 26 were Hudson's Bay Company.
//     Sections 11 and 29 were school lands, held by the Crown and auctioned.
//
// That single rule is why prairie farms grew in a checkerboard, and why a
// homesteader's second quarter cost money when their first did not.

import { SOILS, soil as soilDef } from '../data/regions.data.js';
import { municipalRoadLevel, roadClassByLevel } from '../data/roads.data.js';

export const ACRES_PER_QUARTER = 160;
export const QUARTER_CODES = ['NW', 'NE', 'SW', 'SE'];

// The visible map: four sections across, two down, north at the top. Section
// numbers are taken from a real township's rows 3 and 4, so the odd/even
// checkerboard falls the way it actually did on the ground.
export const MAP_SECTIONS = [
  [19, 20, 21, 22], // north row (row 4 of the township, running west to east)
  [18, 17, 16, 15], // south row (row 3, running east to west)
];

export const MAP_COLS = MAP_SECTIONS[0].length * 2; // 8 quarters across
export const MAP_ROWS = MAP_SECTIONS.length * 2; //    4 quarters down

/** Who a section was open to under the Dominion Lands Act. */
export function sectionTenure(sectionNo) {
  if (sectionNo === 8 || sectionNo === 26) return 'hbc';
  if (sectionNo === 11 || sectionNo === 29) return 'school';
  return sectionNo % 2 === 0 ? 'homestead' : 'railway';
}

export const TENURE_LABEL = {
  homestead: 'Open for homestead',
  railway: 'CPR land grant',
  hbc: "Hudson's Bay Company",
  school: 'School lands',
};

/** Legal land description, e.g. "NE 20-6-2E". */
export function legalDescription(q, townshipLabel) {
  const m = /Twp\.\s*(\d+),\s*Rge\.\s*(\d+)\s*([EW])/.exec(townshipLabel || '');
  const twp = m ? m[1] : '6';
  const rge = m ? m[2] : '2';
  const dir = m ? m[3] : 'E';
  return `${q.quarter} ${q.section}-${twp}-${rge}${dir}`;
}

/**
 * Build the township. Soil is drawn from the region's weights but smoothed
 * against neighbours, because soil types occur in patches on real ground, not
 * as independent draws per quarter — an unsmoothed map looks like confetti and
 * makes buying decisions meaningless.
 */
export function generateTownship(rng, regionDef) {
  const quarters = [];
  const weights = Object.entries(regionDef.soilWeights).map(([id, weight]) => ({ id, weight }));

  for (let sRow = 0; sRow < MAP_SECTIONS.length; sRow++) {
    for (let sCol = 0; sCol < MAP_SECTIONS[sRow].length; sCol++) {
      const section = MAP_SECTIONS[sRow][sCol];
      const tenure = sectionTenure(section);
      for (let qi = 0; qi < QUARTER_CODES.length; qi++) {
        const code = QUARTER_CODES[qi];
        const row = sRow * 2 + (code[0] === 'N' ? 0 : 1);
        const col = sCol * 2 + (code[1] === 'W' ? 0 : 1);
        quarters.push({
          id: `${code}${section}`,
          section,
          quarter: code,
          row,
          col,
          tenure,
          soil: rng.weighted(weights).id,
          owner: null, // null = unclaimed
          ownerName: null,
          brokenAcres: 0,
          use: 'idle',
          lastUse: null,
          // Initialised here, not left undefined. An unset numeric field that
          // reaches arithmetic produces NaN, and NaN in `fertility` poisons
          // every future yield on that quarter silently and permanently.
          seededAcres: 0,
          cropHistory: [],
          fertility: 0.9, // virgin prairie is rich and will not stay that way
          moisture: 0.55,
          weedPressure: 0.05, // native sod starts clean; cropping is what seeds it
          yearsCropped: 0,    // new breaking grows a remarkable first few crops
          drained: false,
          stonePicked: false,
          fenced: false,
          // How far behind the municipality's general standard this particular
          // road allowance runs. Some get graded early because a councillor
          // lives on them; some are still two ruts long after the rest are
          // gravel. Fixed at generation so the map is stable.
          roadLag: 0,
          // Work the FARM has paid for on its own access: an approach, a
          // culvert, a share of the gravel.
          roadImprovement: 0,
          yearAcquired: null,
          acquiredBy: null,
        });
      }
    }
  }

  // Road standing: some allowances are simply better served than others, and
  // it does not change once the survey is on the ground.
  for (const q of quarters) {
    q.roadLag = rng.weighted([
      { n: 0, weight: 42 }, { n: 1, weight: 38 }, { n: 2, weight: 20 },
    ]).n;
  }

  // Two smoothing passes: each quarter may adopt a neighbour's soil. This turns
  // independent draws into patches without needing a noise function.
  for (let pass = 0; pass < 2; pass++) {
    for (const q of quarters) {
      const neighbours = quarters.filter(
        (o) => Math.abs(o.row - q.row) + Math.abs(o.col - q.col) === 1
      );
      if (neighbours.length && rng.chance(0.45)) {
        q.soil = rng.pick(neighbours).soil;
      }
    }
  }

  return quarters;
}

/** Populate unclaimed quarters with neighbours who can later sell out to you. */
export function seedNeighbours(rng, quarters, surnames, homeQuarterId) {
  const families = rng.shuffle([...surnames]).slice(0, 9);
  for (const q of quarters) {
    if (q.id === homeQuarterId) continue;
    if (q.tenure === 'railway' || q.tenure === 'hbc' || q.tenure === 'school') {
      // Held by the company or the Crown until somebody buys it.
      q.owner = q.tenure;
      q.ownerName = TENURE_LABEL[q.tenure];
      continue;
    }
    // Homestead-eligible ground fills up over the first decades; some starts
    // empty so there is still free land to file on.
    if (rng.chance(0.62)) {
      const name = rng.pick(families);
      q.owner = 'neighbour';
      q.ownerName = name;
      // 1875: everybody here has just started too.
      q.brokenAcres = rng.range(8, 35);
      q.use = 'wheat';
    }
  }
  return quarters;
}

/**
 * How much of a quarter a going concern has under cultivation in a given year.
 *
 * THIS IS THE FIGURE THAT DECIDES WHAT A FARM IS WORTH, and it was wrong.
 * Every quarter that changed hands — a neighbour selling out in 1975, the CPR
 * releasing a section in 1960 — arrived carrying 20 to 70 broken acres, the
 * figure for land somebody had just started on in 1885. So a farm buying its
 * neighbour's place at the end of the century bought raw prairie, had to break
 * it against a day budget, and never caught up: farms standing in 2000 owned
 * 1,120 acres with 461 of them broken.
 *
 * On the real ground the frontier closed. Manitoba's improved acreage was
 * about a fifth of its farmland in 1881 and roughly nine tenths of it by the
 * 1970s, and a quarter that comes up for sale in 1975 is a quarter that has
 * been farmed for eighty years. What is NOT cultivated by then is the slough,
 * the bush in the corner, the yard and the road allowance — not unbroken sod.
 *
 * Soil decides the ceiling: slough ground never gets fully cropped without
 * drainage, and stony land keeps its rough corners.
 */
const IMPROVED_SHARE = [
  [1875, 0.05], [1885, 0.16], [1895, 0.28], [1905, 0.42], [1915, 0.58],
  [1925, 0.68], [1935, 0.74], [1945, 0.78], [1955, 0.83], [1965, 0.87],
  [1975, 0.90], [1990, 0.92], [2000, 0.93],
];

export function improvedShare(year) {
  const a = IMPROVED_SHARE;
  if (year <= a[0][0]) return a[0][1];
  if (year >= a[a.length - 1][0]) return a[a.length - 1][1];
  for (let i = 1; i < a.length; i++) {
    if (year <= a[i][0]) {
      const [y0, v0] = a[i - 1];
      const [y1, v1] = a[i];
      return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0);
    }
  }
  return a[a.length - 1][1];
}

/**
 * Broken acres on a quarter that an established neighbour is farming in `year`.
 * `rng` supplies the spread — some places are better kept than others.
 */
/**
 * The most of a quarter that can ever be in crop.
 *
 * Never all of it. A quarter carries a yard, a road allowance, the sloughs
 * that do not drain, the bush in the northeast corner and the stone pile.
 * Without a ceiling the farm broke every acre it owned and finished the
 * century cropping 3,327 of 3,360 acres — ninety-nine per cent, which no
 * quarter section in Manitoba has ever managed.
 */
export function croppableShare(q) {
  const s = soilDef(typeof q === 'string' ? q : q.soil);
  let ceiling = 0.93;
  if (s.requiresDrainage) ceiling = (typeof q === 'object' && q.drained) ? 0.8 : 0.42;
  else if (s.stoniness >= 0.9) ceiling = 0.82;
  else if (s.id === 'sandy') ceiling = 0.9;
  return ceiling;
}

/** The acre ceiling on a quarter, which is what breaking works against. */
export function maxBrokenAcres(q) {
  return croppableShare(q) * ACRES_PER_QUARTER;
}

export function settledBrokenAcres(rng, year, soilId) {
  const ceiling = croppableShare(soilId);
  const share = Math.min(improvedShare(year), ceiling) * rng.range(0.8, 1.12);
  return Math.round(Math.max(0, Math.min(ceiling, share)) * ACRES_PER_QUARTER);
}

// A quarter section is a half mile square, so one step on the grid is half a
// mile of road.
export const MILES_PER_CELL = 0.5;

/**
 * Road miles between two quarters.
 *
 * Manhattan, not straight-line: the survey put road allowances on the grid and
 * you travel along them — over and then up. There is no diagonal to take, and
 * pretending otherwise would understate every distance on the map.
 */
export function distanceBetween(a, b) {
  if (!a || !b) return 0;
  return (Math.abs(a.row - b.row) + Math.abs(a.col - b.col)) * MILES_PER_CELL;
}

/** Road miles from the home quarter — the yard — to a given quarter. */
export function distanceFromYard(state, q) {
  const home = quarterById(state.quarters, state.homeQuarterId);
  return distanceBetween(home, q);
}

/**
 * The road class serving a quarter this year: what the municipality has
 * generally reached, less this allowance's own lag, plus whatever the farm has
 * paid for itself. Derived rather than stored, so a change to the timeline
 * applies to a save in progress instead of leaving it on last version's roads.
 */
export function roadLevelFor(state, q) {
  const municipal = municipalRoadLevel(state.year);
  const level = municipal - (q.roadLag || 0) + (q.roadImprovement || 0);
  return Math.max(0, Math.min(3, level));
}

export function roadFor(state, q) {
  return roadClassByLevel(roadLevelFor(state, q));
}

export function quarterById(quarters, id) {
  return quarters.find((q) => q.id === id) || null;
}

export function playerQuarters(quarters) {
  return quarters.filter((q) => q.owner === 'player');
}

export function ownedAcres(quarters) {
  return playerQuarters(quarters).length * ACRES_PER_QUARTER;
}

export function brokenAcres(quarters) {
  return playerQuarters(quarters).reduce((sum, q) => sum + q.brokenAcres, 0);
}

/** Acres under a crop that actually produces something sellable or feedable. */
export function croppedAcres(quarters) {
  return playerQuarters(quarters)
    .filter((q) => q.use !== 'idle' && q.use !== 'fallow' && q.use !== 'bush')
    .reduce((sum, q) => sum + q.brokenAcres, 0);
}

/**
 * Per-acre value of a quarter relative to the district average, from its soil,
 * how much of it is broken, and its improvements. Used for both purchase price
 * and what an estate appraises it at — one function, so a quarter cannot be
 * worth one number when you buy it and another when your heirs divide it.
 */
export function quarterValueFactor(q) {
  const s = soilDef(q.soil);
  let f = s.yieldFactor;
  // Broken land is worth far more than raw prairie: the breaking is the work.
  const brokenShare = q.brokenAcres / ACRES_PER_QUARTER;
  f *= 0.55 + 0.45 * brokenShare + 0.25 * brokenShare;
  if (q.drained) f *= 1.3;
  if (q.stonePicked) f *= 1.12;
  if (q.fenced) f *= 1.05;
  if (s.requiresDrainage && !q.drained) f *= 0.6;
  return f;
}

/** Acres of a quarter that can be worked at all, given soil and improvements. */
export function workableAcres(q) {
  const s = soilDef(q.soil);
  if (s.requiresDrainage && !q.drained) return Math.min(q.brokenAcres, ACRES_PER_QUARTER * 0.35);
  return q.brokenAcres;
}

/** What it costs to break one acre of native sod on this quarter, in 1875 dollars. */
export function breakingCostPerAcre(q) {
  const s = soilDef(q.soil);
  let cost = 3.2 * s.breakingCost;
  if (s.stoniness > 0.5) cost *= 1 + s.stoniness * 0.5; // stones must come out first
  return cost;
}

export { SOILS };
