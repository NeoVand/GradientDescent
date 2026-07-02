/**
 * The optimizers' own source code, as strings — for the guide's
 * reveal-the-code feature. import.meta.glob with ?raw inlines each file's
 * text at build time, so what the reader sees is byte-identical to what the
 * marker on the landscape executes: pasted snippets can't rot.
 */

const sources = import.meta.glob('./optimizers/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

/** The real source file for an optimizer id, or null if unknown. */
export function optimizerSource(id: string): string | null {
  return sources[`./optimizers/${id}.ts`] ?? null;
}

/** Line count of the real source — the "Adam is N lines" badge. */
export function optimizerSourceLines(id: string): number {
  const src = optimizerSource(id);
  return src ? src.trimEnd().split('\n').length : 0;
}
