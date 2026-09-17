// Recurring hazards and windfalls.
//
// These are the things that can happen in any year, weighted by region and era.
// Dated, certain history (the CPR arriving, the Crow rate, the 1981 interest
// shock) lives in history.data.js instead — that file is the century's script,
// this one is its weather.
//
// `scope` decides how much of the farm an event touches, and it matters more
// than severity: a hailstorm that flattens one quarter is a bad year, the same
// storm across every quarter is the end of the farm.
//   all    - the whole farm
//   most   - roughly two-thirds of fields
//   some   - roughly a third
//   one    - a single field
//
// `severity` is [min, max]; the engine rolls within it and the crop's own
// sensitivity to the matching tag scales the result.

export const EVENT_SCOPES = { all: 1.0, most: 0.65, some: 0.33, one: 0.12 };

export const EVENTS = {
  // ---- DROUGHT ----------------------------------------------------------
  dryYear: {
    id: 'dryYear', name: 'Dry year', category: 'weather', tag: 'drought',
    weight: 10, scope: 'all', severity: [0.10, 0.24],
    narrative: 'The rains quit in June. The crop went short and thin and headed out too soon.',
  },
  drought: {
    id: 'drought', name: 'Drought', category: 'weather', tag: 'drought',
    weight: 5, scope: 'all', severity: [0.35, 0.62],
    moistureDrain: 0.4,
    narrative: 'No rain worth the name from seeding to harvest. The ground cracked open wide enough to lose a boot in.',
  },
  severeDrought: {
    id: 'severeDrought', name: 'Severe drought', category: 'weather', tag: 'drought',
    weight: 1.4, scope: 'all', severity: [0.65, 0.9],
    moistureDrain: 0.7, soilDamage: 0.06,
    narrative: 'Nothing came up worth cutting. The topsoil moved with the wind and piled in the fence lines.',
  },

  // ---- FROST AND COLD ---------------------------------------------------
  earlyFrost: {
    id: 'earlyFrost', name: 'Early frost', category: 'weather', tag: 'frost',
    weight: 7, scope: 'most', severity: [0.13, 0.38],
    // A frost before the crop is ripe downgrades it rather than destroying it.
    gradeDowngrade: true,
    narrative: 'A hard frost in the third week of August, with the crop still in the milk. It graded tough and sold for feed.',
  },
  killingFrost: {
    id: 'killingFrost', name: 'Killing frost', category: 'weather', tag: 'frost',
    weight: 2.2, scope: 'all', severity: [0.5, 0.8],
    gradeDowngrade: true,
    narrative: 'Twenty-six degrees on the twelfth of August. The whole district was frozen green in a single night.',
  },
  hardWinter: {
    id: 'hardWinter', name: 'Hard winter', category: 'weather', tag: 'winter',
    weight: 7, scope: 'all', severity: [0.1, 0.35],
    livestockLoss: 0.07, feedDemandMult: 1.3, season: 'winter',
    narrative: 'Forty below for three weeks and the snow over the fence tops. The feed pile went down fast.',
  },

  // ---- WATER ------------------------------------------------------------
  wetSpring: {
    id: 'wetSpring', name: 'Wet spring', category: 'weather', tag: 'excessWet',
    weight: 8, scope: 'most', severity: [0.12, 0.38],
    // Wet ground you cannot get on is acres you never seeded at all.
    seedingDaysLost: 9,
    narrative: 'Too wet to get on the land until the last week of May. Some of it never did get seeded.',
  },
  wetHarvest: {
    id: 'wetHarvest', name: 'Wet harvest', category: 'weather', tag: 'excessWet',
    weight: 7, scope: 'all', severity: [0.15, 0.42],
    harvestDaysLost: 12, gradeDowngrade: true,
    narrative: 'It rained on the stooks for two weeks. What came off was tough and sprouted and worth half.',
  },
  flood: {
    id: 'flood', name: 'Flood', category: 'disaster', tag: 'flood',
    weight: 2.2, scope: 'some', severity: [0.5, 0.95],
    cashCost: 120, cashCostYear: 1900, livestockLoss: 0.05,
    narrative: 'The river came up over the banks and took the low fields, the fences and the crop with them.',
  },

  // ---- HAIL -------------------------------------------------------------
  hailstorm: {
    id: 'hailstorm', name: 'Hailstorm', category: 'weather', tag: 'hail',
    // Hail is the classic prairie hazard: catastrophic and narrow. It takes a
    // field and leaves the one across the road untouched.
    weight: 7, scope: 'some', severity: [0.4, 0.95],
    narrative: 'Ten minutes of hail out of a green sky. One quarter is stubble and the rest never felt a stone.',
  },
  widespreadHail: {
    id: 'widespreadHail', name: 'Widespread hail', category: 'weather', tag: 'hail',
    weight: 2, scope: 'most', severity: [0.55, 0.95],
    narrative: 'The storm ran the length of the municipality. There was nothing standing from the corner to the river.',
  },

  // ---- PESTS AND DISEASE ------------------------------------------------
  grasshoppers: {
    id: 'grasshoppers', name: 'Grasshoppers', category: 'pest', tag: 'grasshopper',
    weight: 6, scope: 'most', severity: [0.2, 0.7],
    narrative: 'They came in off the pasture in a sheet and went through the crop edge-first.',
  },
  locustPlague: {
    id: 'locustPlague', name: 'Locust plague', category: 'pest', tag: 'grasshopper',
    // The Rocky Mountain locust devastated Manitoba in 1874-76 and then went
    // extinct by 1902 — an event that can only happen at the very start.
    weight: 7, to: 1878, scope: 'all', severity: [0.7, 0.98],
    narrative: 'The sky went brown at noon. They took the crop, the garden, the fence posts bare, and then they lifted and went east.',
  },
  stemRust: {
    id: 'stemRust', name: 'Stem rust', category: 'disease', tag: 'rust',
    weight: 5, to: 1960, scope: 'most', severity: [0.25, 0.75],
    // Resistant varieties from 1935 onward are the counter; the engine reads
    // the variety's rustResist against this.
    counteredByVarietyResist: true,
    narrative: 'Red pustules up every stem. You could walk out of a field with your trousers the colour of brick.',
  },
  sawfly: {
    id: 'sawfly', name: 'Wheat stem sawfly', category: 'pest', tag: 'sawfly',
    weight: 3.5, from: 1900, to: 1975, scope: 'some', severity: [0.15, 0.4],
    narrative: 'The stems cut off clean at the ground and the heads lying flat where the wind laid them.',
  },
  wireworm: {
    id: 'wireworm', name: 'Wireworm', category: 'pest', tag: 'wireworm',
    weight: 3, scope: 'some', severity: [0.1, 0.28],
    narrative: 'Thin patches through the field where the seedlings were cut off underground.',
  },
  livestockDisease: {
    id: 'livestockDisease', name: 'Livestock disease', category: 'disease', tag: 'livestock',
    weight: 4, scope: 'all', severity: [0.15, 0.5],
    livestockLoss: 0.22, affectsCrops: false,
    narrative: 'It went through the barn in a week. The vet came out from town and there was not much to be done.',
  },
  horseDisease: {
    id: 'horseDisease', name: 'Sleeping sickness in the horses', category: 'disease', tag: 'horses',
    // Equine encephalomyelitis swept the prairies in 1937-38 and killed horses
    // by the thousand — one of the quieter reasons the tractor won.
    weight: 2.5, from: 1900, to: 1955, scope: 'all', severity: [0.3, 0.7],
    drafLoss: 0.3, affectsCrops: false,
    narrative: 'Three of the teams went down inside a month. A farm with no horses in June is a farm with no crop in August.',
  },

  // ---- DISASTER ---------------------------------------------------------
  prairieFire: {
    id: 'prairieFire', name: 'Prairie fire', category: 'disaster', tag: 'fire',
    weight: 4, to: 1920, scope: 'some', severity: [0.4, 0.9],
    buildingRisk: 0.12,
    narrative: 'A grass fire running ahead of a west wind faster than a horse. Everyone in the district turned out with wet sacks.',
  },
  barnFire: {
    id: 'barnFire', name: 'Barn fire', category: 'disaster', tag: 'fire',
    weight: 1.6, scope: 'one', severity: [0.8, 1.0],
    destroysBuilding: 'barn', livestockLoss: 0.4,
    narrative: 'Hay went up in the mow and the barn was gone in twenty minutes. You could see it from town.',
  },
  machineryBreakdown: {
    id: 'machineryBreakdown', name: 'Breakdown at the worst time', category: 'misfortune', tag: 'machinery',
    weight: 9, scope: 'all', severity: [0.05, 0.2],
    harvestDaysLost: 6, cashCost: 25, cashCostYear: 1900,
    narrative: 'It let go in the middle of harvest and the part had to come from Winnipeg.',
  },
  farmAccident: {
    id: 'farmAccident', name: 'Farm accident', category: 'misfortune', tag: 'accident',
    weight: 4, scope: 'all', severity: [0.2, 0.9],
    injuresOperator: true, workDaysLost: 40, cashCost: 40, cashCostYear: 1900,
    narrative: 'A moment of hurry around moving machinery, the way it always is.',
  },

  // ---- GOOD YEARS -------------------------------------------------------
  openSeason: {
    id: 'openSeason', name: 'An open season', category: 'fortune', tag: 'bonus',
    weight: 17, scope: 'all', severity: [0.04, 0.14], beneficial: true,
    narrative: 'An early spring, a long fall, and nothing much to complain of in between.',
  },
  goodYear: {
    id: 'goodYear', name: 'A good year', category: 'fortune', tag: 'bonus',
    weight: 21, scope: 'all', severity: [0.12, 0.30], beneficial: true,
    narrative: 'Rain when it was wanted and heat when it was wanted. Some years everything simply goes right.',
  },
  bumperCrop: {
    id: 'bumperCrop', name: 'Bumper crop', category: 'fortune', tag: 'bonus',
    weight: 7, scope: 'all', severity: [0.30, 0.55], beneficial: true,
    // A bumper crop you cannot get off in time is a lesson about capacity.
    strainsCapacity: true,
    narrative: 'The heaviest crop anyone could remember. The only question was whether you could get it all off.',
  },
  neighbourHelp: {
    id: 'neighbourHelp', name: 'The neighbours turn out', category: 'social', tag: 'community',
    weight: 4, scope: 'all', severity: [0.1, 0.3], beneficial: true,
    requiresHardship: true, harvestDaysGained: 7,
    narrative: 'Word got around and six outfits came down the road without being asked.',
  },
};

export const EVENT_LIST = Object.values(EVENTS);

/** Events that can fire in a given year. */
export function eventsFor(year) {
  return EVENT_LIST.filter((e) => (!e.from || year >= e.from) && (!e.to || year <= e.to));
}

export function event(id) {
  const e = EVENTS[id];
  if (!e) throw new Error(`Unknown event id: ${id}`);
  return e;
}
