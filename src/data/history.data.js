// The century's script: dated events that happen to every farm in Manitoba,
// whatever the player does. These are not hazards to be rolled for. They are
// the world changing on schedule.
//
// `effects` are applied by the engine for `durationYears` (default 1).
// An entry with `choice` stops and asks the player — these are the years that
// should cost real thought, and they are deliberately clustered at the moments
// when a farm's direction was actually decided.

export const HISTORY = [
  {
    year: 1876, id: 'firstWheatExport', title: 'The first wheat goes east',
    text: '857 bushels of Red Fife shipped out of Manitoba to Ontario — the first commercial wheat this province ever sold. Nobody here thinks it is the beginning of anything in particular.',
    effects: {},
  },
  {
    year: 1878, id: 'pembinaBranch', title: 'Rail reaches the border',
    text: 'The Pembina branch links St. Boniface to the American line. Grain can move on steel instead of in a wagon box, if you can get it to the siding.',
    effects: { haulMiles: -0.15 },
  },
  {
    year: 1881, id: 'cprWinnipeg', title: 'The CPR comes through',
    text: 'The Canadian Pacific main line is being pushed west out of Winnipeg. Survey stakes, section gangs, and land agents in every hotel in the province.',
    effects: { landMult: 1.4, haulMiles: -0.3 },
  },
  {
    year: 1882, id: 'landBoom', title: 'The Manitoba land boom',
    text: 'Winnipeg lots are changing hands three times a day at prices nobody can explain. Farmland has doubled. Men who have never seen a furrow are selling quarter sections by telegram.',
    effects: { landMult: 1.85, creditEase: 1.4 },
    choice: {
      prompt: 'Land you paid four dollars an acre for will fetch eleven. Every second man in the district is selling.',
      options: [
        { id: 'sellHigh', label: 'Sell a quarter into the boom', detail: 'Take the money. You can buy back in when it settles — everyone says so.', effects: { forceSellQuarter: true, cashBonusMult: 1.0 } },
        { id: 'buyMore', label: 'Buy another quarter on credit', detail: 'Land only goes up. Borrow against what you have and double the farm.', effects: { offerLandOnCredit: 1, creditEase: 1.6 } },
        { id: 'sitTight', label: 'Sit tight and keep farming', detail: 'You came here to grow wheat, not to trade paper.', effects: {} },
      ],
    },
  },
  {
    year: 1883, id: 'landBust', title: 'The bubble goes',
    text: 'The boom collapsed inside a season. Land is back where it started and then some. The men who bought at the top are walking away from their notes.',
    effects: { landMult: 0.55, creditEase: 0.6, neighbourDistress: 0.35 },
  },
  {
    year: 1885, id: 'northWestResistance', title: 'Trouble in the North-West',
    text: 'Fighting along the Saskatchewan. Militia units are going west on the new railway. The country feels less settled than it did a month ago.',
    effects: { labourShortage: 0.15 },
  },
  {
    year: 1886, id: 'cprComplete', title: 'The line is through to the coast',
    text: 'The Canadian Pacific is complete and running. Manitoba wheat can reach Liverpool, and it can reach it at a price.',
    effects: { haulMiles: -0.2 },
  },
  {
    year: 1890, id: 'elevatorRow', title: 'The elevator question',
    text: 'The line companies have the sidings and they set the grades. Farmers say the dockage is theft and the scales are crooked. They may be right.',
    effects: { gradingPenalty: 0.06 },
  },
  {
    year: 1897, id: 'crowRate', title: "The Crow's Nest Pass Agreement",
    text: 'The Dominion has struck a bargain with the CPR: a subsidy for the Crow’s Nest line, and in exchange, statutory freight rates on grain moving east. Fixed. In perpetuity, they say.',
    effects: { freightMult: 0.7, permanent: true },
  },
  {
    year: 1901, id: 'manitobaGrainAct', title: 'The Manitoba Grain Act',
    text: 'After years of agitation, farmers win the right to load their own cars from a platform instead of selling to the elevator at whatever it offers.',
    effects: { priceMult: 1.06, permanent: true },
  },
  {
    year: 1906, id: 'grainGrowers', title: 'The Grain Growers’ Grain Company',
    text: 'Farmers have put up their own company on the floor of the Winnipeg Grain Exchange. The Exchange tried to expel it and the province put it back.',
    effects: { priceMult: 1.03, permanent: true },
  },
  {
    year: 1909, id: 'marquisWheat', title: 'Marquis wheat is released',
    text: 'Charles Saunders at the Central Experimental Farm has a cross that ripens ten days ahead of Red Fife and mills better. Ten days, on this latitude, is the difference between a crop and a frozen field.',
    effects: { unlockVariety: 'marquis', permanent: true },
  },
  {
    year: 1912, id: 'tractorDemo', title: 'The tractor demonstrations',
    text: 'Winnipeg holds motor-plowing contests, and gas tractors pull against steam in front of crowds. Most of them break. Some of them do not.',
    effects: { unlockEquipmentInterest: 'gasTractor' },
  },
  {
    year: 1914, id: 'warBegins', title: 'War',
    text: 'Britain is at war and so, therefore, is Canada. Young men are going from every district. Wheat is suddenly a strategic commodity.',
    effects: { labourShortage: 0.25, warYears: true, durationYears: 5 },
  },
  {
    year: 1917, id: 'fixedPrice', title: 'The Board of Grain Supervisors',
    text: 'The open market in wheat is suspended. A fixed price of $2.21 for the crop, set in Ottawa. Nobody alive has seen wheat at that number.',
    effects: { priceFixed: true, labourShortage: 0.35 },
  },
  {
    year: 1918, id: 'spanishFlu', title: 'The influenza',
    text: 'It came home with the soldiers. Schools shut, churches shut, and it took the strong and young ahead of the old.',
    effects: { illnessRisk: 0.35, labourShortage: 0.3 },
  },
  {
    year: 1920, id: 'postwarCollapse', title: 'The bottom falls out',
    text: 'The wartime boards wind up, the European buyers have no money, and wheat falls from two dollars to one inside a year. Land bought at the peak is worth half the note against it.',
    // No priceMult: the wheat series already falls from $1.85 to $1.05 here.
    // Multiplying it again double-counts the collapse.
    effects: { landMult: 0.72, creditEase: 0.55, neighbourDistress: 0.3 },
  },
  {
    year: 1924, id: 'wheatPool', title: 'The Pool',
    text: 'Farmers are signing five-year contracts to deliver their wheat to a co-operative pool and take an average price for the crop year, not the price on the day they happen to haul.',
    effects: {},
    choice: {
      prompt: 'The Pool organiser has been to every farm in the municipality. Signing means your wheat goes to the Pool for five years, at the pooled average.',
      options: [
        { id: 'signPool', label: 'Sign the Pool contract', detail: 'An average price beats a gambler’s price, and it is farmers running it.', effects: { joinPool: true, priceVolatility: 0.6, priceMult: 1.04 } },
        { id: 'stayOpen', label: 'Stay on the open market', detail: 'You will take your own chances at the elevator, the way you always have.', effects: {} },
      ],
    },
  },
  {
    year: 1928, id: 'recordCrop', title: 'The record crop',
    text: 'The biggest wheat crop the prairies have ever grown. The elevators are plugged, the cars are short, and the price is sagging under the weight of it.',
    effects: { yieldMult: 1.3 },
  },
  {
    year: 1929, id: 'crash', title: 'The crash',
    text: 'New York has collapsed and the wheat market with it. The Pool has paid out an initial price higher than wheat is now worth and cannot cover the difference.',
    // The series carries the price collapse; this carries the credit freeze.
    effects: { creditEase: 0.4, landMult: 0.82 },
  },
  {
    year: 1931, id: 'poolCollapse', title: 'The Pools go under',
    text: 'The provincial governments have had to guarantee the Pools’ overdrafts. The central selling agency is finished. Farmers who signed in 1924 are learning what a pooled loss looks like.',
    effects: { poolLossIfMember: true },
  },
  {
    year: 1933, id: 'depthOfDepression', title: 'The bottom',
    text: 'Wheat at thirty-five cents. Municipalities cannot collect taxes and cannot pay relief. There are families in this district living on what the garden made.',
    // Wheat is already $0.35 in the series. What this adds is the collapse
    // in land values and the disappearance of credit.
    effects: { landMult: 0.5, creditEase: 0.25, neighbourDistress: 0.55, reliefAvailable: true },
  },
  {
    year: 1935, id: 'rustYear', title: 'The rust year',
    text: 'Stem rust went through the district and took what the drought had left. The same season, a resistant variety called Thatcher is released. A year too late for this crop.',
    effects: { forceEvent: 'stemRust', unlockVariety: 'thatcher' },
  },
  {
    year: 1935, id: 'pfraAndBoard', title: 'PFRA and the Wheat Board',
    text: 'Ottawa has set up the Prairie Farm Rehabilitation Administration to deal with the drifting soil, and a Canadian Wheat Board to put a floor under the price. Help, at last, and eight years late.',
    effects: { unlockTech: 'cropInsurance', priceFloor: true, permanent: true },
  },
  {
    year: 1937, id: 'worstYear', title: 'The worst of it',
    text: 'The driest year on record across the west. Russian thistle for feed, dust drifted against the fences deep enough to walk over, and the cattle sold because there is nothing to winter them on.',
    effects: { forceEvent: 'severeDrought', livestockForcedSale: 0.4 },
  },
  {
    year: 1939, id: 'warAgain', title: 'War again',
    text: 'Twenty-one years after the last one. The young men are going again, and again the price of wheat is about to become a matter of state.',
    effects: { labourShortage: 0.3, warYears: true, durationYears: 6 },
  },
  {
    year: 1941, id: 'spCombine', title: 'The self-propelled combine',
    text: 'Massey-Harris has built a combine that carries its own engine and drives itself. No tractor, no opening round cut by hand. With the men overseas, it is not a luxury.',
    effects: { unlockEquipment: 'selfPropelledCombine', permanent: true },
  },
  {
    year: 1943, id: 'boardCompulsory', title: 'The Board takes wheat',
    text: 'The Canadian Wheat Board is now the sole marketer of prairie wheat. An initial payment at delivery, and interim and final payments when the crop year closes.',
    effects: { compulsoryBoard: true, priceVolatility: 0.5, permanent: true },
  },
  {
    year: 1946, id: 'electrification', title: 'The power line comes',
    text: 'The Manitoba Power Commission is running rural lines. A yard light, a pump, a milking machine, and an end to filling lamps every evening.',
    effects: { unlockTech: 'ruralElectrification', permanent: true },
  },
  {
    year: 1947, id: 'herbicide', title: '2,4-D',
    text: 'A chemical that kills the mustard and the stinkweed and leaves the wheat standing. Fifty years of summerfallow logic goes out of date in one season.',
    effects: { unlockTech: 'herbicide24D', permanent: true },
  },
  {
    year: 1950, id: 'redRiverFlood', title: 'The Red River flood',
    text: 'The worst flood since 1861. A hundred thousand people out of their homes in the valley and the water standing on the fields into June.',
    effects: { forceEvent: 'flood', regionOnly: 'redRiver', floodSeverity: 0.9 },
  },
  {
    year: 1954, id: 'rust15B', title: 'Race 15B',
    text: 'A new race of stem rust that goes through Thatcher as if the resistance were not there. Selkirk holds against it. Whether you have Selkirk seed this spring is the whole question.',
    effects: { forceEvent: 'stemRust', unlockVariety: 'selkirk', bypassResist: 'thatcher' },
  },
  {
    year: 1959, id: 'farmCredit', title: 'The Farm Credit Corporation',
    text: 'A federal lender for farmers, with terms set for a farm’s cash flow rather than a bank’s quarter. Long money, at last, and for the right purpose.',
    effects: { creditEase: 1.35, unlockCreditSource: 'fcc', permanent: true },
  },
  {
    year: 1961, id: 'chinaWheat', title: 'The China wheat sale',
    text: 'Canada has sold China more wheat than anyone thought existed as a single order. The carryover that has been hanging over the price for a decade is simply gone.',
    effects: { durationYears: 3 },
  },
  {
    year: 1966, id: 'versatile', title: 'Versatile builds a four-wheel-drive',
    text: 'A Winnipeg shop is building articulated four-wheel-drive tractors for prairie acres. It will pull a cultivator wider than the road allowance.',
    effects: { unlockEquipment: 'fourWD', permanent: true },
  },
  {
    year: 1967, id: 'bankAct', title: 'The banks come to the farm',
    text: 'The revised Bank Act lets chartered banks lend on farm mortgages. There is more credit available than there has ever been, and it is being offered rather than rationed.',
    effects: { creditEase: 1.5, permanent: true },
  },
  {
    year: 1969, id: 'neepawa', title: 'Neepawa',
    text: 'A new red spring wheat named for the town, and it will be the standard the whole grade is judged against for twenty years.',
    effects: { unlockVariety: 'neepawa', permanent: true },
  },
  {
    year: 1970, id: 'lift', title: 'Lower Inventory For Tomorrow',
    text: 'The bins and the elevators are full of wheat nobody will buy. Ottawa is offering to pay farmers not to grow it — six dollars an acre to summerfallow, ten to put it down to grass.',
    effects: {},
    choice: {
      prompt: 'The LIFT payment is on offer. Take the cheque to grow nothing, or seed the crop and hope the market turns.',
      options: [
        { id: 'takeLift', label: 'Take the LIFT payment', detail: 'Guaranteed money for acres that would only have added to the glut.', effects: { liftPayment: true, forceFallowFraction: 0.45 } },
        { id: 'seedAnyway', label: 'Seed it anyway', detail: 'You did not break this land to be paid for leaving it idle.', effects: {} },
      ],
    },
  },
  {
    year: 1972, id: 'sovietSale', title: 'The Soviet grain deal',
    text: 'The Russians have bought the world’s surplus almost overnight. The carryover is gone and the price is doing something it has not done in fifty years.',
    effects: { durationYears: 3 },
  },
  {
    year: 1975, id: 'centennial', title: 'One hundred years',
    text: 'A century since the first furrow was turned on this quarter, by the same family, without a break. The province has a plaque and a certificate for farms that can prove it.',
    effects: { centennial: true },
    milestone: true,
  },
  {
    year: 1978, id: 'canola', title: 'Canola',
    text: 'The low-erucic, low-glucosinolate rapeseed varieties have a name of their own now, and a food market instead of an industrial one. It will be the crop that pays for the next twenty years.',
    effects: { unlockCrop: 'canola', permanent: true },
  },
  {
    year: 1979, id: 'landRunup', title: 'Land at four hundred dollars',
    text: 'Grain prices are high, inflation is higher, and every lender in the province is advising farmers to borrow and buy land because land always goes up.',
    effects: { landMult: 1.45, creditEase: 1.7 },
    choice: {
      prompt: 'The bank will lend you most of the price of the neighbouring section. Inflation is running at eleven per cent and the manager calls the debt "cheap money".',
      options: [
        { id: 'expandHard', label: 'Borrow and expand', detail: 'Buy the section. Inflation will pay the note down for you.', effects: { offerLandOnCredit: 2, creditEase: 1.8 } },
        { id: 'expandCareful', label: 'Buy one quarter, cash down', detail: 'Grow, but only as far as the chequebook reaches.', effects: { offerLandOnCredit: 1 } },
        { id: 'holdOff', label: 'Buy nothing at these prices', detail: 'You have seen 1882 and 1920 in the family record book.', effects: {} },
      ],
    },
  },
  {
    year: 1981, id: 'interestShock', title: 'Prime at twenty-two and three-quarters',
    text: 'The Bank of Canada has put the rate through the roof to break inflation, and it is breaking farms on the way. Operating loans that were manageable in June are ruinous by August.',
    effects: { interestMult: 2.2, landMult: 0.78, creditEase: 0.4, neighbourDistress: 0.5, durationYears: 4 },
  },
  {
    year: 1984, id: 'debtReview', title: 'The farm debt crisis',
    text: 'Foreclosure notices across the west. Auction sales every Saturday, and neighbours standing in the yard refusing to bid on a man’s machinery so he can buy it back for a dollar.',
    effects: { neighbourDistress: 0.6, landMult: 0.82, debtReviewAvailable: true },
  },
  {
    year: 1986, id: 'grainWar', title: 'The grain price war',
    text: 'Washington and Brussels are subsidising exports against each other and prairie wheat is caught in the middle. The price has collapsed for reasons that have nothing to do with the crop.',
    effects: { adHocPayment: true, durationYears: 2 },
  },
  {
    year: 1988, id: 'drought88', title: 'The 1988 drought',
    text: 'The driest year since the thirties. The one consolation is that everyone else is short too, and the price is the highest it has been in years.',
    effects: { forceEvent: 'drought' },
  },
  {
    year: 1991, id: 'gripNisa', title: 'GRIP and NISA',
    text: 'New safety-net programs: a revenue guarantee, and an account you pay into in good years and draw from in bad ones. The paperwork is considerable.',
    effects: { unlockSafetyNet: true, permanent: true },
  },
  {
    year: 1995, id: 'crowEnds', title: 'The Crow is gone',
    text: 'The Western Grain Transportation Act is repealed effective the first of August. The statutory rate that has governed prairie grain since 1897 is finished, and the freight lands on the farmer.',
    effects: { freightMult: 1.8, permanent: true, favourLivestock: true },
    choice: {
      prompt: 'Freight east has nearly doubled. It is now cheaper to feed grain to an animal here than to ship the grain out.',
      options: [
        { id: 'goHogs', label: 'Build a hog barn', detail: 'Feed the barley here and ship meat instead of grain. It is a large loan and a larger commitment.', effects: { offerHogBarn: true } },
        { id: 'goCanola', label: 'Shift acres to canola', detail: 'Higher value per bushel means freight matters less. Crush plants are being built in the province.', effects: { canolaBonus: 1.15 } },
        { id: 'stayCourse', label: 'Carry on with grain', detail: 'Absorb the freight and keep doing what this farm knows how to do.', effects: {} },
      ],
    },
  },
  {
    year: 1997, id: 'floodOfCentury', title: 'The flood of the century',
    text: 'The Red is wider than anyone has seen it. The Brunkild dike goes up in three days and the valley south of the city is an inland sea.',
    effects: { forceEvent: 'flood', regionOnly: 'redRiver', floodSeverity: 0.95 },
  },
  {
    year: 1997, id: 'sugarCloses', title: 'The sugar plant closes',
    text: 'The Fort Garry refinery is finished. Fifty-seven years of beet contracts in this province end with it, and the specialised machinery in the shed is worth scrap.',
    effects: { closeCrop: 'sugarbeet', permanent: true },
  },
  {
    year: 1999, id: 'hogExpansion', title: 'The hog barns go up',
    text: 'The killing plant at Brandon is running and the province is filling with confinement barns. The smell of it is a live issue at every council meeting in the south.',
    effects: { hogPriceMult: 1.2, hogExpansion: true },
  },
  {
    year: 2000, id: 'endOfCentury', title: 'The end of the century',
    text: 'A hundred and twenty-five years. Whatever is standing in this yard now is what four or five generations of decisions add up to.',
    effects: { gameEnd: true },
    milestone: true,
  },
];

/** All scripted history for a year (a year can carry more than one). */
export function historyFor(year) {
  return HISTORY.filter((h) => h.year === year);
}

/** Every year that stops and asks the player something. */
export function choiceYears() {
  return HISTORY.filter((h) => h.choice).map((h) => h.year);
}
