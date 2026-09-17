// Roads, and what they do to the working day.
//
// The Dominion Land Survey laid out road allowances on the grid — a mile apart
// north-south, two miles east-west — so travel between fields is along and then
// up, never diagonally. What changes across the century is not the geometry but
// the SURFACE, and what the surface is worth depends entirely on what you are
// driving over it.
//
// A trail in April behind a yoke of oxen is a different country from gravel in
// 1965 behind a diesel tractor. That difference is the whole reason a farm could
// sprawl across a township after the war and could not before it.

export const ROAD_CLASSES = [
  {
    id: 'trail', name: 'Trail', short: 'trail', level: 0,
    speedFactor: 0.5,
    // Days lost to spring breakup before the road will carry anything heavy.
    breakupDays: 6,
    note: 'Two ruts across the prairie. Bottomless in April and dust by July.',
  },
  {
    id: 'graded', name: 'Graded road', short: 'graded', level: 1,
    speedFactor: 0.8, breakupDays: 3,
    note: 'The municipality has put a grader over it and thrown up a crown. It sheds water, mostly.',
  },
  {
    id: 'gravel', name: 'Gravel road', short: 'gravel', level: 2,
    speedFactor: 1.0, breakupDays: 1,
    note: 'All-weather gravel. You can get a loaded truck out in April, which changes everything.',
  },
  {
    id: 'paved', name: 'Paved road', short: 'paved', level: 3,
    speedFactor: 1.15, breakupDays: 0,
    note: 'Pavement to the corner. Mostly it means the school bus comes.',
  },
];

export function roadClassByLevel(level) {
  const i = Math.max(0, Math.min(ROAD_CLASSES.length - 1, Math.round(level)));
  return ROAD_CLASSES[i];
}

/**
 * The road class the MUNICIPALITY has generally reached by a given year.
 *
 * Manitoba's Rural Municipality system dates from 1883, and for decades after
 * that road work was done by statute labour — every man owed the municipality
 * so many days on the roads each year, or a cash commutation in lieu. Grading
 * came slowly. Depression relief work put a great many men on road gangs in the
 * thirties. Gravel reached most grid roads through the fifties, and pavement
 * after that went to the provincial routes and very little else.
 */
const MUNICIPAL_TIMELINE = [
  [1875, 0.0], // no municipalities yet, only trails
  [1883, 0.15], // the RM system arrives
  [1900, 0.5],
  [1920, 1.0], // most main roads graded
  [1935, 1.4], // relief road work
  [1950, 1.8],
  [1960, 2.1], // gravel on the grid
  [1975, 2.2],
  // Stops just short of paved on purpose: the grid roads a Manitoba farm
  // actually drives are gravel to this day. Pavement is for the provincial
  // routes, and a quarter that happens to sit on one is the exception.
  [2000, 2.3],
];

export function municipalRoadLevel(year) {
  const a = MUNICIPAL_TIMELINE;
  if (year <= a[0][0]) return a[0][1];
  const last = a[a.length - 1];
  if (year >= last[0]) return last[1];
  for (let i = 0; i < a.length - 1; i++) {
    const [y0, v0] = a[i];
    const [y1, v1] = a[i + 1];
    if (year >= y0 && year <= y1) return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0);
  }
  return last[1];
}

// What the player can do about their own access, in 1875 dollars (the engine
// inflates from there). These are deliberately cheap: an approach is a culvert
// and a day with a scraper, not a capital project, and the point of them is
// that they change which quarters are worth owning.
export const ROAD_WORKS = {
  approach: {
    id: 'approach', name: 'Build an approach',
    cost: 18, levels: 1,
    note: 'A culvert and a ramp off the road allowance, so you can actually get a machine into the field.',
  },
  gravelPetition: {
    id: 'gravelPetition', name: 'Petition the council for gravel',
    cost: 70, levels: 1, from: 1920,
    note: 'The municipality will haul gravel if you pay a share and the councillor likes you.',
  },
};

// Statute labour: the days every ratepayer owed on the roads, or the cash you
// paid instead. A real and much-resented institution, and a genuine early
// choice between time and money when you have very little of either.
export const STATUTE_LABOUR = {
  from: 1883,
  to: 1940,
  daysOwedPerQuarter: 2,
  commutationPerDay: 1.25, // dollars, 1875 terms
  note: 'Two days a year on the roads for every quarter you hold, or the cash in lieu.',
};

/**
 * How fast a farm can move itself down a road, in miles per hour.
 * Keyed by the power unit; the farm travels at the pace of its best one.
 * These are travel speeds on a road, not working speeds in a field.
 */
export const ROAD_SPEED = {
  oxen: 2,
  horses: 3.5,
  steamTraction: 3, // enormous, and it has to stop for water
  gasTractor: 4, // steel lugs chew the road and the road chews back
  rowCropTractor: 6,
  rubberTractor: 12, // rubber over steel: it will drive to town on its own tires
  dieselTractor: 15,
  fourWD: 18,
  bigFourWD: 20,
  grainTruck: 30,
};

// Walking pace, for a farm with no power at all.
export const ON_FOOT_MPH = 2.5;

// A working day on the road, in hours.
export const TRAVEL_HOURS_PER_DAY = 10;

// Trips to a field in a season. Spring is tillage and seeding; harvest is
// cutting and then hauling it home, repeatedly, which is why it is the larger
// number.
export const TRIPS_SPRING = 3;
export const TRIPS_HARVEST = 4;

/**
 * The share of grain hauling that competes with the harvest window.
 *
 * A lot of grain moved in winter, on sleighs, over snow, when the going was
 * good and there was nothing else to do — so only part of the hauling actually
 * costs you harvest days. The rest is absorbed by a season with time in it.
 */
export const HAUL_SHARE_IN_HARVEST = 0.12;

/**
 * Modern machinery is wide. A forty-foot air drill or a thirty-foot header has
 * to be folded, or pulled sideways, or moved on a trailer with somebody ahead
 * of it in a truck. This keeps distance a live consideration in an era where
 * raw speed would otherwise erase it.
 */
export const TRANSPORT_PENALTY = {
  // Implement id -> extra hours per trip to fold, move and set up again.
  airSeeder: 0.6,
  airDrill: 1.0,
  heavyCultivator: 0.8,
  modernCombine: 0.5,
  rotaryCombine: 0.8,
  swather: 0.4,
};
