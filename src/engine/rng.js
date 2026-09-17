// Deterministic pseudo-random number generation.
//
// Two rules govern this module and they are the reason balance work is possible
// at all:
//
//   1. The generator state is a single 32-bit integer, so it serializes into the
//      save file without ceremony. Reload a save and the future is unchanged.
//   2. Systems draw from *named streams*, not one shared sequence. A stream is
//      derived by hashing (seed, label), so adding a new random call to the
//      event system does not shift every weather roll in every other year. Two
//      builds of the game can be compared on the same seed even after the code
//      has moved underneath them.

const UINT32 = 4294967296;

// FNV-1a. Used only to turn a label into a seed, never for anything that needs
// cryptographic properties.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Mulberry32: one 32-bit word of state, good distribution, fast enough that a
// 300-run batch of 125-year games is not waiting on it.
function mulberry32(state) {
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };
}

/**
 * Create a generator over a numeric seed.
 * The returned object carries `state` so a caller can snapshot and restore it.
 */
export function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  const raw = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };

  return {
    /** Uniform float in [0, 1). */
    next: raw,

    get state() {
      return state;
    },
    set state(v) {
      state = (v >>> 0) || 1;
    },

    /** Integer in [0, n). Returns 0 for n <= 0 rather than NaN. */
    int(n) {
      if (!(n > 0)) return 0;
      return Math.floor(raw() * n);
    },

    /** Integer in [lo, hi], inclusive both ends. */
    range(lo, hi) {
      if (hi < lo) [lo, hi] = [hi, lo];
      return lo + Math.floor(raw() * (hi - lo + 1));
    },

    /** Float in [lo, hi). */
    float(lo, hi) {
      return lo + raw() * (hi - lo);
    },

    /** True with probability p. */
    chance(p) {
      return raw() < p;
    },

    /** Uniform element of a non-empty array; undefined for an empty one. */
    pick(arr) {
      if (!arr || arr.length === 0) return undefined;
      return arr[Math.floor(raw() * arr.length)];
    },

    /**
     * Weighted pick. `entries` is an array of objects each carrying a numeric
     * weight under `weightKey` (default `weight`). Entries with non-positive or
     * missing weight are skipped. Returns undefined if nothing is selectable —
     * callers must handle that rather than assuming a result.
     */
    weighted(entries, weightKey = 'weight') {
      let total = 0;
      for (const e of entries) {
        const w = e[weightKey];
        if (w > 0) total += w;
      }
      if (total <= 0) return undefined;
      let roll = raw() * total;
      for (const e of entries) {
        const w = e[weightKey];
        if (!(w > 0)) continue;
        roll -= w;
        if (roll < 0) return e;
      }
      // Only reachable through float accumulation error at the very end.
      return entries[entries.length - 1];
    },

    /**
     * Normal deviate via Box-Muller, clamped to +/- 3 sd. Yields and prices are
     * roughly bell-shaped but a 6-sigma harvest is a bug, not a good year.
     */
    normal(mean = 0, sd = 1) {
      const u = Math.max(raw(), Number.EPSILON);
      const v = raw();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      return mean + sd * Math.max(-3, Math.min(3, z));
    },

    /** In-place Fisher-Yates. Returns the same array for chaining. */
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(raw() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

/**
 * A generator for one named stream of one run.
 *
 * Call this per (year, system) so each system's draws are independent of how
 * many draws its neighbours made:
 *
 *   const weather = streamFor(state.seed, state.year, 'weather');
 *
 * The same (seed, year, label) always produces the same sequence, which is what
 * makes a re-run of a seed reproduce a run exactly and what lets an ablation
 * change one subsystem without disturbing the rest of the world.
 */
export function streamFor(seed, year, label) {
  return makeRng(hashString(`${seed >>> 0}|${year}|${label}`));
}

export { mulberry32 };
