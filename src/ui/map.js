// The township, drawn.
//
// Eight quarters across, four down: four sections wide by two deep, north at
// the top, with the section boundaries drawn heavier than the quarter lines
// because that is how the survey reads on the ground and on every plat map
// anyone here ever looked at.
//
// This module renders. It does not compute anything about the farm — every
// number it shows comes from the engine.

import {
  MAP_SECTIONS, QUARTER_CODES, legalDescription, TENURE_LABEL,
  distanceFromYard, roadFor, roadLevelFor,
} from '../engine/land.js';
import { timelinessFactor, haulMiles as haulMilesFor } from '../engine/derive.js';
import { ROAD_CLASSES } from '../data/roads.data.js';
import { CROPS } from '../data/crops.data.js';
import { SOILS } from '../data/regions.data.js';

const CELL = 100;
const PAD = 22;
const COLS = MAP_SECTIONS[0].length * 2;
const ROWS = MAP_SECTIONS.length * 2;

/**
 * What each land use looks like.
 *
 * Spread across real HUES, not just shades of the same brown. The first
 * version put wheat, oats, barley and rye within about fifteen degrees of
 * each other on the colour wheel — four crops that occupy most of every
 * township, rendered in what was effectively one colour with noise on it.
 * This spreads the grains from gold through rust to olive, gives the
 * oilseeds their own real colours (flax fields genuinely read as blue from a
 * section road), and moves the root crops toward wine and plum so nothing
 * here is "another brown."
 */
export const USE_COLOURS = {
  wheat:     '#c8912f', // gold — the crop most of the map is
  oats:      '#a9a24f', // olive-gold, greener than wheat
  barley:    '#a3652f', // rust
  rye:       '#7d7550', // dull olive
  flax:      '#3f6f95', // blue — this is not a rounding error, flax fields were blue
  rapeseed:  '#d6b52a', // clear yellow
  canola:    '#b8cc3c', // yellow-green, bred off rapeseed and reads as its own thing
  sunflower: '#d9781f', // saturated orange
  sugarbeet: '#7a3450', // wine
  potato:    '#6d4d63', // plum-brown
  hay:       '#82914b', // mown gold-green
  pasture:   '#4c6b38', // standing grass, darker and cooler than hay
  fallow:    '#9c8862', // worked bare ground, warm grey-tan
  idle:      '#736c5e', // gone to weeds, cool grey-tan
  bush:      '#2e4327', // dark forest green
};

/**
 * Who else is on the map. This was the worse of the two palettes — five
 * low-saturation greyish-tans that a fresh township is mostly made of, since
 * most of it starts as company land or a neighbour's place. Real hues here:
 * a warm sienna for a neighbour's own land, cool slate for the railway
 * company, a deep plum for the Hudson's Bay Company sections, sage for the
 * school lands, and the palest thing on the map for ground nobody has
 * touched yet.
 */
const OWNER_COLOURS = {
  neighbour: '#a97449',
  railway:   '#7688a0',
  hbc:       '#5f4f74',
  school:    '#8b9a72',
  vacant:    '#e7dcc0',
};

/**
 * Small pixel-art glyphs — terrain, a farmstead, the yard. Each icon is a
 * grid of 0/1/2s; 0 is transparent, 1 and 2 are the two colours passed in.
 * Drawn as plain <rect> squares rather than path data, on purpose: this is a
 * game about a plat map, not an illustration, and a handful of hard-edged
 * squares reads as a mark ON the map instead of a picture dropped onto it.
 */
function pixelIcon(grid, x, y, px, colours) {
  const out = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const v = grid[r][c];
      if (!v) continue;
      out.push(`<rect x="${x + c * px}" y="${y + r * px}" width="${px}" height="${px}" fill="${colours[v - 1]}" />`);
    }
  }
  return `<g pointer-events="none">${out.join('')}</g>`;
}

// One small glyph per soil, shown in the corner of every quarter regardless
// of which colour mode is showing — soil is a fixed property of the ground,
// not something that changes with the view. Abstract on purpose: at three
// pixels a side there is no room for anything representational, so these are
// texture, not pictures — furrows, grain, dune ripple, a scatter of stone,
// open water.
const TERRAIN_ICONS = {
  clay:   [[0,0,0,0,0],[1,1,1,1,1],[0,0,0,0,0],[1,1,1,1,1],[0,0,0,0,0]],
  loam:   [[0,1,0,1,0],[0,0,0,0,0],[1,0,1,0,1],[0,0,0,0,0],[0,1,0,1,0]],
  sandy:  [[1,0,0,0,0],[0,1,0,0,0],[0,0,1,0,0],[0,0,0,1,0],[0,0,0,0,1]],
  stony:  [[0,0,0,0,0],[0,1,1,0,0],[0,1,1,1,0],[0,0,1,1,0],[0,0,0,0,0]],
  slough: [[0,0,0,0,0],[0,1,0,1,0],[1,0,1,0,1],[0,1,0,1,0],[0,0,0,0,0]],
};
const TERRAIN_ICON_COLOUR = {
  clay: '#3f2f22', loam: '#6b4f30', sandy: '#9c803f', stony: '#5f5a4e', slough: '#2f4a40',
};

/** A small house-and-barn glyph: the working farmstead, yours or a neighbour's. */
const FARMSTEAD_ICON = [
  [0,0,0,1,0,0,0],
  [0,0,1,1,1,0,0],
  [0,1,1,1,1,1,0],
  [0,2,2,2,2,2,0],
  [0,2,0,0,0,2,0],
  [0,2,2,2,2,2,0],
];

export function useColour(q) {
  if (q.owner === 'player') return USE_COLOURS[q.use] || USE_COLOURS.idle;
  if (!q.owner) return OWNER_COLOURS.vacant;
  return OWNER_COLOURS[q.owner] || OWNER_COLOURS.neighbour;
}

/**
 * Render the township.
 * `mode` picks what the colours mean: 'use' (what is growing) or 'soil'.
 */
// Roads have to read AGAINST the field colours, not blend into them. The first
// version used browns a shade apart from the fills and the whole road network
// disappeared into the map — present, and completely illegible.
const ROAD_STROKE = {
  0: { colour: '#b8452e', width: 1.5, dash: '4 5', opacity: 0.75 }, // trail: broken line
  1: { colour: '#b8452e', width: 2.8, dash: '10 3', opacity: 0.9 }, // graded
  2: { colour: '#7d2f1f', width: 4.2, dash: null, opacity: 1 },     // gravel: solid
  3: { colour: '#241d16', width: 5.0, dash: null, opacity: 1 },     // paved
};

/**
 * The road allowances, drawn on the grid the survey put them on.
 *
 * Each quarter's access is shown as the road along its southern edge, weighted
 * by what the surface actually is — a dashed hairline for a trail, a solid band
 * for gravel. It is the quickest way to see why the far corner of the farm
 * costs what it costs.
 */
function renderRoads(state) {
  const parts = [];
  for (const q of state.quarters) {
    const lvl = Math.round(roadLevelFor(state, q));
    const st = ROAD_STROKE[Math.max(0, Math.min(3, lvl))];
    const x = PAD + q.col * CELL;
    const y = PAD + (q.row + 1) * CELL;
    // A pale casing under the road so it reads over any field colour.
    parts.push(
      `<line x1="${x}" y1="${y}" x2="${x + CELL}" y2="${y}" ` +
        `stroke="#f2ece0" stroke-width="${st.width + 2.4}" opacity="0.55" stroke-linecap="round" />` +
      `<line x1="${x}" y1="${y}" x2="${x + CELL}" y2="${y}" ` +
        `stroke="${st.colour}" stroke-width="${st.width}" opacity="${st.opacity}" ` +
        `${st.dash ? `stroke-dasharray="${st.dash}"` : ''} stroke-linecap="round" />`
    );
  }
  return parts.join('');
}

export function renderMap(state, { selectedId = null, mode = 'use' } = {}) {
  const w = COLS * CELL + PAD * 2;
  const h = ROWS * CELL + PAD * 2;
  const parts = [];

  parts.push(
    `<svg class="township" viewBox="0 0 ${w} ${h}" role="img" ` +
      `aria-label="Township map of the farm and the district around it">`
  );

  // Compass and township label.
  parts.push(
    `<text x="${PAD}" y="${PAD - 7}" class="seclabel">N &#8593;&nbsp; ${esc(state.townshipLabel)}</text>`
  );

  for (const q of state.quarters) {
    const x = PAD + q.col * CELL;
    const y = PAD + q.row * CELL;
    const mine = q.owner === 'player';
    const fill = mode === 'soil' ? soilColour(q)
      : mode === 'roads' ? distanceColour(state, q)
      : useColour(q);
    const cls = ['qtr', mine ? 'mine' : '', q.id === selectedId ? 'sel' : ''].filter(Boolean).join(' ');

    parts.push(`<g class="${cls}" data-quarter="${q.id}" tabindex="0" role="button" aria-label="${esc(quarterAria(state, q))}">`);
    parts.push(`<title>${esc(quarterTitle(state, q))}</title>`);
    parts.push(`<rect class="plot" x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${fill}" />`);

    // Unbroken ground on land you own gets a hatch, so the difference between
    // "owned" and "working" is visible at a glance — it is the whole story of
    // the first thirty years.
    if (mine && q.brokenAcres < 155) {
      const frac = 1 - q.brokenAcres / 160;
      parts.push(
        `<rect x="${x}" y="${y + CELL * (1 - frac)}" width="${CELL}" height="${CELL * frac}" ` +
          `fill="url(#sod)" opacity="0.55" />`
      );
    }

    // The soil glyph, top right of every quarter, in every mode — soil does
    // not change when you switch the map's colours, so neither does this.
    parts.push(pixelIcon(
      TERRAIN_ICONS[q.soil] || TERRAIN_ICONS.loam, x + CELL - 19, y + 4, 3,
      [TERRAIN_ICON_COLOUR[q.soil] || TERRAIN_ICON_COLOUR.loam]
    ));

    // A neighbour who has actually settled the place gets a small farmstead
    // of their own — plain, one colour, so it reads as "somebody is here"
    // without competing with the yard icon for attention.
    if (q.owner === 'neighbour' && q.brokenAcres > 15) {
      parts.push(pixelIcon(FARMSTEAD_ICON, x + CELL - 30, y + CELL - 30, 3.4, ['#5c4a38', '#5c4a38']));
    }

    parts.push(`<text class="qlabel" x="${x + 5}" y="${y + 13}">${q.quarter} ${q.section}</text>`);
    parts.push(`<text class="qsub" x="${x + 5}" y="${y + 24}">${esc(subLabel(q, mode, state))}</text>`);
    if (mine) {
      parts.push(`<text class="qsub" x="${x + 5}" y="${y + CELL - 6}">${Math.round(q.brokenAcres)} ac broken</text>`);
    } else if (q.forSale) {
      parts.push(`<text class="qsub" x="${x + 5}" y="${y + CELL - 6}" style="font-weight:700">FOR SALE</text>`);
    }
    parts.push('</g>');
  }

  parts.push(renderRoads(state));

  // The yard. Everything on the farm is measured from here — the same
  // farmstead glyph as a neighbour's, larger and in the barn-red and
  // whitewash this map uses nowhere else, so it is unmistakably the one
  // that is yours.
  const home = state.quarters.find((q) => q.id === state.homeQuarterId);
  if (home) {
    const hx = PAD + home.col * CELL + CELL / 2;
    const hy = PAD + home.row * CELL + CELL / 2;
    parts.push(
      `<g pointer-events="none">` +
        `<circle cx="${hx}" cy="${hy}" r="15" fill="#2b2119" opacity="0.22"/>` +
        pixelIcon(FARMSTEAD_ICON, hx - 12, hy - 11, 4, ['#8f3c2c', '#f2ece0']) +
        `<title>The yard</title></g>`
    );
  }

  // Section boundaries, drawn over the quarters.
  for (let c = 0; c <= COLS; c += 2) {
    const x = PAD + c * CELL;
    parts.push(`<line class="secline" x1="${x}" y1="${PAD}" x2="${x}" y2="${PAD + ROWS * CELL}" />`);
  }
  for (let r = 0; r <= ROWS; r += 2) {
    const y = PAD + r * CELL;
    parts.push(`<line class="secline" x1="${PAD}" y1="${y}" x2="${PAD + COLS * CELL}" y2="${y}" />`);
  }

  // Hatch pattern for unbroken sod.
  parts.push(
    '<defs><pattern id="sod" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<line x1="0" y1="0" x2="0" y2="7" stroke="#3c3226" stroke-width="2.2" opacity="0.5"/>' +
      '</pattern></defs>'
  );

  parts.push('</svg>');
  return parts.join('');
}

/**
 * Shaded by how much distance costs this quarter — green and cheap, red and
 * dear. This reuses the same green-to-red the rest of the interface already
 * uses for good news and bad (--good and --alarm in styles.css), so "far
 * out" reads as a cost the moment you look at it, not just as a darker
 * brown next to a lighter one.
 */
function distanceColour(state, q) {
  const loss = 1 - timelinessFactor(state, q);
  const t = Math.min(1, loss / 0.3);
  const shades = ['#4a7040', '#8a9a4a', '#c8912f', '#bd6a35', '#a8341f'];
  return shades[Math.min(shades.length - 1, Math.round(t * (shades.length - 1)))];
}

/**
 * Five real hues, not five browns: clay dark and heavy, loam the warm
 * mid-brown "good soil" actually is, sandy pale, stony grey, slough a wet
 * blue-green so it reads as water-adjacent ground rather than just more dirt.
 */
function soilColour(q) {
  return {
    clay:   '#3f2f22',
    loam:   '#6b4f30',
    sandy:  '#cbb27e',
    stony:  '#928c7c',
    slough: '#43665a',
  }[q.soil] || '#736c5e';
}

function subLabel(q, mode, state) {
  if (mode === 'soil') return SOILS[q.soil].short;
  if (mode === 'roads' && state) {
    const miles = distanceFromYard(state, q);
    return miles === 0 ? 'the yard' : `${miles} mi · ${roadFor(state, q).short}`;
  }
  if (q.owner === 'player') return CROPS[q.use]?.name || q.use;
  if (!q.owner) return 'open';
  if (q.owner === 'neighbour') return q.ownerName || 'neighbour';
  return TENURE_LABEL[q.owner] || q.owner;
}

function quarterTitle(state, q) {
  const soil = SOILS[q.soil];
  const miles = distanceFromYard(state, q);
  const road = roadFor(state, q);
  const lines = [`${legalDescription(q, state.townshipLabel)} — ${soil.name}`];
  lines.push(
    miles === 0
      ? 'The yard'
      : `${miles} miles from the yard, on ${road.short === 'trail' ? 'a trail' : `a ${road.short} road`}`
  );
  if (q.owner === 'player' && miles > 0) {
    const loss = 1 - timelinessFactor(state, q);
    if (loss > 0.02) {
      lines.push(`Distance costs this field about ${Math.round(loss * 100)}% of its crop`);
    }
  }
  if (q.owner === 'player') {
    lines.push(`${CROPS[q.use]?.name || q.use}, ${Math.round(q.brokenAcres)} of 160 acres broken`);
    lines.push(`Fertility ${(q.fertility * 100).toFixed(0)}%`);
    const imp = [q.drained && 'drained', q.stonePicked && 'stone picked', q.fenced && 'fenced'].filter(Boolean);
    if (imp.length) lines.push(imp.join(', '));
  } else if (!q.owner) {
    lines.push('Open for homestead entry — $10 and three years to prove up');
  } else if (q.owner === 'neighbour') {
    lines.push(q.forSale ? `${q.ownerName} is selling` : `${q.ownerName}'s place`);
  } else {
    lines.push(TENURE_LABEL[q.owner] || 'held');
  }
  lines.push(soil.note);
  return lines.join('\n');
}

function quarterAria(state, q) {
  return `${legalDescription(q, state.townshipLabel)}, ${subLabel(q, 'use', state)}` +
    (q.owner === 'player' ? `, ${Math.round(q.brokenAcres)} acres broken` : '');
}

/** The legend under the map, matching whichever mode is showing. */
export function renderLegend(state, mode = 'use') {
  if (mode === 'roads') {
    const items = ROAD_CLASSES.map((c) => {
      const st = ROAD_STROKE[c.level];
      const style = st.dash
        ? `background:repeating-linear-gradient(90deg,${st.colour} 0 4px,transparent 4px 8px);height:${Math.max(2, st.width)}px`
        : `background:${st.colour};height:${Math.max(2, st.width)}px`;
      return `<span><i style="${style};border:none;border-radius:1px"></i>${esc(c.name)}</span>`;
    });
    items.push('<span><i style="background:#4a7040"></i>at the yard</span>');
    items.push('<span><i style="background:#a8341f"></i>far out, and it costs</span>');
    return items.join('');
  }
  if (mode === 'soil') {
    return Object.values(SOILS)
      .map((s) => `<span><i style="background:${soilColour({ soil: s.id })}"></i>${esc(s.name)}</span>`)
      .join('');
  }
  // Only the uses actually present on the player's land, plus the ownership
  // keys. A legend listing fifteen crops the farm does not grow is noise.
  const used = [...new Set(state.quarters.filter((q) => q.owner === 'player').map((q) => q.use))];
  const items = used.map(
    (u) => `<span><i style="background:${USE_COLOURS[u] || USE_COLOURS.idle}"></i>${esc(CROPS[u]?.name || u)}</span>`
  );
  items.push(`<span><i style="background:${OWNER_COLOURS.neighbour}"></i>Neighbours</span>`);
  if (state.quarters.some((q) => q.owner === 'railway')) {
    items.push(`<span><i style="background:${OWNER_COLOURS.railway}"></i>CPR land</span>`);
  }
  if (state.quarters.some((q) => !q.owner)) {
    items.push(`<span><i style="background:${OWNER_COLOURS.vacant}"></i>Open to file on</span>`);
  }
  items.push('<span><i style="background:repeating-linear-gradient(45deg,#3c3226,#3c3226 2px,transparent 2px,transparent 5px)"></i>Unbroken sod</span>');
  return items.join('');
}

/**
 * How the district's own town grew, in five bands. Not this township — the
 * town is where the rail point is, which is why it is drawn as its own small
 * scene rather than claimed as one of the sections above; a real prairie
 * town was miles off, not the neighbour's quarter. Purely a picture: nothing
 * here is read by the engine, and nothing in the engine feeds it beyond the
 * year and the haul distance, which is now a real, moving number (see
 * derive.js's haulMiles()) rather than the constant it used to silently be.
 */
const TOWN_ERAS = [
  { to: 1885, buildings: ['elevator'] },
  { to: 1905, buildings: ['elevator', 'store', 'church'] },
  { to: 1930, buildings: ['elevator', 'elevator', 'store', 'church', 'school'] },
  { to: 1960, buildings: ['elevator', 'elevator', 'store', 'bank', 'church', 'school', 'garage'] },
  { to: 2000, buildings: ['elevator', 'elevator', 'elevator', 'store', 'bank', 'church', 'school', 'garage', 'rink'] },
];

const BUILDING = {
  elevator: { w: 11, h: 46, fill: '#c8912f', cap: '#241d16' },
  store:    { w: 17, h: 20, fill: '#8f3c2c' },
  bank:     { w: 17, h: 24, fill: '#6b5a44' },
  church:   { w: 13, h: 22, fill: '#e7dcc0', steeple: true },
  school:   { w: 19, h: 20, fill: '#a3652f' },
  garage:   { w: 17, h: 15, fill: '#7688a0' },
  rink:     { w: 22, h: 12, fill: '#4c6b38' },
};

export function townEraFor(year) {
  return TOWN_ERAS.find((e) => year <= e.to) || TOWN_ERAS[TOWN_ERAS.length - 1];
}

/** The district's town, drawn as a small growing skyline. */
export function renderTown(state) {
  const era = townEraFor(state.year);
  const w = 300;
  const h = 64;
  const base = h - 8;
  const parts = [`<svg class="town" viewBox="0 0 ${w} ${h}" role="img" aria-label="The town, ${era.buildings.length} building${era.buildings.length === 1 ? '' : 's'} of it">`];
  parts.push(`<line x1="4" y1="${base}" x2="${w - 4}" y2="${base}" stroke="var(--rule-strong)" stroke-width="1.4" />`);

  let x = 10;
  for (const id of era.buildings) {
    const b = BUILDING[id];
    const bx = x;
    const by = base - b.h;
    parts.push(`<rect x="${bx}" y="${by}" width="${b.w}" height="${b.h}" fill="${b.fill}" />`);
    if (b.cap) parts.push(`<rect x="${bx - 1}" y="${by - 3}" width="${b.w + 2}" height="4" fill="${b.cap}" />`);
    if (b.steeple) {
      parts.push(`<rect x="${bx + b.w / 2 - 1.5}" y="${by - 9}" width="3" height="9" fill="${b.fill}" />`);
    }
    x += b.w + 7;
  }

  const haul = Math.round(haulMilesFor(state));
  parts.push(
    `<text x="${w - 6}" y="${h - 1}" text-anchor="end" class="townlabel">` +
      `the town, ${haul} mi off</text>`
  );
  parts.push('</svg>');
  return parts.join('');
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
