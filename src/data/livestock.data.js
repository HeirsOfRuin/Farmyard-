// Livestock, 1875-2000.
//
// Feed is the whole story. An animal is a machine for turning hay and grain
// into cash and manure, and if you have not grown the feed by October you sell
// the animal in November at whatever they give you. Feed demand is in tons of
// hay and bushels of grain per head per year.

export const LIVESTOCK = {
  dairyCow: {
    id: 'dairyCow', name: 'Dairy cow', unit: 'head',
    from: 1875, to: 2000,
    price: 34, priceYear: 1875,
    feed: { hay: 2.4, grain: 22 },
    // Output rises hugely over the century with breeding and feeding.
    outputAnchors: [[1875, 2200], [1920, 3400], [1950, 5200], [1975, 9500], [2000, 15500]], // lb milk/yr
    outputUnit: 'lb milk',
    breedRate: 0.42, mortality: 0.05, cullAge: 9,
    // Cream cheques were the money that came in every week, all year, when the
    // grain cheque came once in November. Many farms survived the thirties on
    // exactly this.
    steadyIncome: true,
    labourPerHead: 0.9,
    note: 'The cream cheque comes every week. In a bad grain year it is the only money on the place.',
  },
  beefCow: {
    id: 'beefCow', name: 'Beef cow', unit: 'head',
    from: 1875, to: 2000,
    price: 26, priceYear: 1875,
    feed: { hay: 2.8, grain: 6 },
    outputAnchors: [[1875, 0.82], [1950, 0.88], [2000, 0.93]], // calves weaned per cow
    outputUnit: 'calf',
    breedRate: 0.88, mortality: 0.04, cullAge: 11,
    grazes: true, // converts pasture and slough hay into money
    labourPerHead: 0.22,
    note: 'Eats grass you cannot sell and hay off ground you cannot crop. Turns poor land into cattle.',
  },
  hogs: {
    id: 'hogs', name: 'Hogs', unit: 'head',
    from: 1875, to: 2000,
    price: 7, priceYear: 1875,
    feed: { hay: 0, grain: 15 },
    outputAnchors: [[1875, 1.0], [1950, 1.15], [2000, 1.5]],
    outputUnit: 'market hog',
    // Hogs turn barley into money in six months instead of a year. Fast to
    // build up and fast to liquidate, which cuts both ways.
    breedRate: 7.5, mortality: 0.09, cullAge: 4,
    marketCycleYears: 4, // the hog cycle is real and it is brutal
    labourPerHead: 0.14,
    note: 'Barley in one end, money out the other, in six months. The hog cycle will still take a run at you every four years.',
  },
  chickens: {
    id: 'chickens', name: 'Poultry', unit: 'bird',
    from: 1875, to: 2000,
    price: 0.45, priceYear: 1875,
    feed: { hay: 0, grain: 0.9 },
    outputAnchors: [[1875, 90], [1930, 130], [1960, 220], [2000, 280]], // eggs/yr
    outputUnit: 'egg',
    breedRate: 2.2, mortality: 0.2, cullAge: 3,
    steadyIncome: true,
    // Egg money was the wife's money, and it bought what the grain cheque did
    // not stretch to. That is not sentiment, it is how the accounts worked.
    householdIncome: true,
    labourPerHead: 0.012,
    note: 'Egg money. Small, weekly, reliable, and traditionally not the grain account’s business.',
  },
  sheep: {
    id: 'sheep', name: 'Sheep', unit: 'head',
    from: 1875, to: 1975,
    price: 4.5, priceYear: 1875,
    feed: { hay: 0.7, grain: 3 },
    outputAnchors: [[1875, 6.5], [1950, 8.5], [1975, 9.5]], // lb wool/yr, plus lambs
    outputUnit: 'lb wool',
    breedRate: 1.25, mortality: 0.11, cullAge: 7,
    grazes: true,
    labourPerHead: 0.16,
    note: 'Wool and lambs off grass. Predators and a collapsing wool price took them off most farms by the seventies.',
  },
};

// Prices per head/bird, nominal. Livestock lagged grain in the good years and
// held up better in the bad ones, which is the entire argument for mixed
// farming.
export const LIVESTOCK_PRICING = {
  dairyCow: [[1875, 34], [1900, 42], [1920, 95], [1933, 38], [1950, 175], [1975, 480], [2000, 1350]],
  beefCow: [[1875, 26], [1900, 33], [1920, 72], [1933, 22], [1950, 145], [1975, 340], [2000, 900]],
  hogs: [[1875, 7], [1900, 9], [1920, 26], [1933, 6], [1950, 42], [1975, 95], [2000, 165]],
  chickens: [[1875, 0.45], [1900, 0.5], [1920, 1.1], [1933, 0.4], [1950, 1.6], [1975, 3.2], [2000, 7.5]],
  sheep: [[1875, 4.5], [1900, 5.5], [1920, 14], [1933, 4], [1950, 22], [1975, 58]],
};

// Product prices, per output unit, nominal.
export const PRODUCT_PRICING = {
  milk: [[1875, 0.011], [1900, 0.012], [1920, 0.028], [1933, 0.016], [1950, 0.042], [1975, 0.105], [2000, 0.31]], // $/lb
  calf: [[1875, 12], [1900, 16], [1920, 38], [1933, 11], [1950, 78], [1975, 195], [2000, 620]],
  'market hog': [[1875, 7], [1900, 9], [1920, 26], [1933, 6], [1950, 42], [1975, 95], [2000, 165]],
  egg: [[1875, 0.011], [1900, 0.013], [1920, 0.035], [1933, 0.015], [1950, 0.037], [1975, 0.065], [2000, 0.095]], // $/egg
  'lb wool': [[1875, 0.2], [1900, 0.16], [1920, 0.42], [1933, 0.11], [1950, 0.58], [1975, 0.72]],
};

export const LIVESTOCK_LIST = Object.values(LIVESTOCK);

export function livestockAvailable(year) {
  return LIVESTOCK_LIST.filter((l) => year >= l.from && year <= l.to);
}

export function livestock(id) {
  const l = LIVESTOCK[id];
  if (!l) throw new Error(`Unknown livestock id: ${id}`);
  return l;
}
