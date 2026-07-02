/**
 * The steepest-descent proof figure: left, the gradient's shadow on a unit
 * direction u; right, that shadow swept through 180° tracing a cosine. All
 * plain SVG (no foreignObject), so app and print share one path exactly.
 */

import { type FigTheme, pal } from './theme';

export function computeProofCosine() {
  const x0 = 252, x1 = 378, yc = 80, amp = 46, N = 60;
  const asc: string[] = [], desc: string[] = [];
  for (let i = 0; i <= N; i++) {
    const th = Math.PI * (i / N);
    const x = x0 + (i / N) * (x1 - x0), y = yc - Math.cos(th) * amp;
    const pt = `${x.toFixed(1)},${y.toFixed(1)}`;
    if (th <= Math.PI / 2 + 1e-9) asc.push(pt);
    if (th >= Math.PI / 2 - 1e-9) desc.push(pt);
  }
  return { x0, x1, yc, amp,
    ascD: 'M ' + asc.join(' L '), descD: 'M ' + desc.join(' L '),
    p0: { x: x0, y: yc - amp }, p90: { x: (x0 + x1) / 2, y: yc }, p180: { x: x1, y: yc + amp } };
}

export function proofCosineSvg(theme: FigTheme): string {
  const f = computeProofCosine();
  const c = pal(theme);
  const lbl = `font-size="10.5" font-weight="600"`;
  return `<svg viewBox="0 0 420 156" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true" style="display:block;width:100%;height:auto">
<defs>
<marker id="pf-grad" viewBox="0 -5 10 10" refX="8" refY="0" markerWidth="5.5" markerHeight="5.5" orient="auto"><path d="M0,-5L10,0L0,5" fill="#f59e0b" /></marker>
<marker id="pf-u" viewBox="0 -5 10 10" refX="8" refY="0" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,-5L10,0L0,5" fill="${c.textTertiary}" /></marker>
</defs>
<line x1="210" y1="16" x2="210" y2="146" fill="none" stroke="#10b981" stroke-width="1" style="stroke-opacity:0.16" />
<line x1="36" y1="112" x2="174" y2="112" stroke="${c.textTertiary}" stroke-width="1.2" stroke-dasharray="3,3" stroke-opacity="0.6" marker-end="url(#pf-u)" />
<line x1="36" y1="112" x2="130.5" y2="112" stroke="#3b82f6" stroke-width="4.5" stroke-linecap="round" />
<line x1="130.5" y1="48.3" x2="130.5" y2="112" stroke="${c.textTertiary}" stroke-width="1" stroke-dasharray="2.5,2.5" stroke-opacity="0.75" />
<path d="M 123.5,112 L 123.5,105 L 130.5,105" fill="none" stroke="${c.textTertiary}" stroke-width="1" stroke-opacity="0.75" />
<line x1="36" y1="112" x2="128.6" y2="49.5" stroke="#f59e0b" stroke-width="2.6" marker-end="url(#pf-grad)" />
<path d="M 64,112 A 28,28 0 0 0 60.4,97.6" fill="none" stroke="${c.textTertiary}" stroke-width="1.2" />
<circle cx="36" cy="112" r="2.8" fill="${c.textPrimary}" />
<text x="134" y="46" ${lbl} text-anchor="start" fill="#f59e0b">∇ℒ</text>
<text x="178" y="116" ${lbl} text-anchor="start" fill="${c.textSecondary}">u</text>
<text x="72" y="105" ${lbl} text-anchor="middle" fill="${c.textTertiary}">φ</text>
<text x="83" y="128" ${lbl} text-anchor="middle" fill="#3b82f6">‖∇ℒ‖ cos φ</text>
<line x1="${f.x0 - 8}" y1="${f.yc}" x2="${f.x1 + 8}" y2="${f.yc}" stroke="${c.textTertiary}" stroke-width="1" stroke-dasharray="3,3" stroke-opacity="0.45" />
<path d="${f.ascD}" fill="none" stroke="#f59e0b" stroke-width="2.4" stroke-linecap="round" />
<path d="${f.descD}" fill="none" stroke="#10b981" stroke-width="2.4" stroke-linecap="round" />
<circle cx="${f.p0.x}" cy="${f.p0.y}" r="3.1" fill="#f59e0b" />
<circle cx="${f.p90.x}" cy="${f.p90.y}" r="3.1" fill="${c.textTertiary}" />
<circle cx="${f.p180.x}" cy="${f.p180.y}" r="3.1" fill="#10b981" />
<text x="${f.p0.x - 3}" y="${f.p0.y - 8}" ${lbl} text-anchor="start" fill="#f59e0b">along ∇ℒ</text>
<text x="${f.p90.x}" y="${f.p90.y - 9}" ${lbl} text-anchor="middle" fill="${c.textTertiary}">contour · flat</text>
<text x="${f.p180.x + 3}" y="${f.p180.y + 13}" ${lbl} text-anchor="end" fill="#10b981">along −∇ℒ</text>
</svg>`;
}
