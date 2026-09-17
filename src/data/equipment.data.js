// Implements, power and buildings, 1875-2000.
//
// `capacity` is acres per working day for the operation this machine performs,
// assuming it has the draft power it needs. Capacity is the hard constraint in
// this game: yield tells you what grew, capacity tells you what you got off
// before the snow. A man with a cradle scythe cuts an acre and a half a day and
// no amount of good weather changes that.
//
// `draft` is horse-equivalents. Power units supply it, implements consume it.
// `price` is nominal dollars in `priceYear`; the engine inflates from there, so
// a binder that cost $300 in 1882 does not cost $300 in 1975.

export const EQUIPMENT = {
  // ---- POWER ------------------------------------------------------------
  oxen: {
    id: 'oxen', name: 'Yoke of oxen', category: 'power',
    from: 1875, to: 1925, price: 70, priceYear: 1875,
    draft: 1.6, lifespanYears: 12,
    // Oxen live on hay and grass. Horses want oats, which is an acre you are
    // not selling. That trade is why a poor homesteader started with oxen.
    feed: { hay: 2.2, oats: 0 },
    upkeep: 4,
    note: 'Slow, strong, stubborn, and they winter on slough hay. The poor settler’s engine.',
  },
  horses: {
    id: 'horses', name: 'Team of horses', category: 'power',
    from: 1875, to: 1965, price: 165, priceYear: 1875,
    draft: 2.4, lifespanYears: 15,
    feed: { hay: 2.6, oats: 55 },
    upkeep: 7,
    breeds: true, // a mare replaces herself; this is why horse power compounded
    note: 'Twice the speed of oxen and they eat like it. Fifty-five bushels of oats a year, each.',
  },
  steamTraction: {
    id: 'steamTraction', name: 'Steam traction engine', category: 'power',
    from: 1885, to: 1928, price: 1900, priceYear: 1890,
    draft: 18, lifespanYears: 22,
    fuelCostPerDay: 6, // coal and a water wagon
    crewRequired: 2, // an engineer and a tankman, minimum
    upkeep: 55,
    note: 'Enormous, thirsty, and it needs its own crew. Breaks sod and drives a separator like nothing before it.',
  },
  gasTractor: {
    id: 'gasTractor', name: 'Gas tractor', category: 'power',
    from: 1912, to: 1935, price: 850, priceYear: 1918,
    draft: 9, lifespanYears: 14,
    fuelCostPerDay: 2.1, upkeep: 30,
    reliability: 0.82, // early tractors spent real time broken down
    note: 'Steel wheels, hand crank, and a fair chance it is down when you need it. Eats no oats in the winter.',
  },
  rowCropTractor: {
    id: 'rowCropTractor', name: 'Row-crop tractor', category: 'power',
    from: 1928, to: 1958, price: 1150, priceYear: 1930,
    draft: 16, lifespanYears: 18,
    fuelCostPerDay: 2.6, upkeep: 38, reliability: 0.93,
    note: 'Narrow front, power take-off, and it will cultivate a row crop without walking it down.',
  },
  rubberTractor: {
    id: 'rubberTractor', name: 'Rubber-tired tractor', category: 'power',
    from: 1938, to: 1968, price: 1450, priceYear: 1938,
    draft: 24, lifespanYears: 18,
    fuelCostPerDay: 3.2, upkeep: 45, reliability: 0.95,
    // Rubber over steel was worth roughly a quarter more work done per day.
    capacityBonus: 1.25,
    note: 'Rubber instead of steel lugs. Faster in the field and it will drive to town on its own tires.',
  },
  dieselTractor: {
    id: 'dieselTractor', name: 'Diesel tractor', category: 'power',
    from: 1955, to: 1985, price: 4200, priceYear: 1958,
    draft: 48, lifespanYears: 20,
    fuelCostPerDay: 5.5, upkeep: 90, reliability: 0.96,
    note: 'Diesel, live hydraulics and a three-point hitch. The first tractor that could hold a full day’s work at full load.',
  },
  fourWD: {
    id: 'fourWD', name: 'Four-wheel-drive tractor', category: 'power',
    // Versatile built the first of these in Winnipeg in 1966 — a prairie
    // machine, designed for prairie acres.
    from: 1966, to: 2000, price: 19500, priceYear: 1967,
    draft: 130, lifespanYears: 20,
    fuelCostPerDay: 22, upkeep: 400, reliability: 0.95,
    note: 'Articulated, four driven wheels, built in Winnipeg for country exactly like this.',
  },
  bigFourWD: {
    id: 'bigFourWD', name: 'High-horsepower 4WD', category: 'power',
    from: 1985, to: 2000, price: 118000, priceYear: 1988,
    draft: 280, lifespanYears: 18,
    fuelCostPerDay: 58, upkeep: 1900, reliability: 0.96,
    cab: true,
    note: 'Cab, air conditioning, radio, and more power than the whole district had in 1920.',
  },

  // ---- TILLAGE ----------------------------------------------------------
  walkingPlow: {
    id: 'walkingPlow', name: 'Walking plow', category: 'tillage', operation: 'till',
    from: 1875, to: 1915, price: 14, priceYear: 1875,
    capacity: 1.1, draftNeeded: 1.5, lifespanYears: 15, upkeep: 2,
    canBreakSod: true,
    note: 'One furrow at a walking pace, with your own weight on the handles. This is how the prairie was opened.',
  },
  sulkyPlow: {
    id: 'sulkyPlow', name: 'Sulky plow', category: 'tillage', operation: 'till',
    from: 1881, to: 1935, price: 48, priceYear: 1882,
    capacity: 3.0, draftNeeded: 3.5, lifespanYears: 18, upkeep: 4,
    canBreakSod: true,
    note: 'A seat. After six years of walking behind one, the seat is the entire argument.',
  },
  gangPlow: {
    id: 'gangPlow', name: 'Gang plow', category: 'tillage', operation: 'till',
    from: 1893, to: 1950, price: 72, priceYear: 1895,
    capacity: 5.5, draftNeeded: 6, lifespanYears: 18, upkeep: 6,
    canBreakSod: true,
    note: 'Two and three bottoms at once, and a six-horse team to pull it.',
  },
  discHarrow: {
    id: 'discHarrow', name: 'Disc harrow', category: 'tillage', operation: 'till',
    from: 1888, to: 2000, price: 40, priceYear: 1890,
    capacity: 7, draftNeeded: 4, lifespanYears: 20, upkeep: 4,
    note: 'Works a seedbed down fast. Does not turn sod, so it never replaced the plow outright.',
  },
  oneWayDisc: {
    id: 'oneWayDisc', name: 'One-way disc', category: 'tillage', operation: 'till',
    from: 1925, to: 1975, price: 310, priceYear: 1928,
    capacity: 22, draftNeeded: 18, lifespanYears: 20, upkeep: 16,
    // The one-way made summerfallow cheap and chewed the soil to dust doing it.
    erosionFactor: 1.35,
    note: 'The machine that made summerfallow cheap, and helped hand the topsoil to the wind in the thirties.',
  },
  fieldCultivator: {
    id: 'fieldCultivator', name: 'Field cultivator', category: 'tillage', operation: 'till',
    from: 1946, to: 2000, price: 900, priceYear: 1950,
    capacity: 60, draftNeeded: 42, lifespanYears: 20, upkeep: 45,
    erosionFactor: 0.8,
    note: 'Sweeps under the surface and leaves the trash on top where it holds the ground down.',
  },
  heavyCultivator: {
    id: 'heavyCultivator', name: 'Heavy-duty cultivator', category: 'tillage', operation: 'till',
    from: 1972, to: 2000, price: 9500, priceYear: 1975,
    capacity: 165, draftNeeded: 120, lifespanYears: 20, upkeep: 320,
    erosionFactor: 0.75,
    note: 'Forty feet of it behind a four-wheel-drive. A half-section in a long day.',
  },

  // ---- SEEDING ----------------------------------------------------------
  broadcastSeeding: {
    id: 'broadcastSeeding', name: 'Broadcast by hand', category: 'seeding', operation: 'seed',
    from: 1875, to: 1900, price: 3, priceYear: 1875,
    capacity: 7, draftNeeded: 0, lifespanYears: 30, upkeep: 0,
    // Broadcast seed lands where it lands. A drill puts it at depth, in a row.
    yieldFactor: 0.85, seedWaste: 1.25,
    note: 'A sack on your hip and a swing of the arm. A quarter of the seed never comes up.',
  },
  seedDrill: {
    id: 'seedDrill', name: 'Seed drill', category: 'seeding', operation: 'seed',
    from: 1880, to: 1955, price: 88, priceYear: 1882,
    capacity: 12, draftNeeded: 4, lifespanYears: 20, upkeep: 7,
    yieldFactor: 1.0, seedWaste: 1.0,
    note: 'Seed at an even depth in a row. Pays for itself in the seed it stops wasting.',
  },
  pressDrill: {
    id: 'pressDrill', name: 'Press drill', category: 'seeding', operation: 'seed',
    from: 1920, to: 1985, price: 340, priceYear: 1925,
    capacity: 24, draftNeeded: 14, lifespanYears: 20, upkeep: 20,
    yieldFactor: 1.06, seedWaste: 0.95,
    note: 'Presses the seed row closed behind the opener. Better contact, better germination on dry land.',
  },
  airSeeder: {
    id: 'airSeeder', name: 'Air seeder', category: 'seeding', operation: 'seed',
    from: 1976, to: 2000, price: 27000, priceYear: 1980,
    capacity: 95, draftNeeded: 90, lifespanYears: 16, upkeep: 850,
    yieldFactor: 1.1, seedWaste: 0.9,
    note: 'Seed and fertilizer blown down a manifold from one big tank. One fill, a hundred acres.',
  },
  airDrill: {
    id: 'airDrill', name: 'Air drill', category: 'seeding', operation: 'seed',
    from: 1990, to: 2000, price: 88000, priceYear: 1993,
    capacity: 175, draftNeeded: 190, lifespanYears: 15, upkeep: 2600,
    yieldFactor: 1.16, seedWaste: 0.85,
    enablesZeroTill: true,
    note: 'Single-pass seeding straight into last year’s stubble. No tillage at all, if you trust it.',
  },

  // ---- HARVEST ----------------------------------------------------------
  cradleScythe: {
    id: 'cradleScythe', name: 'Cradle scythe', category: 'harvest', operation: 'harvest',
    from: 1875, to: 1890, price: 4, priceYear: 1875,
    capacity: 1.5, draftNeeded: 0, lifespanYears: 10, upkeep: 1,
    needsThreshing: true, fieldLoss: 0.08,
    note: 'Cut by hand, bound by hand, stooked by hand. Two acres is a very long day.',
  },
  reaper: {
    id: 'reaper', name: 'Reaper', category: 'harvest', operation: 'harvest',
    from: 1875, to: 1895, price: 115, priceYear: 1875,
    capacity: 8, draftNeeded: 3, lifespanYears: 15, upkeep: 9,
    needsThreshing: true, fieldLoss: 0.07,
    // A reaper cuts but does not bind; someone walks behind tying sheaves.
    extraLabourPerAcre: 0.05,
    note: 'Cuts and lays it in a swath. Someone still has to walk behind and tie every sheaf.',
  },
  twineBinder: {
    id: 'twineBinder', name: 'Twine binder', category: 'harvest', operation: 'harvest',
    from: 1880, to: 1945, price: 305, priceYear: 1882,
    capacity: 13, draftNeeded: 4, lifespanYears: 18, upkeep: 18,
    needsThreshing: true, fieldLoss: 0.05,
    consumable: { twine: 2.2 }, // lb of binder twine per acre
    note: 'Cuts, gathers and ties the sheaf itself. Three hundred dollars in 1882, and worth every cent and every year of the note.',
  },
  pullCombine: {
    id: 'pullCombine', name: 'Pull-type combine', category: 'harvest', operation: 'harvest',
    from: 1930, to: 1965, price: 1250, priceYear: 1935,
    capacity: 21, draftNeeded: 16, lifespanYears: 18, upkeep: 75,
    needsThreshing: false, fieldLoss: 0.07,
    note: 'Cuts and threshes in one pass. The threshing crew, the stooking and half of harvest simply stop existing.',
  },
  selfPropelledCombine: {
    id: 'selfPropelledCombine', name: 'Self-propelled combine', category: 'harvest', operation: 'harvest',
    // Massey-Harris built the No. 21 in 1941 — the first practical
    // self-propelled combine, and a Canadian machine.
    from: 1941, to: 1978, price: 3600, priceYear: 1941,
    capacity: 34, draftNeeded: 0, selfPowered: true,
    lifespanYears: 18, fuelCostPerDay: 5, upkeep: 180, fieldLoss: 0.055,
    needsThreshing: false,
    note: 'Its own engine, its own wheels, no tractor and no opening round to cut by hand. Massey-Harris, 1941.',
  },
  modernCombine: {
    id: 'modernCombine', name: 'Cab combine', category: 'harvest', operation: 'harvest',
    from: 1968, to: 2000, price: 21000, priceYear: 1970,
    capacity: 72, draftNeeded: 0, selfPowered: true,
    lifespanYears: 16, fuelCostPerDay: 26, upkeep: 900, fieldLoss: 0.045,
    cab: true, needsThreshing: false,
    note: 'Glassed-in cab, hydrostatic drive, and a hopper you unload on the move.',
  },
  rotaryCombine: {
    id: 'rotaryCombine', name: 'Rotary combine', category: 'harvest', operation: 'harvest',
    from: 1977, to: 2000, price: 62000, priceYear: 1980,
    capacity: 118, draftNeeded: 0, selfPowered: true,
    lifespanYears: 15, fuelCostPerDay: 52, upkeep: 2400, fieldLoss: 0.035,
    cab: true, needsThreshing: false,
    note: 'Axial rotor instead of a straw walker. Gentler on the grain and it will not plug in tough straw.',
  },
  swather: {
    id: 'swather', name: 'Swather', category: 'harvest', operation: 'swath',
    from: 1946, to: 2000, price: 1100, priceYear: 1950,
    capacity: 55, draftNeeded: 0, selfPowered: true,
    lifespanYears: 18, fuelCostPerDay: 6, upkeep: 120,
    // Canola and rapeseed shatter if they stand to full ripeness. No swather,
    // no oilseed acres.
    enablesCrops: ['rapeseed', 'canola'],
    note: 'Cuts the crop and lays it in a windrow to finish. Without one you cannot grow an oilseed at all.',
  },

  // ---- THRESHING --------------------------------------------------------
  flail: {
    id: 'flail', name: 'Flail', category: 'threshing', operation: 'thresh',
    from: 1875, to: 1888, price: 2, priceYear: 1875,
    capacity: 0.7, draftNeeded: 0, lifespanYears: 20, upkeep: 0,
    note: 'Two sticks and a leather hinge, on a barn floor, all winter.',
  },
  horsePowerThresher: {
    id: 'horsePowerThresher', name: 'Horse-power separator', category: 'threshing', operation: 'thresh',
    from: 1878, to: 1910, price: 420, priceYear: 1880,
    capacity: 8, draftNeeded: 6, lifespanYears: 18, upkeep: 30,
    note: 'A sweep of horses walking a circle to drive the cylinder. Better than a flail by an order of magnitude.',
  },
  separator: {
    id: 'separator', name: 'Threshing separator', category: 'threshing', operation: 'thresh',
    from: 1888, to: 1948, price: 950, priceYear: 1890,
    capacity: 32, draftNeeded: 0, needsBeltPower: true,
    lifespanYears: 22, upkeep: 70, crewRequired: 8,
    note: 'Belted to a steam engine or a big tractor. Needs a crew of eight and feeds them all at your table.',
  },

  // ---- HANDLING AND STORAGE --------------------------------------------
  wagon: {
    id: 'wagon', name: 'Grain wagon', category: 'handling',
    from: 1875, to: 1945, price: 55, priceYear: 1875,
    haulCapacity: 45, draftNeeded: 2, lifespanYears: 20, upkeep: 4,
    note: 'Forty-five bushels a trip to the elevator, and fourteen miles of mud each way.',
  },
  grainTruck: {
    id: 'grainTruck', name: 'Grain truck', category: 'handling',
    from: 1926, to: 2000, price: 720, priceYear: 1930,
    haulCapacity: 240, selfPowered: true, lifespanYears: 16,
    fuelCostPerDay: 3, upkeep: 90,
    note: 'Three-ton, wooden box, hoist on the back. It collapses the haul that shaped the whole farm.',
  },
  auger: {
    id: 'auger', name: 'Grain auger', category: 'handling',
    from: 1950, to: 2000, price: 340, priceYear: 1952,
    lifespanYears: 20, upkeep: 30,
    // Before augers, every bushel into a bin went up a ladder on a shoulder.
    labourSaved: 0.25,
    note: 'The end of shovelling grain up a ladder. Nobody who did it by hand ever went back.',
  },
  woodGranary: {
    id: 'woodGranary', name: 'Wooden granary', category: 'storage',
    from: 1875, to: 2000, price: 90, priceYear: 1880,
    storage: 2200, lifespanYears: 40, upkeep: 6,
    spoilRate: 0.03,
    note: 'Board and batten, mice and all. Holds the crop when the elevator will not take it.',
  },
  steelBin: {
    id: 'steelBin', name: 'Steel bin', category: 'storage',
    from: 1952, to: 2000, price: 900, priceYear: 1955,
    storage: 3400, lifespanYears: 45, upkeep: 14,
    spoilRate: 0.012,
    note: 'Corrugated steel on a concrete pad. Dry, tight, and no mice.',
  },
  hopperBin: {
    id: 'hopperBin', name: 'Hopper-bottom bin', category: 'storage',
    from: 1968, to: 2000, price: 4200, priceYear: 1972,
    storage: 5000, lifespanYears: 45, upkeep: 40,
    spoilRate: 0.005, aeration: true,
    note: 'Cone bottom on steel legs. Empties itself and holds tough grain without going out of condition.',
  },
  barn: {
    id: 'barn', name: 'Barn', category: 'building',
    from: 1875, to: 2000, price: 280, priceYear: 1880,
    livestockCapacity: 24, hayStorage: 45, lifespanYears: 60, upkeep: 14,
    note: 'Stock below, hay above. The building the whole yard is arranged around.',
  },
  hogBarn: {
    id: 'hogBarn', name: 'Confinement hog barn', category: 'building',
    // Manitoba's hog industry went industrial in the late 1990s, driven by the
    // loss of the Crow rate making it cheaper to ship meat than feed grain.
    from: 1974, to: 2000, price: 90000, priceYear: 1985,
    livestockCapacity: 600, species: 'hogs', lifespanYears: 30, upkeep: 4500,
    note: 'Slatted floors, controlled climate, six hundred head. It is a factory and it is financed like one.',
  },
};

export const EQUIPMENT_LIST = Object.values(EQUIPMENT);

export function equipmentAvailable(year, category = null) {
  return EQUIPMENT_LIST.filter(
    (e) => year >= e.from && year <= e.to && (!category || e.category === category)
  );
}

export function equipment(id) {
  const e = EQUIPMENT[id];
  if (!e) throw new Error(`Unknown equipment id: ${id}`);
  return e;
}
