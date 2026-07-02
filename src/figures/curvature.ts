/**
 * The curvature chapter's two figures: the shared-tangent bend comparison,
 * and the (1 − γλ) multiplier run honestly across four regimes. Pure compute
 * + SVG strings shared by the app and the book.
 */

import { type FigTheme, pal, texLabel, katexHtml } from './theme';

// ---------- the bend: same slope, two futures ----------

export function computeBend() {
  // Screen y grows DOWNWARD, so a loss curve that bends UP (positive λ)
  // needs its quadratic term SUBTRACTED. Staged as a descent to the right:
  // the sharp curve bottoms out and curls back up; the gentle one keeps
  // rolling — same tangent at the marker.
  const W = 300, H = 126, x0 = 104, y0 = 82, m = 0.35;
  const mk = (c: number, lo: number, hi: number) => {
    const f = (dx: number) => y0 + m * dx - c * dx * dx;
    const pts: string[] = [];
    for (let dx = lo; dx <= hi; dx += 4) pts.push(`${(x0 + dx).toFixed(1)},${f(dx).toFixed(1)}`);
    return { d: 'M ' + pts.join(' L '), end: { x: x0 + hi, y: f(hi) } };
  };
  const sharp = mk(0.0075, -78, 88);
  const gentle = mk(0.0015, -92, 118);
  return { W, H, x0, y0, sharp, gentle,
    tan: { x1: x0 - 86, y1: y0 + m * -86, x2: x0 + 100, y2: y0 + m * 100 } };
}

export function bendSvg(theme: FigTheme): string {
  const f = computeBend();
  const c = pal(theme);
  return `<svg viewBox="0 0 ${f.W} ${f.H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
<line x1="${f.tan.x1}" y1="${f.tan.y1}" x2="${f.tan.x2}" y2="${f.tan.y2}" stroke="${c.textTertiary}" stroke-width="1" stroke-dasharray="3,3.5" stroke-opacity="0.55" />
<path d="${f.sharp.d}" fill="none" stroke="#f87171" stroke-width="1.6" stroke-opacity="0.9" />
<path d="${f.gentle.d}" fill="none" stroke="#34d399" stroke-width="1.6" stroke-opacity="0.9" />
<circle cx="${f.x0}" cy="${f.y0}" r="3" fill="#f59e0b" stroke="#fff" stroke-width="1.2" />
${texLabel(theme, String.raw`\lambda`, { x: f.sharp.end.x + 5, y: f.sharp.end.y - 8, w: 70, h: 18, color: '#f87171', suffix: ' large' })}
${texLabel(theme, String.raw`\lambda`, { x: f.gentle.end.x + 5, y: f.gentle.end.y - 8, w: 70, h: 18, color: '#34d399', suffix: ' small' })}
</svg>`;
}

// ---------- the multiplier: four regimes, run for real ----------

export function computeRegimes() {
  const PW = 110, H = 128, pad = 14;
  const panel = (gl: number, a0: number, latex: string, word: string, i: number) => {
    const ox = i * PW;
    const px = (x: number) => ox + PW / 2 + x * (PW / 2 - pad);
    const py = (y: number) => H - 34 - y * (H - 62);
    const N = 30;
    const curve = 'M ' + Array.from({ length: N + 1 }, (_, k) => {
      const x = -1.12 + (2.24 * k) / N;
      return `${px(x).toFixed(1)},${py(x * x).toFixed(1)}`;
    }).join(' L ');
    const dots: { x: number; y: number }[] = [];
    let aK = a0;
    for (let k = 0; k <= 6 && Math.abs(aK) <= 1.12; k++) {
      dots.push({ x: px(aK), y: py(aK * aK) });
      aK = (1 - gl) * aK;
    }
    const hops = 'M ' + dots.map(d => `${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(' L ');
    return { ox, curve, dots, hops, latex, word, lx: ox + PW / 2 };
  };
  // The diverging run starts closer in, so its growing bounces stay on
  // stage long enough to be seen growing.
  return { W: PW * 4, H, PW, panels: [
    panel(0.35, -1, String.raw`\gamma\lambda = 0.35`, 'glide', 0),
    panel(1.0, -1, String.raw`\gamma\lambda = 1`, 'one hop', 1),
    panel(1.75, -1, String.raw`\gamma\lambda = 1.75`, 'bounce in', 2),
    panel(2.2, -0.5, String.raw`\gamma\lambda = 2.2`, 'diverge', 3)
  ] };
}

export function regimesSvg(theme: FigTheme): string {
  const f = computeRegimes();
  const c = pal(theme);
  const panels = f.panels
    .map((pn, i) => {
      const divider =
        i > 0
          ? `<line x1="${pn.ox}" y1="10" x2="${pn.ox}" y2="${f.H - 30}" stroke="${c.border}" stroke-width="1" stroke-opacity="0.5" />\n`
          : '';
      const dots = pn.dots
        .map(
          (dt, k) =>
            `<circle cx="${dt.x}" cy="${dt.y}" r="${k === 0 ? 2.8 : 2}" fill="#f59e0b" fill-opacity="${k === 0 ? 1 : 0.8}" stroke="${k === 0 ? '#fff' : 'none'}" stroke-width="1" />`
        )
        .join('\n');
      const label =
        theme === 'app'
          ? `<foreignObject x="${pn.ox + 4}" y="${f.H - 27}" width="${f.PW - 8}" height="27"><span class="fig-tex" style="display:block;text-align:center">${katexHtml(pn.latex)}</span> <span class="fig-word" style="text-align:center;margin-top:2px">${pn.word}</span></foreignObject>`
          : `<text x="${pn.lx}" y="${f.H - 16}" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="11" fill="${c.textPrimary}">${pn.latex.replace(/\\gamma\\lambda/, 'γλ').replace(/[\\{}]/g, '')}</text>` +
            `<text x="${pn.lx}" y="${f.H - 4}" text-anchor="middle" font-size="9.5" fill="${c.textTertiary}">${pn.word}</text>`;
      return (
        divider +
        `<path d="${pn.curve}" fill="none" stroke="#10b981" stroke-width="1.4" stroke-opacity="0.6" />\n` +
        `<path d="${pn.hops}" fill="none" stroke="#f59e0b" stroke-width="1" stroke-opacity="0.55" />\n` +
        dots +
        '\n' +
        label
      );
    })
    .join('\n');
  return `<svg viewBox="0 0 ${f.W} ${f.H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
${panels}
</svg>`;
}
