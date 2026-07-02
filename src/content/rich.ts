/**
 * The Rich micro-syntax — one tiny grammar for every prose string in the
 * content modules, shared by the in-app renderer and the LaTeX emitter:
 *
 *   $...$            inline math (KaTeX in-app; passes through to TeX)
 *   **...**          strong
 *   *...*            emphasis
 *   {g:...}          a knob symbol at first mention (em.g in-app; italic in print)
 *   {blue:...}       ink for the app's blue −∇ℒ arrow (.ink-blue; plain bold in print)
 *   {red:...}        ink for the app's red Δθ arrow (.ink-red; plain bold in print)
 *   {dark:...}       rendered only in dark mode
 *   {light:...}      rendered only in day mode — and always in print
 *
 * Everything else is literal text (HTML-escaped on render). Spans nest —
 * a theme span may contain bold and math — but math is atomic: delimiter
 * searches skip over $...$ so TeX braces and asterisks never confuse the
 * parser. An unterminated delimiter falls back to literal text rather than
 * swallowing the rest of the paragraph.
 */

import katex from 'katex';

export type RichToken =
  | { t: 'text'; s: string }
  | { t: 'math'; tex: string }
  | { t: 'strong'; children: RichToken[] }
  | { t: 'em'; children: RichToken[] }
  | { t: 'g'; children: RichToken[] }
  | { t: 'ink'; color: 'blue' | 'red'; children: RichToken[] }
  | { t: 'theme'; mode: 'dark' | 'light'; children: RichToken[] };

/** Find `close` at or after `from`, skipping over $...$ math spans. */
function findOutsideMath(src: string, close: string, from: number): number {
  let i = from;
  while (i < src.length) {
    if (src[i] === '$') {
      const end = src.indexOf('$', i + 1);
      if (end < 0) return -1; // unterminated math — let the caller fall back
      i = end + 1;
      continue;
    }
    if (src.startsWith(close, i)) return i;
    i++;
  }
  return -1;
}

/** Find the `}` matching an already-consumed `{`, skipping math, counting nesting. */
function findClosingBrace(src: string, from: number): number {
  let depth = 1;
  let i = from;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '$') {
      const end = src.indexOf('$', i + 1);
      if (end < 0) return -1;
      i = end + 1;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

const SPAN_OPENERS: { prefix: string; make: (children: RichToken[]) => RichToken }[] = [
  { prefix: '{g:', make: children => ({ t: 'g', children }) },
  { prefix: '{blue:', make: children => ({ t: 'ink', color: 'blue', children }) },
  { prefix: '{red:', make: children => ({ t: 'ink', color: 'red', children }) },
  { prefix: '{dark:', make: children => ({ t: 'theme', mode: 'dark', children }) },
  { prefix: '{light:', make: children => ({ t: 'theme', mode: 'light', children }) }
];

export function parseRich(src: string): RichToken[] {
  const out: RichToken[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'text', s: buf });
    buf = '';
  };

  let i = 0;
  outer: while (i < src.length) {
    const ch = src[i];

    if (ch === '$') {
      const end = src.indexOf('$', i + 1);
      if (end > i) {
        flush();
        out.push({ t: 'math', tex: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (src.startsWith('**', i)) {
      const end = findOutsideMath(src, '**', i + 2);
      if (end > i) {
        flush();
        out.push({ t: 'strong', children: parseRich(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (ch === '*') {
      const end = findOutsideMath(src, '*', i + 1);
      if (end > i) {
        flush();
        out.push({ t: 'em', children: parseRich(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    for (const { prefix, make } of SPAN_OPENERS) {
      if (src.startsWith(prefix, i)) {
        const end = findClosingBrace(src, i + prefix.length);
        if (end > 0) {
          flush();
          out.push(make(parseRich(src.slice(i + prefix.length, end))));
          i = end + 1;
          continue outer;
        }
      }
    }

    buf += ch;
    i++;
  }
  flush();
  return out;
}

const escHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function tokensToHtml(tokens: RichToken[], dark: boolean): string {
  let html = '';
  for (const tk of tokens) {
    switch (tk.t) {
      case 'text':
        html += escHtml(tk.s);
        break;
      case 'math':
        html += katex.renderToString(tk.tex, { throwOnError: false, displayMode: false });
        break;
      case 'strong':
        html += `<strong>${tokensToHtml(tk.children, dark)}</strong>`;
        break;
      case 'em':
        html += `<em>${tokensToHtml(tk.children, dark)}</em>`;
        break;
      case 'g':
        html += `<em class="g">${tokensToHtml(tk.children, dark)}</em>`;
        break;
      case 'ink':
        html += `<span class="ink-${tk.color}">${tokensToHtml(tk.children, dark)}</span>`;
        break;
      case 'theme':
        if ((tk.mode === 'dark') === dark) html += tokensToHtml(tk.children, dark);
        break;
    }
  }
  return html;
}

// Parsing is pure and content strings are static, so memoize the token AST;
// only the (cheap) serialization re-runs when the theme flips.
const parseCache = new Map<string, RichToken[]>();

/** Render a Rich string to HTML for the given theme. */
export function richToHtml(src: string, dark: boolean): string {
  let tokens = parseCache.get(src);
  if (!tokens) {
    tokens = parseRich(src);
    parseCache.set(src, tokens);
  }
  return tokensToHtml(tokens, dark);
}
