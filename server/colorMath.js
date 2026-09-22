import { converter, differenceCiede2000, formatHex } from 'culori';

const toRgb = converter('rgb');
const toLab = converter('lab');
const deltaE2000 = differenceCiede2000();

// ---------------------------------------------------------------------------
// CVD simulation matrices, applied in LINEAR RGB space.
// (Machado-style / color-blindness.com simulation matrices)
// ---------------------------------------------------------------------------
export const MODES = ['normal', 'protan', 'deutan', 'tritan'];

export const MODE_LABELS = {
  normal: '正常',
  protan: '红弱 (Protan)',
  deutan: '绿弱 (Deutan)',
  tritan: '蓝弱 (Tritan)',
};

const MATRICES = {
  protan: [
    [0.567, 0.433, 0.0],
    [0.558, 0.442, 0.0],
    [0.0, 0.242, 0.758],
  ],
  deutan: [
    [0.625, 0.375, 0.0],
    [0.7, 0.3, 0.0],
    [0.0, 0.3, 0.7],
  ],
  tritan: [
    [0.95, 0.05, 0.0],
    [0.0, 0.433, 0.567],
    [0.0, 0.475, 0.525],
  ],
};

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Normalize any culori-parseable color to a #rrggbb hex string. */
export function normalizeHex(color) {
  const rgb = toRgb(color);
  if (!rgb || rgb.r === undefined) return null;
  return formatHex({ mode: 'rgb', r: clamp01(rgb.r), g: clamp01(rgb.g), b: clamp01(rgb.b) });
}

/** Simulate one hex color under a CVD mode. Matrix applied in linear RGB. */
export function simulateHex(hex, mode) {
  if (mode === 'normal') return normalizeHex(hex);
  const m = MATRICES[mode];
  if (!m) throw new Error(`unknown mode: ${mode}`);
  const { r, g, b } = toRgb(hex);
  const lin = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  const out = [0, 1, 2].map((row) =>
    clamp01(linearToSrgb(m[row][0] * lin[0] + m[row][1] * lin[1] + m[row][2] * lin[2]))
  );
  return formatHex({ mode: 'rgb', r: out[0], g: out[1], b: out[2] });
}

/** CIEDE2000 distance between two hex colors (converted to Lab internally). */
export function deltaE(hexA, hexB) {
  return deltaE2000(toLab(hexA), toLab(hexB));
}

const round2 = (n) => Math.round(n * 100) / 100;

function allPairs(n) {
  const pairs = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
  return pairs;
}

/**
 * Evaluate a palette under the given modes.
 * colors: [{ label, hex }], modes: subset of MODES.
 * Returns per-mode simulated hexes, pair distances, min distance, and the
 * worst mode (smallest minimum pair distance).
 */
export function evaluatePalette(colors, threshold, modes) {
  const pairIdx = allPairs(colors.length);
  const modesOut = {};
  let worstMode = null;
  let worstMin = Infinity;

  for (const mode of modes) {
    const simHexes = colors.map((c) => simulateHex(c.hex, mode));
    const pairs = pairIdx.map(([i, j]) => {
      const distance = deltaE(simHexes[i], simHexes[j]);
      return {
        i,
        j,
        a: colors[i].label,
        b: colors[j].label,
        distance: round2(distance),
        pass: distance >= threshold,
      };
    });
    const minDistance = pairs.length ? Math.min(...pairs.map((p) => p.distance)) : null;
    modesOut[mode] = { simHexes, pairs, minDistance };
    if (minDistance !== null && minDistance < worstMin) {
      worstMin = minDistance;
      worstMode = mode;
    }
  }

  return { threshold, modes: modesOut, worstMode, worstMinDistance: worstMode ? worstMin : null };
}

// ---------------------------------------------------------------------------
// Replacement suggestion
// ---------------------------------------------------------------------------

/** Built-in candidate grid: HSL hue/saturation/lightness grid + neutral grays. */
export function buildCandidateGrid() {
  const grid = [];
  const seen = new Set();
  const push = (color) => {
    const hex = normalizeHex(color);
    if (hex && !seen.has(hex)) {
      seen.add(hex);
      grid.push(hex);
    }
  };
  for (let h = 0; h < 360; h += 15) {
    for (const s of [0.45, 0.7, 0.95]) {
      for (const l of [0.3, 0.45, 0.6, 0.75]) {
        push({ mode: 'hsl', h, s, l });
      }
    }
  }
  for (const l of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
    push({ mode: 'hsl', h: 0, s: 0, l });
  }
  return grid;
}

/**
 * Suggest a replacement for colors[replaceIndex]; all other colors are locked.
 * Picks the candidate whose WORST pair distance across ALL modes is maximal
 * (maximin). Ties are broken by the smaller CIEDE2000 change vs. the original
 * color (under normal vision).
 */
export function suggestReplacement(colors, threshold, modes, replaceIndex) {
  const n = colors.length;
  const lockedIdx = [...Array(n).keys()].filter((k) => k !== replaceIndex);

  // Locked-vs-locked pair distances are constant; precompute their min per mode.
  const lockedSim = {};
  const constMin = {};
  for (const mode of modes) {
    lockedSim[mode] = lockedIdx.map((k) => simulateHex(colors[k].hex, mode));
    let m = Infinity;
    for (let a = 0; a < lockedIdx.length; a++) {
      for (let b = a + 1; b < lockedIdx.length; b++) {
        m = Math.min(m, deltaE(lockedSim[mode][a], lockedSim[mode][b]));
      }
    }
    constMin[mode] = m;
  }

  const originalHex = normalizeHex(colors[replaceIndex].hex);
  let best = null;

  for (const cand of buildCandidateGrid()) {
    let minAcross = Infinity;
    const perMode = {};
    for (const mode of modes) {
      const simCand = simulateHex(cand, mode);
      let m = constMin[mode];
      for (const locked of lockedSim[mode]) {
        m = Math.min(m, deltaE(simCand, locked));
      }
      perMode[mode] = round2(m);
      if (m < minAcross) minAcross = m;
    }
    const change = deltaE(originalHex, cand);
    if (
      !best ||
      minAcross > best.minDistance + 1e-9 ||
      (Math.abs(minAcross - best.minDistance) <= 1e-9 && change < best.change)
    ) {
      best = { hex: cand, minDistance: minAcross, change, perMode };
    }
  }

  return {
    replaceIndex,
    label: colors[replaceIndex].label,
    originalHex,
    hex: best.hex,
    minDistance: round2(best.minDistance),
    change: round2(best.change),
    perMode: best.perMode,
    pass: best.minDistance >= threshold,
  };
}
