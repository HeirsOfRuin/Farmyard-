// Name pools by settler origin and era.
//
// Given names are era-banded because naming fashion moved a great deal between
// 1875 and 2000, and a farm whose 1985-born heir is called Hezekiah reads as
// costume rather than history.

export const SURNAMES = {
  ontario: ['Bell', 'Carruthers', 'Dunlop', 'Ferguson', 'Gillespie', 'Hargrave', 'Innes', 'Kerr',
    'Lawson', 'McArthur', 'McKenzie', 'Muirhead', 'Paterson', 'Rutherford', 'Sinclair',
    'Tolmie', 'Vance', 'Whitelaw', 'Armstrong', 'Craik'],
  mennonite: ['Bergen', 'Dyck', 'Enns', 'Friesen', 'Giesbrecht', 'Hiebert', 'Janzen', 'Klassen',
    'Loewen', 'Neufeld', 'Penner', 'Rempel', 'Sawatzky', 'Thiessen', 'Unger',
    'Wiebe', 'Zacharias', 'Braun', 'Froese', 'Peters'],
  icelandic: ['Arnason', 'Bjarnason', 'Eyjolfsson', 'Gislason', 'Hallgrimsson', 'Johannsson',
    'Kristjansson', 'Magnusson', 'Olafsson', 'Petursson', 'Sigurdsson', 'Stefansson',
    'Thorlaksson', 'Valdimarsson', 'Einarsson', 'Gudmundsson'],
};

// [fromYear, toYear, names]
export const GIVEN_NAMES = {
  ontario: {
    male: [
      [1840, 1900, ['James', 'John', 'William', 'Robert', 'Andrew', 'Thomas', 'Alexander', 'Hugh', 'Duncan', 'Archibald', 'Samuel', 'Walter']],
      [1900, 1940, ['Harold', 'Gordon', 'Kenneth', 'Stanley', 'Clifford', 'Norman', 'Douglas', 'Raymond', 'Lorne', 'Elmer', 'Russell', 'Clarence']],
      [1940, 1975, ['Brian', 'Wayne', 'Dennis', 'Larry', 'Garry', 'Murray', 'Keith', 'Barry', 'Glen', 'Dale', 'Bruce', 'Ross']],
      [1975, 2010, ['Jason', 'Ryan', 'Kyle', 'Travis', 'Curtis', 'Derek', 'Trevor', 'Shane', 'Cody', 'Tyler', 'Jordan', 'Chad']],
    ],
    female: [
      [1840, 1900, ['Margaret', 'Elizabeth', 'Jane', 'Mary', 'Catherine', 'Agnes', 'Isabella', 'Sarah', 'Annie', 'Christina', 'Jessie', 'Flora']],
      [1900, 1940, ['Dorothy', 'Marjorie', 'Evelyn', 'Gladys', 'Vera', 'Hazel', 'Irene', 'Muriel', 'Edna', 'Beatrice', 'Lillian', 'Doris']],
      [1940, 1975, ['Sharon', 'Linda', 'Brenda', 'Carol', 'Judy', 'Marlene', 'Diane', 'Gail', 'Sandra', 'Bonnie', 'Cheryl', 'Wendy']],
      [1975, 2010, ['Jennifer', 'Melissa', 'Kelly', 'Tanya', 'Crystal', 'Amanda', 'Shannon', 'Nicole', 'Candace', 'Erin', 'Lindsay', 'Jaclyn']],
    ],
  },
  mennonite: {
    male: [
      [1840, 1910, ['Johann', 'Abram', 'Cornelius', 'Peter', 'Jacob', 'Heinrich', 'Isaak', 'Gerhard', 'David', 'Franz', 'Klaas', 'Bernhard']],
      [1910, 1950, ['John', 'Abe', 'Henry', 'Peter', 'Jake', 'Corny', 'Ben', 'Dave', 'Frank', 'Herman', 'Willy', 'Ed']],
      [1950, 1980, ['Ken', 'Vern', 'Dale', 'Ron', 'Wes', 'Art', 'Len', 'Lyle', 'Merv', 'Arnie', 'Dwight', 'Rudy']],
      [1980, 2010, ['Brett', 'Darryl', 'Kevin', 'Jeff', 'Chris', 'Aaron', 'Mark', 'Scott', 'Tim', 'Nathan', 'Justin', 'Brad']],
    ],
    female: [
      [1840, 1910, ['Maria', 'Anna', 'Katharina', 'Helena', 'Aganetha', 'Susanna', 'Justina', 'Elisabeth', 'Sara', 'Margaretha', 'Tina', 'Gertruda']],
      [1910, 1950, ['Mary', 'Anna', 'Katie', 'Helen', 'Nettie', 'Susie', 'Tina', 'Betty', 'Sara', 'Margaret', 'Agnes', 'Lena']],
      [1950, 1980, ['Elaine', 'Marlene', 'Ruth', 'Lois', 'Karen', 'Donna', 'Betty', 'Grace', 'Irene', 'Eleanor', 'Rosella', 'Vi']],
      [1980, 2010, ['Tara', 'Angela', 'Charlene', 'Michelle', 'Corinne', 'Danielle', 'Heather', 'Natasha', 'Kendra', 'Alysha', 'Renee', 'Brooke']],
    ],
  },
  icelandic: {
    male: [
      [1840, 1910, ['Sigurdur', 'Jon', 'Gudmundur', 'Olafur', 'Bjarni', 'Einar', 'Magnus', 'Thorsteinn', 'Kristjan', 'Halldor', 'Stefan', 'Arni']],
      [1910, 1950, ['Gunnar', 'Valdimar', 'Baldur', 'Thorvaldur', 'Sveinn', 'Helgi', 'Ingi', 'Skuli', 'Hjalmar', 'Ragnar', 'Fridrik', 'Oddur']],
      [1950, 1980, ['Barney', 'Stan', 'Ted', 'Gus', 'Walter', 'Leonard', 'Harvey', 'Sigurd', 'Eric', 'Alvin', 'Norman', 'Neil']],
      [1980, 2010, ['Kris', 'Erik', 'Brandon', 'Devon', 'Colin', 'Kurt', 'Grant', 'Jay', 'Mitch', 'Tyson', 'Braden', 'Riley']],
    ],
    female: [
      [1840, 1910, ['Gudrun', 'Sigridur', 'Kristin', 'Helga', 'Ingibjorg', 'Solveig', 'Halldora', 'Thorbjorg', 'Anna', 'Margret', 'Rannveig', 'Jonina']],
      [1910, 1950, ['Bergthora', 'Svava', 'Lilja', 'Asta', 'Hrefna', 'Sigrun', 'Gudny', 'Steinunn', 'Salome', 'Thora', 'Vilborg', 'Runa']],
      [1950, 1980, ['Lorna', 'Joyce', 'Shirley', 'Adeline', 'Beverly', 'Sylvia', 'Norma', 'Dianne', 'Connie', 'Valerie', 'Rosalind', 'Iris']],
      [1980, 2010, ['Kara', 'Signy', 'Britt', 'Alexa', 'Kirsten', 'Tessa', 'Megan', 'Leah', 'Paige', 'Sonja', 'Marissa', 'Chelsea']],
    ],
  },
};

/** Given names in fashion for someone born in `birthYear`. */
export function namePool(origin, sex, birthYear) {
  const byOrigin = GIVEN_NAMES[origin] || GIVEN_NAMES.ontario;
  const bands = byOrigin[sex] || byOrigin.male;
  for (const [from, to, names] of bands) {
    if (birthYear >= from && birthYear < to) return names;
  }
  // Born outside every band: use the nearest one rather than returning nothing.
  return birthYear < bands[0][0] ? bands[0][2] : bands[bands.length - 1][2];
}

export function surnamePool(origin) {
  return SURNAMES[origin] || SURNAMES.ontario;
}

// Settler backgrounds. Each is a real Manitoba settlement story with real
// mechanical consequences, not a cosmetic label.
export const BACKGROUNDS = {
  ontario: {
    id: 'ontario',
    name: 'Ontario settler',
    origin: 'ontario',
    region: 'westman',
    blurb: 'Come west from Grey County on the strength of a pamphlet and a quarter section for a ten dollar filing fee.',
    startingCapital: 420,
    startingEquipment: ['walkingPlow', 'cradleScythe', 'wagon'],
    startingLivestock: { oxen: 1, chickens: 8 },
    traits: ['literate'],
    // Anglo settlers had the easiest access to formal credit and English-speaking
    // institutions, and the least community backstop when things went wrong.
    creditAccess: 1.15,
    communitySupport: 0.5,
    note: 'Best access to banks, land agents and the law. Least likely to have anyone turn out for you.',
  },
  mennonite: {
    id: 'mennonite',
    name: 'Mennonite, West Reserve',
    origin: 'mennonite',
    region: 'redRiver',
    blurb: 'Arrived with the 1870s migration onto reserved township land, farming out of a village with the whole community’s assets pooled behind you.',
    startingCapital: 260,
    startingEquipment: ['walkingPlow', 'cradleScythe'],
    startingLivestock: { oxen: 1, dairyCow: 1, chickens: 12 },
    traits: ['thrifty', 'communal'],
    // The Waisenamt was a genuine mutual-aid and credit institution — orphans'
    // funds lent within the community, and a real backstop in a bad year.
    creditAccess: 0.8,
    communitySupport: 1.8,
    mutualAid: true,
    note: 'The Waisenamt lends within the community and the village turns out for its own. Outside credit is harder to come by.',
  },
  icelandic: {
    id: 'icelandic',
    name: 'Icelandic, New Iceland',
    origin: 'icelandic',
    region: 'interlake',
    blurb: 'Landed at Willow Point in 1875 into stone, bush and marsh, with a colony charter and no money at all.',
    startingCapital: 120,
    startingEquipment: ['walkingPlow'],
    startingLivestock: { dairyCow: 1, sheep: 4, chickens: 6 },
    traits: ['hardy', 'literate', 'communal'],
    creditAccess: 0.6,
    communitySupport: 1.5,
    // Winter fishing on Lake Winnipeg is not a flag on this background — it is
    // the interlake REGION's own offFarmIncome (regions.data.js), open to
    // whoever settles there. Declaring it again here as `winterFishing: true`
    // read by nothing was exactly the class of promise this game keeps
    // finding and breaking: the region assignment above is what actually
    // gives every Icelandic settler access to it.
    note: 'The worst land and the least money. Winter fishing on the lake is what carries you until the farm can.',
  },
};

export const BACKGROUND_LIST = Object.values(BACKGROUNDS);

export function background(id) {
  const b = BACKGROUNDS[id];
  if (!b) throw new Error(`Unknown background id: ${id}`);
  return b;
}
