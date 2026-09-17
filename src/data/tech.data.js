// Technologies and practices that are not machines you park in the yard.
//
// Each has the year it became available here, what it costs, and what it does.
// Several are not farm inputs at all — electricity, the telephone, the gravel
// road — but they changed farm life and farm labour enough that leaving them
// out would flatter the century.

export const TECHNOLOGIES = {
  // ---- AGRONOMY ---------------------------------------------------------
  summerfallowRotation: {
    id: 'summerfallowRotation', name: 'Summerfallow rotation', category: 'practice',
    from: 1885, cost: 0,
    effect: { weedControl: 0.35, moistureBank: 0.28 },
    note: 'A year in three with no crop. Costs a third of your acres and is the only weed control there is.',
  },
  manureSpreading: {
    id: 'manureSpreading', name: 'Manure spreading', category: 'practice',
    from: 1875, cost: 45, costYear: 1890,
    requiresLivestock: true,
    effect: { fertility: 0.02 },
    note: 'The one fertility input a farm made for itself, and the reason mixed farms outlasted straight grain ones.',
  },
  commercialFertilizer: {
    id: 'commercialFertilizer', name: 'Commercial fertilizer', category: 'input',
    // Broad prairie adoption came after the war, with cheap nitrogen.
    from: 1948, costPerAcre: 2.4, costYear: 1950,
    effect: { yieldFactor: 1.22, fertilityOffset: 0.05 },
    note: 'Bought nitrogen. Breaks the link between what the soil has and what the crop can do.',
  },
  anhydrousAmmonia: {
    id: 'anhydrousAmmonia', name: 'Anhydrous ammonia', category: 'input',
    from: 1962, costPerAcre: 4.1, costYear: 1965,
    requires: 'commercialFertilizer',
    effect: { yieldFactor: 1.12, fertilityOffset: 0.03 },
    note: 'Nitrogen knifed in as a liquid under pressure. Cheaper per pound and it will put you in hospital if you are careless.',
  },
  herbicide24D: {
    id: 'herbicide24D', name: '2,4-D', category: 'input',
    // Released commercially in 1946; on prairie fields within a couple of years.
    from: 1947, costPerAcre: 0.9, costYear: 1950,
    effect: { weedControl: 0.55, fallowNeed: -0.4 },
    note: 'Kills broadleaf weeds and leaves the wheat. It is what finally made summerfallow optional.',
  },
  modernHerbicide: {
    id: 'modernHerbicide', name: 'Modern herbicide program', category: 'input',
    from: 1978, costPerAcre: 11, costYear: 1982,
    requires: 'herbicide24D',
    effect: { weedControl: 0.85, fallowNeed: -0.9, yieldFactor: 1.08 },
    note: 'Grass and broadleaf both, pre- and post-emergent. Summerfallow stops making any sense at all.',
  },
  cropRotationScience: {
    id: 'cropRotationScience', name: 'Planned rotation', category: 'practice',
    from: 1930, cost: 0,
    effect: { fertility: 0.012, diseaseResist: 0.2 },
    note: 'Extension-service advice, finally taken seriously after the dust blew. Break the disease cycle, spread the risk.',
  },
  zeroTill: {
    id: 'zeroTill', name: 'Zero tillage', category: 'practice',
    from: 1991, costPerAcre: 3.5, costYear: 1993,
    requires: 'modernHerbicide', requiresImplement: 'airDrill',
    effect: { erosion: 0.15, moistureBank: 0.22, fuelUse: 0.45, yieldFactor: 1.05 },
    note: 'Seed straight into the stubble and never touch the soil again. Sixty years of tillage practice, reversed.',
  },
  cropInsurance: {
    id: 'cropInsurance', name: 'Crop insurance', category: 'finance',
    // Manitoba Crop Insurance Corporation was established in 1960.
    from: 1960, costPerAcre: 1.6, costYear: 1962,
    effect: { disasterFloor: 0.55 },
    note: 'Premiums every year for a floor under the worst one. The arithmetic only looks foolish until it does not.',
  },

  // ---- INFRASTRUCTURE ---------------------------------------------------
  wellAndPump: {
    id: 'wellAndPump', name: 'Drilled well and pump', category: 'infrastructure',
    from: 1875, cost: 85, costYear: 1885,
    effect: { droughtResist: 0.12, livestockCapacity: 1.3, health: 0.05 },
    note: 'Water that does not have to be hauled. On a dry-land farm it is the first real capital improvement.',
  },
  telephone: {
    id: 'telephone', name: 'Rural telephone', category: 'infrastructure',
    // Manitoba Government Telephones, publicly owned from 1908, pushed rural
    // lines much earlier here than in most places.
    from: 1908, cost: 38, costYear: 1910, annualCost: 14,
    effect: { marketInfo: 0.15, isolation: -0.3 },
    note: 'A party line to the neighbours and the elevator agent. You find out the price before you hitch up, not after.',
  },
  ruralElectrification: {
    id: 'ruralElectrification', name: 'Rural electrification', category: 'infrastructure',
    // The Manitoba Power Commission's farm electrification program began in
    // 1945; most farms in settled districts were on by the mid-1950s.
    from: 1946, cost: 420, costYear: 1948, annualCost: 46,
    effect: { labourSaved: 0.18, livestockCapacity: 1.25, health: 0.08, quality: 0.3 },
    note: 'Yard light, water pump, milking machine, and a wife who is not carrying lamps. It changes the house more than the field.',
  },
  gravelRoad: {
    id: 'gravelRoad', name: 'All-weather road', category: 'infrastructure',
    from: 1930, cost: 0, // municipal, not yours — but it arrives when it arrives
    automatic: true,
    effect: { haulCost: 0.6 },
    note: 'Gravel to the corner. You can get a load out in April, which you could not before.',
  },
  farmRadio: {
    id: 'farmRadio', name: 'Farm radio', category: 'infrastructure',
    from: 1925, cost: 55, costYear: 1928,
    effect: { marketInfo: 0.2, weatherWarning: 0.15, isolation: -0.4 },
    note: 'Noon markets and the weather, every day. The first time the outside world arrived on schedule.',
  },

  // ---- MARKETING --------------------------------------------------------
  grainElevator: {
    id: 'grainElevator', name: 'Line elevator at the siding', category: 'marketing',
    from: 1882, automatic: true,
    effect: { haulMiles: 0.35, grading: true },
    note: 'A tall wooden elevator at the railway siding. It is also the only buyer for thirty miles, and it knows that.',
  },
  coopElevator: {
    id: 'coopElevator', name: 'Pool elevator', category: 'marketing',
    // The Manitoba Wheat Pool organised in 1924 and took over elevators in 1925.
    from: 1925, cost: 60, costYear: 1925,
    effect: { priceBonus: 0.05, patronageDividend: true },
    note: 'Farmer-owned, and it pays a patronage dividend back. Joining is a political act as much as a commercial one.',
  },
  wheatBoard: {
    id: 'wheatBoard', name: 'Canadian Wheat Board', category: 'marketing',
    // Voluntary from 1935, compulsory for wheat from 1943.
    from: 1935, automatic: true, compulsoryFrom: 1943,
    effect: { priceVolatility: 0.55, initialPayment: true },
    note: 'An initial payment at delivery, interim and final payments later. Less upside, and a floor you can plan against.',
  },
  onFarmStorage: {
    id: 'onFarmStorage', name: 'On-farm storage strategy', category: 'marketing',
    from: 1952, cost: 0,
    requiresImplement: 'steelBin',
    effect: { canHoldGrain: true },
    note: 'Hold the crop for a better price instead of dumping it all in November.',
  },
};

export const TECH_LIST = Object.values(TECHNOLOGIES);

export function techAvailable(year) {
  return TECH_LIST.filter((t) => year >= t.from && (!t.to || year <= t.to));
}

export function tech(id) {
  const t = TECHNOLOGIES[id];
  if (!t) throw new Error(`Unknown technology id: ${id}`);
  return t;
}
