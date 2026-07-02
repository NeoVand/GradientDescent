/**
 * The LaTeX emitter — walks the same content the app renders and prints the
 * book. Run with `npm run book:tex` (vite-node resolves the src imports);
 * `npm run book` also compiles the PDF with tectonic.
 *
 * This is the skeleton pass of the pipeline (docs/plan/06 §4): every block
 * kind maps to a print environment, the optimizer cards / bestiary /
 * experiment set come from their content modules, honesty notes take the
 * margin, and every chapter closes with its live link. Figures emit labelled
 * placeholders until the compute/render split lands; interactive widgets
 * point at the app.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { guideParts } from '../src/content/registry';
import { chapterBlocks } from '../src/content/chapters';
import type { Block, Rich } from '../src/content/blocks';
import { formulas } from '../src/content/formulas';
import { chRefs } from '../src/content/chapterRefs';
import { optTree, OPT_CITE } from '../src/content/optimizerCards';
import { problemCards } from '../src/content/problemCards';
import { richToTex, escapeTex } from '../src/content/rich';

const SITE = 'https://gradientlab.ai';

// ---------- small helpers ----------

/** Card prose mixes light HTML with $math$; fold the tags into micro-syntax first. */
const htmlishToTex = (s: string): string =>
  richToTex(
    s
      .replace(/<\/?em>/g, '*')
      .replace(/<\/?strong>/g, '**')
  );

const P = (text: Rich) => richToTex(text) + '\n';

// ---------- block emission ----------

function emitBlocks(blocks: Block[], slug: string): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.kind) {
      case 'p':
        out.push(P(b.text));
        break;
      case 'aside':
        out.push(`\\begin{quotation}\\small ${richToTex(b.text)}\\end{quotation}`);
        break;
      case 'look':
        // The app-pointing register: italic, flagged as live.
        out.push(`\\begin{quotation}\\small\\itshape ${richToTex(b.text)}\\end{quotation}`);
        break;
      case 'display':
        out.push(`\\begin{equation}\\label{eq:${b.formula}}\n${formulas[b.formula]}\n\\end{equation}`);
        break;
      case 'recipe':
        out.push(`\\begin{kaobox}\n${richToTex(b.text)}\n\\end{kaobox}`);
        break;
      case 'list':
        out.push(
          '\\begin{itemize}\n' +
            b.items.map(i => `  \\item ${richToTex(i)}`).join('\n') +
            '\n\\end{itemize}'
        );
        break;
      case 'concept':
        out.push(`\\begin{kaobox}[title={${richToTex(b.title)}}]\n${richToTex(b.text)}\n\\end{kaobox}`);
        break;
      case 'conceptOverlay':
        out.push(
          `\\begin{kaobox}[title={${richToTex(b.title)}}]\n` +
            b.paras.map(t => richToTex(t)).join('\n\n') +
            `\n\n\\figplaceholder{${b.fig}}\n\\end{kaobox}`
        );
        break;
      case 'proof': {
        const inner = b.blocks
          .map((pb, i) => {
            if (pb.kind === 'p') {
              const isLast = !b.blocks.slice(i + 1).some(x => x.kind === 'p');
              return richToTex(pb.text) + (isLast ? ' \\hfill\\rule{0.9ex}{0.9ex}' : '');
            }
            if (pb.kind === 'display')
              return `\\begin{equation}\\label{eq:${pb.formula}}\n${formulas[pb.formula]}\n\\end{equation}`;
            if (pb.kind === 'figure') return emitFigure(pb.id, pb.caption, { inBox: true });
            return '';
          })
          .join('\n\n');
        out.push(`\\begin{kaobox}[title={${richToTex(b.title)}}]\n${inner}\n\\end{kaobox}`);
        break;
      }
      case 'hd':
        out.push(`\\marginnote{\\footnotesize \\(\\infty\\)\\,\\textsc{in a billion dimensions} — ${richToTex(b.text)}}`);
        break;
      case 'figure':
        out.push(emitFigure(b.id, b.caption));
        break;
      case 'widget':
        out.push(emitWidget(b.id, slug));
        break;
      case 'optcards':
        out.push(emitCards(b.chapter));
        break;
      case 'frontier':
        out.push(
          `\\begin{kaobox}[title={${richToTex(b.title)}}]\n${richToTex(b.text)}\n\\end{kaobox}`
        );
        break;
    }
  }
  return out.join('\n\n');
}

function emitFigure(id: string, caption: Rich, opts?: { inBox?: boolean }): string {
  if (opts?.inBox) {
    // Floats can't live inside a box; memoir's \legend gives the caption.
    return [
      '\\begin{center}',
      `\\figplaceholder{${id}}`,
      `\\legend{${richToTex(caption)}}`,
      '\\end{center}'
    ].join('\n');
  }
  return [
    '\\begin{figure}[htbp]',
    '\\centering',
    `\\figplaceholder{${id}}`,
    `\\caption{${richToTex(caption)}}`,
    `\\label{fig:${id}}`,
    '\\end{figure}'
  ].join('\n');
}

function emitWidget(id: string, slug: string): string {
  if (id === 'problem-grid') return emitBestiary();
  if (id === 'experiments-list') return emitExperimentNote();
  if (id === 'keyboard') return '% keyboard map — app-only, dropped from print';
  // Interactive islands point home until their print fallbacks land.
  return [
    '\\begin{figure}[htbp]',
    '\\centering',
    `\\figplaceholder{${id} (interactive)}`,
    `\\caption{Interactive in the app: \\url{${SITE}/\\#ch=${slug}}}`,
    `\\label{fig:${id}}`,
    '\\end{figure}'
  ].join('\n');
}

// ---------- the optimizer story cards ----------

function emitCards(chapter: string): string {
  const out: string[] = [];
  for (const c of optTree.filter(o => o.chapter === chapter)) {
    if (c.act) {
      out.push(`\\subsection*{${escapeTex(c.act.no)} — ${escapeTex(c.act.title)}}`);
      if (c.act.intro) out.push(htmlishToTex(c.act.intro));
    }
    if (c.lead) out.push(htmlishToTex(c.lead));
    out.push(`\\subsection{${escapeTex(c.name)}}`);
    out.push(`\\noindent\\textsc{${escapeTex(c.year)}} · \\emph{${escapeTex(c.by)}}\\smallskip`);
    out.push(htmlishToTex(c.idea));
    out.push(`\\[ ${c.formula} \\]`);
    const foot: string[] = [];
    if (c.fix) foot.push(`\\checkmark{}\\; ${richToTex(c.fix)}`);
    if (c.brk) foot.push(`\\(\\times\\)\\; ${richToTex(c.brk)}`);
    if (foot.length) out.push(`{\\small ${foot.join(' \\quad ')}\\par}`);
    if (c.hd)
      out.push(`\\marginnote{\\footnotesize \\(\\infty\\)\\,\\textsc{in a billion dimensions} — ${htmlishToTex(c.hd)}}`);
    const cite = OPT_CITE[c.name];
    if (cite?.paper || cite?.wiki) {
      const links: string[] = [];
      if (cite.paper) links.push(`\\url{${cite.paper}}`);
      else if (cite.wiki) links.push(`\\url{${cite.wiki}}`);
      out.push(`{\\footnotesize ${cite.cite ? escapeTex(cite.cite) + ' — ' : ''}${links.join(', ')}\\par}`);
    }
  }
  return out.join('\n\n');
}

// ---------- the bestiary + experiments ----------

function emitBestiary(): string {
  const out: string[] = [];
  for (const [group, list] of Object.entries(problemCards)) {
    out.push(`\\subsection*{${escapeTex(group)}}`);
    out.push('\\begin{itemize}');
    for (const p of list) {
      out.push(
        `  \\item \\textbf{${escapeTex(p.name)}} — \\(\\;\\)${escapeTex(p.formula)} \\;—\\; \\emph{${escapeTex(p.tag)}}`
      );
    }
    out.push('\\end{itemize}');
  }
  return out.join('\n');
}

function emitExperimentNote(): string {
  // The experiment cards are one-click app scenarios; in print they become
  // the exercise seed (plan §5). Until the exercise pass, point at the app.
  return `Every experiment is one click in the app: \\url{${SITE}/\\#ch=ch-experiments}`;
}

// ---------- chapters, parts, book ----------

function emitChapter(slug: string, title: string): string {
  const blocks = chapterBlocks[slug];
  if (!blocks) return '';
  const out: string[] = [];
  // \( \) is fragile in moving arguments (toc, headers); $ is robust there —
  // and hyperref needs a plain-text stand-in for its PDF bookmarks.
  const titleTex = richToTex(title)
    .replace(/\\[()]/g, '$')
    .replace(/\$([^$]+)\$/g, (_, tex) => `\\texorpdfstring{$${tex}$}{${tex.replace(/\\/g, '')}}`);
  out.push(`\\chapter{${titleTex}}\\label{ch:${slug}}`);
  out.push(emitBlocks(blocks, slug));
  // every chapter ends at the app — its live deep link
  out.push(`\\begin{kaobox}[title={Try it live}]\n\\url{${SITE}/\\#ch=${slug}}\n\\end{kaobox}`);
  const refs = chRefs[slug];
  if (refs?.length) {
    out.push('\\subsection*{Further reading}');
    out.push(
      '\\begin{itemize}\n' +
        refs.map(r => `  \\item ${escapeTex(r.label)} — \\url{${r.href}}`).join('\n') +
        '\n\\end{itemize}'
    );
  }
  return out.join('\n\n');
}

const PREAMBLE = String.raw`% Generated by scripts/emit-latex.ts — do not edit by hand.
\documentclass[a4paper,11pt,twoside]{memoir}
\usepackage{amsmath}
\usepackage{unicode-math}
\usepackage{marginnote}
\usepackage[most]{tcolorbox}
\usepackage{hyperref}
\hypersetup{colorlinks=true, linkcolor=black, urlcolor=teal}
\urlstyle{same}

% the reading layout: generous outer margin for the honesty channel
\setlrmarginsandblock{22mm}{58mm}{*}
\setulmarginsandblock{24mm}{28mm}{*}
\setmarginnotes{4mm}{46mm}{2mm}
\checkandfixthelayout

% one quiet box style for concept/recipe/proof/frontier
\newtcolorbox{kaobox}[1][]{colback=black!4, colframe=black!25, boxrule=0.4pt,
  arc=2mm, left=3mm, right=3mm, top=2mm, bottom=2mm, fonttitle=\bfseries, #1}

% figure placeholders until the compute/render split lands
\newcommand{\figplaceholder}[1]{\fbox{\parbox[c][4cm][c]{0.85\linewidth}{\centering\ttfamily [figure: #1]}}}

\title{Gradient Lab}
\author{Neo Mohsenvand}
\date{\today}

\begin{document}
\frontmatter
\maketitle
\begin{center}\itshape
Two knobs, a landscape of error, and the search for its lowest point.\\
Drag the marker, press Train, watch the loss fall — then learn why it does.
\end{center}
\cleardoublepage
\tableofcontents*
\mainmatter
`;

function emitBook(): string {
  const out: string[] = [PREAMBLE];
  for (const part of guideParts) {
    const isReference = part.title === 'Reference';
    if (isReference) {
      out.push('\\appendix');
      // the keyboard map is app-only; the panels reference earns an appendix
      for (const ch of part.chapters) {
        if (ch.slug === 'ch-keys') continue;
        out.push(emitChapter(ch.slug, ch.title));
      }
      continue;
    }
    // "Part I · The landscape" → \part{The landscape} (numbering is derived)
    const title = part.title.replace(/^Part [IVX]+ · /, '');
    out.push(`\\part{${escapeTex(title)}}`);
    for (const ch of part.chapters) out.push(emitChapter(ch.slug, ch.title));
  }
  out.push('\\end{document}\n');
  return out.join('\n\n');
}

// ---------- write ----------

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'book');
mkdirSync(outDir, { recursive: true });
const tex = emitBook();
writeFileSync(join(outDir, 'gradient-lab.tex'), tex);
console.log(`book/gradient-lab.tex — ${tex.length.toLocaleString()} chars, ${Object.keys(chapterBlocks).length} chapters`);
