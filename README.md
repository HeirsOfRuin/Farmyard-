# Centennial Farm

A Manitoba farm, 1875 to 2000.

You file on a quarter section of unbroken prairie in 1875 — ten dollars, three
years' residence, thirty acres broken — and run the place for a hundred and
twenty-five years through four or five generations. Holding the same land in
the same family to 1975 earns the province's Century Farm plaque. That is the
achievement; the game keeps going to 2000 regardless of whether you get it.

Nobody lives a century, so the real subject is the family line: who is born,
who stays, who marries in, and what happens to the farm when an estate divides
among heirs who want their share in cash.

## Playing it

```
node tools/bundle.js          # build dist/centennial-farm.html
```

Open `dist/centennial-farm.html` in a browser. No server, no install, no
dependencies. It saves itself to that browser after every year.

For development, serve the directory and open `index.html`:

```
python3 -m http.server 8000
```

A full playthrough is 125 year-turns. Quiet years are one click — the crop plan
carries forward and the season's breaking is filled in already — and the years
that matter stop and ask.

## What it is trying to be

Historically grounded rather than historically flavoured. The dates, prices and
machinery are real, and the things that decided prairie farms decide this one:

- **The survey.** Even-numbered sections were open to homestead; odd ones were
  CPR land grant and had to be bought. That checkerboard is why prairie farms
  grew the way they did, and it is on the map.
- **Capacity, not yield.** A cradle scythe cuts an acre and a half a day. A
  1980 rotary combine does 118. What you harvest is what you could get to
  before the snow, which is the whole argument for machinery.
- **Wheat prices, year by year.** The fixed $2.21 of 1917, thirty-five cents in
  1932, the 1973 Soviet-sale spike. One explicit 126-year series.
- **Varieties.** Red Fife, then Marquis in 1909 — ten days earlier, which on
  this latitude is the difference between a crop and a frozen field — then
  Thatcher against stem rust, Selkirk against race 15B, then Neepawa.
- **Weeds.** Before herbicide the only control was summerfallow, which costs a
  third of your acres. 2,4-D in 1947 is what made that optional.
- **The Crow rate**, fixed in 1897 and gone in 1995, when freight roughly
  doubles overnight and it becomes cheaper to feed grain to an animal here than
  to ship it out.
- **Credit that matches the period**: implement-dealer notes and store accounts,
  then the Manitoba Farm Loans Association (1917), the Canadian Farm Loan Board
  (1929), the Farm Credit Corporation (1959), and the banks after the 1967 Bank
  Act. Prime hits 22.75% in 1981 and takes farms with it.
- **Succession.** Write a will or don't. Without one an estate divides among
  all the children, and the ones who left for the city are entitled to their
  share in cash. Raising it usually means mortgaging the home quarter, and
  sometimes it means selling land the family broke.

Three settler backgrounds with real differences: an Ontario homesteader with the
best access to credit and the least community behind them; the Mennonite West
Reserve with the Waisenamt lending within the community; and New Iceland in the
Interlake, with the worst land, no money, and winter fishing on the lake to
carry it.

## The instruments

Two separate things, built for two different questions.

**Is it true?** `node --test "test/*.test.js"` — assertions about what cannot be
true of a farm: land does not un-break itself, a quarter is 160 acres, no number
becomes NaN, the operator is alive, a harvest never exceeds what was standing,
and the acres the planning screen promises are the acres the engine seeds.
Impossibility assertions rather than magnitude ones, because magnitude
assertions get deleted on the first rebalance.

**Is it balanced?** These are separate programs, and deliberately so:

```
node sim/run.js --runs=300 --tier=settler    # batch outcomes
node sim/run.js --trace=2 --seed=3           # one run, year by year
node sim/verify-tiers.js --runs=300          # every claimed tier difference, measured
node sim/verify-tiers.js --ablate            # turn one subsystem off, diff the rest
node sim/composition.js                      # income and expenses as shares of gross
node sim/valuation.js --runs=250             # what a surviving farm is actually worth
node tools/smoke.mjs                         # drive the real page in a browser
node tools/check-bundle.mjs                  # does the single file work from disk
```

`sim/run.js` refuses to report on a run that did not advance, break ground or
take a harvest. Its first ever run played eleven years, broke 160 acres and
took zero harvests, and without that check the batch would have cheerfully
reported statistics on a hundred games in which nothing was ever grown.

`sim/verify-tiers.js` measures every difference `difficulty.data.js` claims and
prints a noise floor beside it, because with 300 runs a single run is worth 0.33
points and a gap smaller than three runs' worth is not a result. Two claims were
withdrawn rather than tuned, for reasons written down in that file: the
foreclosure rate is confounded by heir availability, and median acreage in 2000
can only be measured on farms that survived.

`sim/composition.js` reports shares of gross rather than dollars. It is the
instrument that found seed costing more than the grain was worth.

`sim/valuation.js` reports the balance sheet of the farms that are STILL
FARMING, split into land, machinery, stock, grain and debt, because the batch
runner's mean net worth averages a farm that reached 2000 with three thousand
acres against one foreclosed in 1931 and describes neither. A surviving Settler
farm in 2000 holds around 2,900 acres and is worth a little under two million
dollars, most of it land at $563 an acre; the strongest quarter of them run to
3,700 acres and two and a half million. Those are the numbers to argue with if
the farm does not feel like a real one.

## What the tiers actually do

Measured over 300 seeded runs each, and the blurbs in `difficulty.data.js` say
the same thing the instrument does:

| | Homesteader | Settler | Sodbuster |
|---|---|---|---|
| reached 1975 with the plaque | 53% | 26% | 10% |
| median years the line lasted | 101 | 57 | 22 |
| still farming in 2000 | 19% | 14% | 3% |

## Playing it on a phone

`node tools/bundle.js` writes two files:

- `dist/centennial-farm.html` — the whole game in one file. Open it from
  anywhere, including a phone's downloads folder. It carries the home-screen
  icon and the standalone-app tags inline, so Add to Home Screen gives a real
  launcher rather than a bookmark.
- `dist/centennial-farm.embed.html` — the same game as page CONTENT, with no
  document of its own, for a host that supplies the skeleton. It zeroes the
  safe-area tokens because such a host has already paid for the notch.

At 1000px and under the map stops being a column and becomes a tab, the tab
strip and the "work the year" button both stick to the edges of the screen, and
every control grows to a 44px target. The desktop layout is untouched — the two
builds are pixel-identical there. `node tools/make-icon.mjs` redraws the icon.

A hundred and twenty-five turns is several sittings, so the game writes itself
to `localStorage` after every year and the setup screen offers to resume. That
storage is per-browser and per-device and routine things clear it, which is what
"save to file" is for; where the host will not let an embedded page start a
download, the save is handed to the host instead.

## Layout

```
src/engine/   pure, deterministic, no DOM
  turn.js       the year: five ordered phases, one record out
  derive.js     THE single source for every derived number
  ...           land, family, succession, finance, market, events, rng, state
src/data/      logic-free tables, all nominal dollars of the year
src/ui/        map, panels, app — reads the engine, computes nothing
sim/           the reference player and the balance instruments
test/          invariants and crisis tests
tools/         bundler, browser smoke test
```

Two rules the codebase is organised around:

1. **One derivation, not two.** The number shown to the player and the number
   used to resolve the outcome come from the same function. `croppableAcres()`
   is asked by the spring phase, the planning panel and the bot alike. When
   that arithmetic existed in two places the copies disagreed by seven per cent,
   which is a farm the player is shown and does not have.
2. **Nothing renders silently empty.** A panel with nothing in it says why it is
   empty and what would fill it. An absent thing and a broken thing look
   identical otherwise.

## Sources

Prices, dates and machinery come from the standard accounts of prairie
agriculture: the Dominion Lands Act and the survey system; Manitoba wheat price
and yield series; the Crow's Nest Pass Agreement and the Western Grain
Transportation Act repeal of 1995; Canadian Wheat Board history (voluntary 1935,
compulsory for wheat 1943); public variety-release records for Red Fife through
Neepawa; and the Manitoba Sugar Company's Fort Garry refinery, open 1940 and
closed 1997, which is why sugar beets appear and disappear on exactly those
dates. Figures are rounded to what a game needs and should not be cited.
