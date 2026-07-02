/**
 * The figure render targets. Figures are pure compute + an SVG-string render
 * shared by the app and the book (docs/plan/06 §2):
 *
 *   'app'   — colours stay CSS variables, so the app's theme cascade does the
 *             theming; math labels render through KaTeX in a foreignObject
 *             (exactly the markup the hand-written figures used).
 *   'print' — the day palette, concretized (standalone SVGs can't resolve
 *             vars), and labels as plain SVG text (rsvg has no foreignObject);
 *             the glyphs come from a tiny TeX→Unicode map.
 */

import katex from 'katex';

export type FigTheme = 'app' | 'print';

export interface FigPalette {
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
}

export function pal(theme: FigTheme): FigPalette {
  return theme === 'app'
    ? {
        textPrimary: 'var(--color-text-primary)',
        textSecondary: 'var(--color-text-secondary)',
        textTertiary: 'var(--color-text-tertiary)',
        border: 'var(--color-border)'
      }
    : {
        textPrimary: '#1a1a1a',
        textSecondary: '#4a4a4a',
        textTertiary: '#666666',
        border: '#e0e0e0'
      };
}

/** The label glyphs the figures actually use, TeX → Unicode. */
const TEX_GLYPHS: [RegExp, string][] = [
  [/\\alpha/g, 'α'],
  [/\\beta/g, 'β'],
  [/\\gamma/g, 'γ'],
  [/\\lambda/g, 'λ'],
  [/\\to/g, '→'],
  [/\\,/g, ' '],
  [/[{}]/g, '']
];

export function texToUnicode(tex: string): string {
  let s = tex;
  for (const [re, sub] of TEX_GLYPHS) s = s.replace(re, sub);
  return s.trim();
}

export interface TexLabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** extra classes on the app span ('dim') */
  dim?: boolean;
  /** inline style on the app span / fill on the print text */
  color?: string;
  /** plain text after the math ('λ large') */
  suffix?: string;
}

/**
 * A math label at a figure coordinate. App: the foreignObject + KaTeX span
 * the figures have always used. Print: an italic serif <text> at the same
 * spot (foreignObject doesn't survive SVG rasterizers).
 */
/** KaTeX inline HTML for app-theme labels (same options the guide uses). */
export const katexHtml = (tex: string): string =>
  katex.renderToString(tex, { throwOnError: false, displayMode: false });

export function texLabel(theme: FigTheme, tex: string, box: TexLabelBox): string {
  if (theme === 'app') {
    const html = katexHtml(tex);
    const cls = box.dim ? 'fig-tex dim' : 'fig-tex';
    const style = box.color ? ` style="color:${box.color}"` : '';
    return `<foreignObject x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"><span class="${cls}"${style}>${html}${box.suffix ?? ''}</span></foreignObject>`;
  }
  const fill = box.color ?? (box.dim ? '#666666' : '#1a1a1a');
  // Match the app's optical placement: the span text sits mid-box.
  return `<text x="${box.x + 2}" y="${box.y + box.h / 2 + 4}" font-family="Georgia, serif" font-style="italic" font-size="11.5" fill="${fill}">${texToUnicode(tex)}${box.suffix ?? ''}</text>`;
}
