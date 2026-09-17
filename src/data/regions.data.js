// Manitoba farming regions, 1875-2000.
//
// Region sets the soil mix a township is generated from and re-weights the
// hazard tables. These are real distinctions: Red River Valley gumbo grows
// heavy crops and floods; the Interlake is stony, wet and shallow-soiled and
// never did support grain farming at valley scale; the Westman plains are the
// classic mixed wheat country.
//
// `soilWeights` keys must exist in SOILS. `hazardWeights` multiply the base
// event weight for that tag — 1 means "national average", 2.2 means "here it
// happens twice as often".

export const SOILS = {
  clay: {
    id: 'clay',
    name: 'Red River clay',
    short: 'Clay',
    // Yield multiplier in a normal year. Valley gumbo is genuinely the best
    // grain soil on the prairies when it is dry enough to get on.
    yieldFactor: 1.18,
    // Multiplier on the days it takes to work an acre. Heavy land is slow,
    // and before rubber tires it was slower still.
    workFactor: 1.15,
    droughtResist: 0.75, // lower = better; multiplies drought severity
    floodRisk: 1.9,
    stoniness: 0.05,
    breakingCost: 1.15, // multiplier on cost to break native sod
    pastureFactor: 0.9,
    note: 'Deep lacustrine clay. Grows the heaviest crops in the province and drowns in a wet spring.',
  },
  loam: {
    id: 'loam',
    name: 'Black loam',
    short: 'Loam',
    yieldFactor: 1.0,
    workFactor: 1.0,
    droughtResist: 1.0,
    floodRisk: 0.7,
    stoniness: 0.2,
    breakingCost: 1.0,
    pastureFactor: 1.0,
    note: 'The default prairie soil. Forgiving, workable, unspectacular.',
  },
  sandy: {
    id: 'sandy',
    name: 'Sandy loam',
    short: 'Sandy',
    yieldFactor: 0.82,
    workFactor: 0.85, // light land works fast
    droughtResist: 1.55, // burns out early
    floodRisk: 0.3,
    stoniness: 0.1,
    breakingCost: 0.85,
    pastureFactor: 0.85,
    // Light land was where potatoes and later sunflowers went.
    rowCropBonus: 1.25,
    note: 'Light land. Works easy, dries out early, and is the only place potatoes do well.',
  },
  stony: {
    id: 'stony',
    name: 'Stony till',
    short: 'Stony',
    yieldFactor: 0.7,
    workFactor: 1.35,
    droughtResist: 1.15,
    floodRisk: 0.6,
    stoniness: 1.0, // full stone-picking burden; breaks implements
    breakingCost: 1.6,
    pastureFactor: 1.05,
    note: 'Shallow soil over till. Every spring heaves a fresh crop of stones into the working depth.',
  },
  slough: {
    id: 'slough',
    name: 'Slough and marsh',
    short: 'Slough',
    yieldFactor: 0.45,
    workFactor: 1.5,
    droughtResist: 0.4, // wet years hurt, dry years are its best years
    floodRisk: 3.0,
    stoniness: 0.1,
    breakingCost: 1.0,
    pastureFactor: 1.35, // good hay and slough grass
    // Cannot be cropped reliably until drained; drainage is a real improvement.
    requiresDrainage: true,
    note: 'Wet ground. Good hay, poor grain, and worth real money once it is tiled.',
  },
};

export const REGIONS = {
  redRiver: {
    id: 'redRiver',
    name: 'Red River Valley',
    blurb: 'Flat, black, and heavy. The best grain land in Manitoba and the first to go under water.',
    townshipLabel: 'Twp. 6, Rge. 2 E',
    soilWeights: { clay: 52, loam: 26, slough: 14, sandy: 6, stony: 2 },
    hazardWeights: { flood: 2.6, drought: 0.7, frost: 0.85, hail: 1.0, rust: 1.25, grasshopper: 1.0 },
    // Valley land cost more from the beginning and never stopped.
    landValueFactor: 1.3,
    // Distance to a rail point in miles at settlement; falls as branch lines
    // arrive. Hauling grain by wagon was the single biggest cost of the 1880s.
    initialHaulMiles: 14,
  },
  westman: {
    id: 'westman',
    name: 'Westman plains',
    blurb: 'Rolling mixed-farming country west of the escarpment. Wheat, cattle, and a long way to tidewater.',
    townshipLabel: 'Twp. 10, Rge. 22 W',
    soilWeights: { loam: 48, clay: 16, sandy: 18, stony: 13, slough: 5 },
    hazardWeights: { flood: 0.5, drought: 1.35, frost: 1.0, hail: 1.35, rust: 0.85, grasshopper: 1.2 },
    landValueFactor: 1.0,
    initialHaulMiles: 26,
  },
  interlake: {
    id: 'interlake',
    name: 'Interlake',
    blurb: 'Stone, bush and marsh between the lakes. Hard country that fed itself on cattle, hay and fish.',
    townshipLabel: 'Twp. 19, Rge. 4 E',
    soilWeights: { stony: 38, slough: 24, loam: 22, clay: 11, sandy: 5 },
    hazardWeights: { flood: 1.5, drought: 0.8, frost: 1.45, hail: 0.8, rust: 0.9, grasshopper: 0.7 },
    landValueFactor: 0.62,
    initialHaulMiles: 33,
    // Lake Winnipeg winter fishing was real off-farm income here and is the
    // reason Interlake families survived years that would have broken a
    // single-enterprise grain farm.
    offFarmIncome: { label: 'Winter fishing on the lake', amount: 120, throughYear: 1955 },
  },
};

export const REGION_LIST = Object.values(REGIONS);
export const SOIL_LIST = Object.values(SOILS);

export function soil(id) {
  const s = SOILS[id];
  if (!s) throw new Error(`Unknown soil id: ${id}`);
  return s;
}

export function region(id) {
  const r = REGIONS[id];
  if (!r) throw new Error(`Unknown region id: ${id}`);
  return r;
}
