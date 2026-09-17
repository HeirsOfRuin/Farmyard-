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
import { timelinessFactor } from '../engine/derive.js';
import { ROAD_CLASSES } from '../data/roads.data.js';
import { CROPS } from '../data/crops.data.js';
import { SOILS } from '../data/regions.data.js';

const CELL = 100;
const PAD = 22;
const COLS = MAP_SECTIONS[0].length * 2;
const ROWS = MAP_SECTIONS.length * 2;

/** What each land use looks like. Earthy, and distinguishable in both themes. */
export const USE_COLOURS = {
  wheat:     '#c99a3c',
  oats:      '#c7b478',
  barley:    '#bfa06a',
  rye:       '#a89a5e',
  flax:      '#6d8cae',
  rapeseed:  '#d9bb3c',
  canola:    '#e0c63e',
  sunflower: '#cf8c2c',
  sugarbeet: '#7d4a5e',
  potato:    '#a3835c',
  hay:       '#7d9455',
  pasture:   '#5f7a45',
  fallow:    '#7a6450',
  idle:      '#8d8375',
  bush:      '#43583c',
};

const OWNER_COLOURS = {
  neighbour: '#b9ad97',
  railway:   '#9aa3ad',
  hbc:       '#a89a9a',
  school:    '#a5aa96',
  vacant:    '#cdc3ae',
};

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

  // The yard. Everything on the farm is measured from here.
  const home = state.quarters.find((q) => q.id === state.homeQuarterId);
  if (home) {
    const hx = PAD + home.col * CELL + CELL / 2;
    const hy = PAD + home.row * CELL + CELL / 2;
    parts.push(
      `<g pointer-events="none">` +
        `<circle cx="${hx}" cy="${hy}" r="9" fill="#2b2119" opacity="0.85"/>` +
        `<circle cx="${hx}" cy="${hy}" r="4" fill="#d9a441"/>` +
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

/** Shaded by how much distance costs this quarter — pale near, dark far. */
function distanceColour(state, q) {
  const loss = 1 - timelinessFactor(state, q);
  const t = Math.min(1, loss / 0.3);
  // A wider spread than the first attempt, which put five near-identical browns
  // next to each other and conveyed nothing.
  const shades = ['#eae2cc', '#cfbb93', '#ad8f5f', '#856434', '#5a3f1c'];
  return shades[Math.min(shades.length - 1, Math.round(t * (shades.length - 1)))];
}

function soilColour(q) {
  return {
    clay:   '#5d4a3a',
    loam:   '#6b5a44',
    sandy:  '#c2ad86',
    stony:  '#9a978d',
    slough: '#6a7d78',
  }[q.soil] || '#8d8375';
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
    items.push('<span><i style="background:#eae2cc"></i>at the yard</span>');
    items.push('<span><i style="background:#5a3f1c"></i>far out, and it costs</span>');
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

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
