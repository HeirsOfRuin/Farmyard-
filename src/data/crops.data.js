// Crops available on the Manitoba prairie, 1875-2000, with the years they
// actually became available to a farmer here.
//
// Units are the crop's own trade unit: bushels for grain and oilseed, tons for
// hay and beets, hundredweight for potatoes. Everything downstream carries the
// unit with the number, because a ton of hay and a bushel of wheat priced the
// same would be a silent and very large error.
//
// `yieldBase` is bushels (or tons/cwt) per acre on loam, at baseline fertility,
// with no fertilizer, no herbicide and an average year. The historical climb in
// prairie yields — roughly 15 bu/ac wheat in 1900 to 40 by 2000 — is NOT baked
// in here. It emerges from varieties, fertility management, fertilizer and
// weed control, all of which are player decisions. That is deliberate: a farmer
// who refuses to change should still be getting 1900 yields in 1980.

export const OPERATIONS = ['break', 'till', 'seed', 'weed', 'harvest'];

export const CROPS = {
  wheat: {
    id: 'wheat',
    name: 'Wheat',
    unit: 'bu',
    category: 'grain',
    from: 1875,
    to: 2000,
    yieldBase: 16,
    seedRate: 1.5, // bu/ac
    // Days of one worker-with-implement per acre, before implement capacity.
    work: { till: 0.06, seed: 0.05, harvest: 0.11 },
    // How badly a short harvest window hurts. Wheat must come off dry.
    harvestWindowDays: 30,
    sensitivity: { drought: 1.0, frost: 1.0, hail: 1.0, rust: 1.0, excessWet: 0.9 },
    fertilityDraw: 0.055,
    // Wheat on wheat on wheat is how the prairie soil got mined. A crop
    // following itself takes a penalty; the engine reads this.
    continuousPenalty: 0.12,
    staple: true, // counts toward the household's own bread
    note: 'The reason the province was settled. Everything else is grown in its shadow.',
  },
  oats: {
    id: 'oats',
    name: 'Oats',
    unit: 'bu',
    category: 'grain',
    from: 1875,
    to: 2000,
    yieldBase: 38,
    seedRate: 2.5,
    work: { till: 0.055, seed: 0.05, harvest: 0.10 },
    harvestWindowDays: 34,
    sensitivity: { drought: 1.15, frost: 0.7, hail: 1.0, rust: 0.55, excessWet: 0.75 },
    fertilityDraw: 0.04,
    continuousPenalty: 0.09,
    // Oats fed the horses. Before the tractor this is not an optional crop.
    feedValue: 1.0,
    note: 'Horse fuel. Every acre of oats is an acre feeding the teams that work the other acres.',
  },
  barley: {
    id: 'barley',
    name: 'Barley',
    unit: 'bu',
    category: 'grain',
    from: 1875,
    to: 2000,
    yieldBase: 30,
    seedRate: 2.0,
    work: { till: 0.055, seed: 0.05, harvest: 0.10 },
    harvestWindowDays: 32,
    sensitivity: { drought: 0.85, frost: 0.65, hail: 1.05, rust: 0.6, excessWet: 0.85 },
    fertilityDraw: 0.042,
    continuousPenalty: 0.09,
    feedValue: 1.1,
    // Malting premium arrives with a domestic brewing industry of any size.
    premiumFrom: 1905,
    note: 'Short-season and hard to kill. Feeds hogs and cattle, and malts for a premium if it grades.',
  },
  flax: {
    id: 'flax',
    name: 'Flax',
    unit: 'bu',
    category: 'oilseed',
    from: 1875,
    to: 2000,
    yieldBase: 11,
    seedRate: 0.9,
    work: { till: 0.06, seed: 0.05, harvest: 0.13 },
    harvestWindowDays: 26,
    sensitivity: { drought: 1.2, frost: 1.2, hail: 1.15, rust: 0.3, excessWet: 1.0 },
    fertilityDraw: 0.05,
    continuousPenalty: 0.2,
    // Flax was the classic first crop on newly broken sod — it tolerated the
    // trash and rough seedbed that would have smothered wheat.
    breakingCropBonus: 1.3,
    note: 'The traditional crop on fresh breaking. Tough on the soil, kind to a rough seedbed.',
  },
  rye: {
    id: 'rye',
    name: 'Fall rye',
    unit: 'bu',
    category: 'grain',
    from: 1878,
    to: 2000,
    yieldBase: 22,
    seedRate: 1.6,
    work: { till: 0.05, seed: 0.05, harvest: 0.10 },
    harvestWindowDays: 38,
    sensitivity: { drought: 0.6, frost: 0.3, hail: 0.9, rust: 0.5, excessWet: 0.9 },
    fertilityDraw: 0.035,
    continuousPenalty: 0.07,
    // Seeded in fall, harvested early — it spreads the labour peak, which on a
    // horse-powered farm is worth more than the yield.
    fallSeeded: true,
    note: 'Seeded in September, off in July. Spreads the work and will grow on sand that starves wheat.',
  },
  rapeseed: {
    id: 'rapeseed',
    name: 'Rapeseed',
    unit: 'bu',
    category: 'oilseed',
    // Grown in Canada from 1943 as a wartime marine lubricant; a real
    // commercial field crop on the prairies from the mid-1950s.
    from: 1956,
    to: 1978,
    yieldBase: 18,
    seedRate: 0.12,
    work: { till: 0.06, seed: 0.05, harvest: 0.13 },
    harvestWindowDays: 24,
    sensitivity: { drought: 1.1, frost: 0.9, hail: 1.4, rust: 0.2, excessWet: 1.0 },
    fertilityDraw: 0.06,
    continuousPenalty: 0.22,
    // It shatters if it stands too long. You must swath it, and a swather is
    // a separate machine.
    requiresImplement: 'swather',
    note: 'High erucic oil for industry. Shatters on the stalk, so it has to be swathed.',
  },
  canola: {
    id: 'canola',
    name: 'Canola',
    unit: 'bu',
    category: 'oilseed',
    // "Canola" was coined in 1978 for the low-erucic, low-glucosinolate
    // varieties that turned an industrial oil into a food crop.
    from: 1978,
    to: 2000,
    yieldBase: 25,
    seedRate: 0.12,
    work: { till: 0.06, seed: 0.05, harvest: 0.13 },
    harvestWindowDays: 24,
    sensitivity: { drought: 1.1, frost: 0.9, hail: 1.4, rust: 0.2, excessWet: 0.95 },
    fertilityDraw: 0.065,
    continuousPenalty: 0.25,
    requiresImplement: 'swather',
    note: 'The edible-oil rewrite of rapeseed. The crop that paid for the 1980s and 90s.',
  },
  sunflower: {
    id: 'sunflower',
    name: 'Sunflowers',
    unit: 'cwt',
    category: 'specialty',
    from: 1946,
    to: 2000,
    yieldBase: 13,
    seedRate: 0.04,
    work: { till: 0.07, seed: 0.06, harvest: 0.16 },
    harvestWindowDays: 30,
    sensitivity: { drought: 0.8, frost: 1.3, hail: 1.3, rust: 0.4, excessWet: 1.1 },
    fertilityDraw: 0.07,
    continuousPenalty: 0.3,
    rowCrop: true,
    note: 'A southern-Manitoba specialty. Deep roots find water, and the heads take a long fall.',
  },
  sugarbeet: {
    id: 'sugarbeet',
    name: 'Sugar beets',
    unit: 'ton',
    category: 'specialty',
    // The Manitoba Sugar Company refinery at Fort Garry opened in 1940 and
    // closed in 1997. No refinery, no beets — this crop has a hard window.
    from: 1940,
    to: 1997,
    yieldBase: 11,
    seedRate: 0.15,
    work: { till: 0.09, seed: 0.08, weed: 0.35, harvest: 0.45 },
    harvestWindowDays: 34,
    sensitivity: { drought: 0.9, frost: 0.8, hail: 0.6, rust: 0.1, excessWet: 1.2 },
    fertilityDraw: 0.09,
    continuousPenalty: 0.35,
    rowCrop: true,
    // Beets were grown on contract and hand-thinned by seasonal crews.
    requiresContract: true,
    labourIntensive: 2.4,
    note: 'Grown on contract to the Fort Garry refinery. Enormous hand labour, and a cheque that does not depend on the grain market.',
  },
  potato: {
    id: 'potato',
    name: 'Potatoes',
    unit: 'cwt',
    category: 'specialty',
    from: 1875,
    to: 2000,
    yieldBase: 105,
    seedRate: 12,
    work: { till: 0.09, seed: 0.10, weed: 0.2, harvest: 0.5 },
    harvestWindowDays: 28,
    sensitivity: { drought: 1.3, frost: 1.5, hail: 0.7, rust: 0.1, excessWet: 1.3 },
    fertilityDraw: 0.085,
    continuousPenalty: 0.35,
    rowCrop: true,
    labourIntensive: 2.0,
    staple: true,
    // Before processing contracts arrive, potatoes are a garden and local-market
    // crop only — you cannot sell a thousand acres of them in 1890.
    marketCapAcresBefore: { year: 1960, acres: 12 },
    note: 'A few acres feed the household and the local market. Only the processing plants made it a field crop.',
  },
  hay: {
    id: 'hay',
    name: 'Hay',
    unit: 'ton',
    category: 'forage',
    from: 1875,
    to: 2000,
    yieldBase: 1.5,
    seedRate: 0,
    work: { harvest: 0.12 },
    harvestWindowDays: 45,
    sensitivity: { drought: 1.1, frost: 0.2, hail: 0.5, rust: 0.1, excessWet: 0.8 },
    fertilityDraw: 0.012,
    fertilityRestore: 0.02, // sod builds soil back
    continuousPenalty: 0,
    feedOnly: true,
    note: 'Winter feed. No hay, no livestock, and in a horse-powered era that means no farm.',
  },
  pasture: {
    id: 'pasture',
    name: 'Pasture',
    unit: 'ton',
    category: 'forage',
    from: 1875,
    to: 2000,
    yieldBase: 0.9,
    seedRate: 0,
    work: {},
    harvestWindowDays: 0,
    sensitivity: { drought: 1.0, frost: 0.1, hail: 0.1, rust: 0, excessWet: 0.5 },
    fertilityDraw: 0,
    fertilityRestore: 0.03,
    continuousPenalty: 0,
    feedOnly: true,
    grazed: true,
    note: 'Grass, standing. Costs nothing to work and rebuilds the ground under it.',
  },
  fallow: {
    id: 'fallow',
    name: 'Summerfallow',
    unit: '',
    category: 'fallow',
    from: 1875,
    to: 2000,
    yieldBase: 0,
    seedRate: 0,
    work: { till: 0.13 }, // worked repeatedly all summer to kill weeds
    harvestWindowDays: 0,
    sensitivity: {},
    fertilityDraw: 0,
    fertilityRestore: 0.075,
    // Fallow banks moisture for next year — the whole point on dry land.
    moistureBank: 0.28,
    continuousPenalty: 0,
    note: 'A year of no crop, tilled black all summer. Bankrupt in the short term, and for fifty years the only weed control there was.',
  },
  idle: {
    id: 'idle',
    name: 'Idle',
    unit: '',
    category: 'fallow',
    from: 1875,
    to: 2000,
    yieldBase: 0,
    seedRate: 0,
    work: {},
    harvestWindowDays: 0,
    sensitivity: {},
    fertilityDraw: 0,
    fertilityRestore: 0.015,
    continuousPenalty: 0,
    // Idle land goes back to weeds and brush, and costs to bring back.
    reverts: true,
    note: 'Left alone. Weeds seed it, brush creeps in, and it costs money to bring back.',
  },
  bush: {
    id: 'bush',
    name: 'Bush',
    unit: 'cord',
    category: 'bush',
    from: 1875,
    to: 2000,
    yieldBase: 0.6, // cords of firewood per acre per year, sustainably
    seedRate: 0,
    work: { harvest: 0.3 },
    harvestWindowDays: 90, // cut in winter, when there is nothing else to do
    sensitivity: {},
    fertilityDraw: 0,
    fertilityRestore: 0.01,
    winterWork: true,
    note: 'Unbroken poplar and oak. Firewood, fence posts and shelter, and the wood heat that got a family through January.',
  },
};

// Wheat varieties. Each is a real cultivar with the property that made it
// matter; the maturity number is why Marquis changed the prairies — ten days
// earlier meant the crop was in the bin before the frost.
export const WHEAT_VARIETIES = [
  {
    id: 'redFife',
    name: 'Red Fife',
    from: 1875,
    yieldFactor: 1.0,
    maturityDays: 124,
    rustResist: 0.0,
    note: 'The wheat that proved the prairies could grow bread grain. Late, and it knows it.',
  },
  {
    id: 'marquis',
    name: 'Marquis',
    from: 1909,
    yieldFactor: 1.12,
    maturityDays: 114, // ~10 days earlier than Red Fife
    rustResist: 0.1,
    note: "Charles Saunders' cross. Ten days earlier than Red Fife, and it took the prairies in five years.",
  },
  {
    id: 'thatcher',
    name: 'Thatcher',
    from: 1935,
    yieldFactor: 1.15,
    maturityDays: 112,
    rustResist: 0.65,
    note: 'Bred against stem rust and released the year rust took the crop. Timing is everything.',
  },
  {
    id: 'selkirk',
    name: 'Selkirk',
    from: 1954,
    yieldFactor: 1.26,
    maturityDays: 110,
    rustResist: 0.85, // resistant to race 15B, which broke Thatcher in 1954
    note: 'Resistant to race 15B, the rust that went through Thatcher like it was not there.',
  },
  {
    id: 'neepawa',
    name: 'Neepawa',
    from: 1969,
    yieldFactor: 1.4,
    maturityDays: 108,
    rustResist: 0.85,
    note: 'The long-running standard for Canada Western Red Spring. Named for the town.',
  },
  {
    id: 'modern',
    name: 'Modern CWRS',
    from: 1986,
    yieldFactor: 1.62,
    maturityDays: 104,
    rustResist: 0.9,
    note: 'Forty years of public breeding, compounding.',
  },
];

export const CROP_LIST = Object.values(CROPS);

/** Crops a farmer could actually plant in a given year. */
export function cropsAvailable(year) {
  return CROP_LIST.filter((c) => year >= c.from && year <= c.to);
}

/** The best wheat variety on offer in a given year. */
export function bestWheatVariety(year) {
  let best = WHEAT_VARIETIES[0];
  for (const v of WHEAT_VARIETIES) {
    if (v.from <= year && v.from >= best.from) best = v;
  }
  return best;
}

export function crop(id) {
  const c = CROPS[id];
  if (!c) throw new Error(`Unknown crop id: ${id}`);
  return c;
}
