/**
 * Inline math for prose strings outside the guide (coach toasts, banners).
 *
 * Every `$...$` segment renders through KaTeX; everything else is escaped and
 * passed through as text — the same micro-syntax the guide's card prose uses,
 * so a symbol reads identically in a toast and in the book.
 */
import katex from 'katex';

const escHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function inlineMath(src: string): string {
  return src
    .split(/\$([^$]+)\$/)
    .map((seg, i) =>
      i % 2 === 1
        ? katex.renderToString(seg, { throwOnError: false, displayMode: false })
        : escHtml(seg)
    )
    .join('');
}
