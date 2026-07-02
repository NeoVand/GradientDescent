import { describe, it, expect } from 'vitest';
import { chapterBlocks } from './index';
import { chapterBySlug } from '../registry';
import { formulas } from '../formulas';
import { parseRich } from '../rich';

const richFields = (b: Record<string, unknown>): string[] => [
  ...['text', 'caption'].flatMap(k => (typeof b[k] === 'string' ? [b[k] as string] : [])),
  ...(Array.isArray(b.items) ? (b.items as string[]) : []),
  ...(Array.isArray(b.paras) ? (b.paras as string[]) : []),
  // proof blocks nest one level
  ...(Array.isArray(b.blocks)
    ? (b.blocks as Record<string, unknown>[]).flatMap(inner => richFields(inner))
    : [])
];

describe('chapter blocks', () => {
  it('keys every migrated chapter by a real registry slug', () => {
    for (const slug of Object.keys(chapterBlocks)) {
      expect(chapterBySlug(slug), `unknown chapter slug ${slug}`).toBeDefined();
    }
  });

  it('references only named formulas', () => {
    for (const [slug, blocks] of Object.entries(chapterBlocks)) {
      for (const b of blocks) {
        if (b.kind === 'display') {
          expect(formulas[b.formula], `${slug}: unknown formula ${String(b.formula)}`).toBeDefined();
        }
      }
    }
  });

  it('parses every Rich string cleanly (no unterminated spans)', () => {
    for (const [slug, blocks] of Object.entries(chapterBlocks)) {
      for (const b of blocks) {
        for (const src of richFields(b as Record<string, unknown>)) {
          const tokens = parseRich(src);
          // An unterminated span would surface as literal '{dark:' / '**' text.
          const flat = JSON.stringify(tokens);
          expect(flat, `${slug}: unterminated span in "${src.slice(0, 50)}…"`).not.toMatch(
            /\{(dark|light|g):|\*\*/
          );
        }
      }
    }
  });
});
