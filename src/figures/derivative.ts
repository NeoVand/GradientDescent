/**
 * The derivative chapter's secant-sweep figure: chords leaning on y = x² a
 * nudge h away, tilting into the tangent as h → 0. Pure compute + an SVG
 * string shared by the app and the book.
 */

import { type FigTheme, pal, texLabel } from './theme';

export function computeSecant() {
  const W = 300, H = 140, a = 1.0;
  const xMin = -0.3, xMax = 3.2, yMax = xMax * xMax;
  const px = (x: number) => 14 + ((x - xMin) / (xMax - xMin)) * (W - 28);
  const py = (y: number) => H - 20 - (y / yMax) * (H - 40);
  const N = 48;
  const curve = 'M ' + Array.from({ length: N + 1 }, (_, i) => {
    const x = xMin + (i / N) * (xMax - xMin);
    return `${px(x).toFixed(1)},${py(x * x).toFixed(1)}`;
  }).join(' L ');
  const at = (x: number) => ({ x: px(x), y: py(x * x) });
  const chords = [1.9, 1.15, 0.6].map((h, i) => ({
    x1: at(a).x, y1: at(a).y, x2: at(a + h).x, y2: at(a + h).y,
    end: at(a + h), o: 0.3 + i * 0.18
  }));
  // The tangent (slope 2a), drawn a touch past the point on both sides.
  const tan = (x: number) => a * a + 2 * a * (x - a);
  const tangent = { x1: px(a - 0.75), y1: py(tan(a - 0.75)), x2: px(a + 1.15), y2: py(tan(a + 1.15)) };
  // The sweep: a quiet curved arrow from the outermost chord down onto the
  // tangent — the direction "h → 0" travels.
  const lerp = (A: { x: number; y: number }, B: { x: number; y: number }, t: number) =>
    ({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t });
  const s0 = lerp({ x: chords[0].x1, y: chords[0].y1 }, chords[0].end, 0.62);
  const s1 = { x: px(a + 0.92), y: py(tan(a + 0.92)) - 5 };
  const mid = lerp(s0, s1, 0.5);
  const nx = s1.y - s0.y, ny = -(s1.x - s0.x);
  const nm = Math.hypot(nx, ny);
  const ctrl = { x: mid.x + (nx / nm) * 16, y: mid.y + (ny / nm) * 16 };
  const sweep = `M ${s0.x.toFixed(1)},${s0.y.toFixed(1)} Q ${ctrl.x.toFixed(1)},${ctrl.y.toFixed(1)} ${s1.x.toFixed(1)},${s1.y.toFixed(1)}`;
  return { W, H, curve, chords, tangent, p: at(a), pEnd: at(a + 1.9), sweep, ctrl };
}

export function secantSvg(theme: FigTheme): string {
  const f = computeSecant();
  const c = pal(theme);
  const chords = f.chords
    .map(
      s =>
        `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${c.textTertiary}" stroke-width="1" stroke-opacity="${s.o}" />` +
        `<circle cx="${s.end.x}" cy="${s.end.y}" r="1.8" fill="${c.textTertiary}" fill-opacity="${s.o + 0.2}" />`
    )
    .join('\n');
  return `<svg viewBox="0 0 ${f.W} ${f.H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
<defs>
<marker id="sweep-head" viewBox="0 -4 8 8" refX="6.5" refY="0" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,-2.8 L6.5,0 L0,2.8" fill="none" stroke="${c.textTertiary}" stroke-width="1.1" /></marker>
</defs>
<path d="${f.curve}" fill="none" stroke="#10b981" stroke-width="1.6" stroke-opacity="0.65" />
${chords}
<line x1="${f.tangent.x1}" y1="${f.tangent.y1}" x2="${f.tangent.x2}" y2="${f.tangent.y2}" stroke="#3b82f6" stroke-width="1.7" stroke-opacity="0.95" />
<path d="${f.sweep}" fill="none" stroke="${c.textTertiary}" stroke-width="1" stroke-opacity="0.75" marker-end="url(#sweep-head)" />
<circle cx="${f.p.x}" cy="${f.p.y}" r="3" fill="#f59e0b" stroke="#fff" stroke-width="1.2" />
${texLabel(theme, String.raw`\alpha`, { x: f.p.x - 10, y: f.p.y + 8, w: 24, h: 22 })}
${texLabel(theme, String.raw`\alpha + h`, { x: f.pEnd.x - 16, y: f.pEnd.y - 24, w: 44, h: 22, dim: true })}
${texLabel(theme, String.raw`h \to 0`, { x: f.ctrl.x + 4, y: f.ctrl.y - 8, w: 46, h: 22, dim: true })}
</svg>`;
}
