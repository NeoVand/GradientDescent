/**
 * Renders every split figure in the print theme and converts it to PDF for
 * the book (rsvg-convert; brew librsvg locally, librsvg2-bin in CI). Runs
 * before emit-latex via `npm run book:tex`.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { figureSvgs } from '../src/figures';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'book', 'figures');
mkdirSync(outDir, { recursive: true });

for (const [id, render] of Object.entries(figureSvgs)) {
  const svgPath = join(outDir, `${id}.svg`);
  writeFileSync(svgPath, render('print'));
  execFileSync('rsvg-convert', ['-f', 'pdf', '-o', join(outDir, `${id}.pdf`), svgPath]);
  console.log(`figures/${id}.pdf`);
}
