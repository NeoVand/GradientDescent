import { describe, it, expect } from 'vitest';
import { parseRich, richToHtml, richToTex, escapeTex } from './rich';

describe('parseRich', () => {
  it('parses plain text as one token', () => {
    expect(parseRich('hello world')).toEqual([{ t: 'text', s: 'hello world' }]);
  });

  it('parses inline math', () => {
    expect(parseRich('the knob $\\alpha$ turns')).toEqual([
      { t: 'text', s: 'the knob ' },
      { t: 'math', tex: '\\alpha' },
      { t: 'text', s: ' turns' }
    ]);
  });

  it('parses strong before em and nests them', () => {
    expect(parseRich('**bold *both* bold**')).toEqual([
      {
        t: 'strong',
        children: [
          { t: 'text', s: 'bold ' },
          { t: 'em', children: [{ t: 'text', s: 'both' }] },
          { t: 'text', s: ' bold' }
        ]
      }
    ]);
  });

  it('keeps math atomic inside spans (braces and asterisks in TeX)', () => {
    expect(parseRich('*the hat on $\\hat{y}$ marks*')).toEqual([
      {
        t: 'em',
        children: [
          { t: 'text', s: 'the hat on ' },
          { t: 'math', tex: '\\hat{y}' },
          { t: 'text', s: ' marks' }
        ]
      }
    ]);
  });

  it('parses knob spans', () => {
    expect(parseRich('{g:$\\alpha$}')).toEqual([
      { t: 'g', children: [{ t: 'math', tex: '\\alpha' }] }
    ]);
  });

  it('parses theme spans with nested rich content', () => {
    expect(parseRich('{dark:**Brighter** is lower}{light:**Deeper** is lower}')).toEqual([
      {
        t: 'theme',
        mode: 'dark',
        children: [{ t: 'strong', children: [{ t: 'text', s: 'Brighter' }] }, { t: 'text', s: ' is lower' }]
      },
      {
        t: 'theme',
        mode: 'light',
        children: [{ t: 'strong', children: [{ t: 'text', s: 'Deeper' }] }, { t: 'text', s: ' is lower' }]
      }
    ]);
  });

  it('treats stray braces and unterminated delimiters as literal text', () => {
    expect(parseRich('a {plain} brace')).toEqual([{ t: 'text', s: 'a {plain} brace' }]);
    expect(parseRich('a lone * star')).toEqual([{ t: 'text', s: 'a lone * star' }]);
    expect(parseRich('cash $ sign')).toEqual([{ t: 'text', s: 'cash $ sign' }]);
  });
});

describe('richToHtml', () => {
  it('escapes HTML in text and renders math via KaTeX', () => {
    const html = richToHtml('Loss & Gradient $\\gamma$', true);
    expect(html).toContain('Loss &amp; Gradient');
    expect(html).toContain('katex');
    expect(html).not.toContain('$');
  });

  it('renders strong, em and knob spans', () => {
    const html = richToHtml('**b** *i* {g:$\\beta$}', true);
    expect(html).toContain('<strong>b</strong>');
    expect(html).toContain('<em>i</em>');
    expect(html).toContain('<em class="g">');
  });

  it('renders ink spans for the app arrows', () => {
    expect(richToHtml('the {blue:blue arrow} and its {red:red partner}', true)).toBe(
      'the <span class="ink-blue">blue arrow</span> and its <span class="ink-red">red partner</span>'
    );
  });

  it('picks the matching theme span only', () => {
    const src = 'the {dark:bright}{light:deep-coloured} dimple';
    expect(richToHtml(src, true)).toBe('the bright dimple');
    expect(richToHtml(src, false)).toBe('the deep-coloured dimple');
  });
});

describe('richToTex', () => {
  it('passes math through and marks up prose', () => {
    expect(richToTex('the knob $\\gamma$ is **big** and *fast*')).toBe(
      'the knob \\(\\gamma\\) is \\textbf{big} and \\emph{fast}'
    );
  });

  it('takes the light branch of theme spans', () => {
    expect(richToTex('{dark:bright}{light:deep-coloured} dimple')).toBe('deep-coloured dimple');
  });

  it('escapes TeX specials exactly once', () => {
    expect(escapeTex('50% of A & B _under_ #1')).toBe('50\\% of A \\& B \\_under\\_ \\#1');
    expect(escapeTex('a {plain} brace')).toBe('a \\{plain\\} brace');
  });

  it('maps the prose Unicode symbols to commands', () => {
    expect(escapeTex('✓ done, κ = 10, ∇ℒ fades')).toBe(
      '\\checkmark{} done, \\(\\kappa\\) = 10, \\(\\nabla\\)\\(\\mathcal{L}\\) fades'
    );
  });

  it('renders knob and ink spans in the print register', () => {
    expect(richToTex('{g:$\\gamma$} and the {blue:blue arrow}')).toBe(
      '\\emph{\\(\\gamma\\)} and the \\textbf{blue arrow}'
    );
  });
});
