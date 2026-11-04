export const DEFAULT_ACCENT = '#0F9B7A';

function parse(hex: string | null | undefined): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  const h = m ? m[1] : DEFAULT_ACCENT.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function hexToHslTriplet(hex: string | null | undefined): string {
  const [r, g, b] = parse(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// White is preferred on brand colours as long as it reaches 3:1 (AA for large text/UI);
// otherwise dark ink, which then has the higher contrast.
export function readableOn(hex: string | null | undefined): '#ffffff' | '#1b2430' {
  const lum = luminance(parse(hex));
  return 1.05 / (lum + 0.05) >= 3 ? '#ffffff' : '#1b2430';
}
