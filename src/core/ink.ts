// Render-time ink adaptation for dark mode.
//
// Stroke and text colors are persisted data and are NEVER mutated by this
// module — a drawing must still render correctly in light mode and for a
// viewer whose theme differs from the host's. This only changes how ink is
// PAINTED under a dark theme.
//
// Rule (luminance-gated, hue-preserving): in dark mode, ink whose perceptual
// luminance is below DARK_LUM_MAX would be near-invisible on the dark canvas,
// so its lightness is flipped (dark -> light) while its hue and saturation are
// preserved. The default near-black pen (#0f172a, luminance ~0.09) flips to a
// light slate; every chromatic preset (luminance >= ~0.24) is above the gate
// and renders pixel-identical to what was drawn.

// Below this perceptual luminance (0..1) an ink is treated as "dark ink" that
// must be lightened to stay visible on the dark canvas. Sits comfortably
// between the default pen (~0.09) and the darkest chromatic preset, red (~0.24).
const DARK_LUM_MAX = 0.18;

interface RGB {
  r: number;
  g: number;
  b: number;
}

export function parseColor(color: string): RGB | null {
  const c = color.trim();
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (m3) {
    return {
      r: Number.parseInt(m3[1] + m3[1], 16),
      g: Number.parseInt(m3[2] + m3[2], 16),
      b: Number.parseInt(m3[3] + m3[3], 16),
    };
  }
  const m6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
  if (m6) {
    return {
      r: Number.parseInt(m6[1], 16),
      g: Number.parseInt(m6[2], 16),
      b: Number.parseInt(m6[3], 16),
    };
  }
  const mr = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(c);
  if (mr) {
    return { r: Number(mr[1]), g: Number(mr[2]), b: Number(mr[3]) };
  }
  return null;
}

// Perceptual (sRGB-weighted) luminance, 0..1.
function luminance({ r, g, b }: RGB): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function hslToCss(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

// Adapt a stored ink color for display under the active theme.
export function adaptInk(color: string, isDark: boolean): string {
  if (!isDark) return color;
  const rgb = parseColor(color);
  if (!rgb) return color;
  if (luminance(rgb) >= DARK_LUM_MAX) return color; // visible as-is on dark canvas
  // Flip lightness, keep hue + saturation, so dark ink becomes light ink.
  const { h, s, l } = rgbToHsl(rgb);
  return hslToCss(h, s, 1 - l);
}
