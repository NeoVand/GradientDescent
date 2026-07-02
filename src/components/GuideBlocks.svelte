<script lang="ts">
  /**
   * Renders one migrated chapter's block array (src/content/chapters/) —
   * the same data the LaTeX emitter walks. Deliberately markup-only: every
   * class here must match what HelpModal's hand-written sections use, and
   * the shared typography lives in HelpModal's stylesheet, globalized under
   * .reading-column, so migrated and unmigrated chapters look identical.
   *
   * Figures stay app-rendered: a figure block names an id and owns the
   * caption; the chapter shell (HelpModal) supplies the visual through the
   * `figure` / `conceptFig` snippets so figure styles stay in its scope.
   * The chapter footer (lesson/demo CTA + further reading) derives from the
   * registry — blocks never repeat what is already data elsewhere.
   */
  import type { Snippet } from 'svelte';
  import katex from 'katex';
  import { BookOpen, FileText } from 'lucide-svelte';
  import type { Block } from '../content/blocks';
  import { richToHtml } from '../content/rich';
  import { formulas } from '../content/formulas';
  import { chapterLesson } from '../content/registry';
  import { chRefs } from '../content/chapterRefs';
  import { chapterPresets } from '../utils/experiments';
  import { themeStore } from '../stores/stores';
  import ChapterCta from './ChapterCta.svelte';

  let {
    slug,
    blocks,
    figure,
    conceptFig,
    onLesson,
    onPreset
  }: {
    slug: string;
    blocks: Block[];
    /** Renders a full <figure class="fig"> for an id, given the caption HTML. */
    figure?: Snippet<[string, string]>;
    /** Renders the small illustration inside a concept box. */
    conceptFig?: Snippet<[string]>;
    onLesson?: (slug: string) => void;
    onPreset?: (slug: string) => void;
  } = $props();

  const dark = $derived($themeStore === 'dark');
  const texD = (src: string) =>
    katex.renderToString(src, { throwOnError: false, displayMode: true });

  const lessonId = $derived(chapterLesson[slug] ?? null);
  const preset = $derived(chapterPresets[slug]);
</script>

{#each blocks as b}
  {#if b.kind === 'p'}
    <p>{@html richToHtml(b.text, dark)}</p>
  {:else if b.kind === 'aside'}
    <p class="aside">{@html richToHtml(b.text, dark)}</p>
  {:else if b.kind === 'look'}
    <p class="look">{@html richToHtml(b.text, dark)}</p>
  {:else if b.kind === 'display'}
    <div class="formula-display">{@html texD(formulas[b.formula])}</div>
  {:else if b.kind === 'concept'}
    <div class="concept">
      <div class="concept-text">
        <h4>{b.title}</h4>
        <p>{@html richToHtml(b.text, dark)}</p>
      </div>
      {#if b.fig && conceptFig}{@render conceptFig(b.fig)}{/if}
    </div>
  {:else if b.kind === 'hd'}
    <aside class="hd-note">
      <span class="hd-note-tag">In a billion dimensions</span>
      <p>{@html richToHtml(b.text, dark)}</p>
    </aside>
  {:else if b.kind === 'figure'}
    {#if figure}{@render figure(b.id, richToHtml(b.caption, dark))}{/if}
  {/if}
{/each}

{#if lessonId || preset}
  <ChapterCta
    {lessonId}
    onLesson={lessonId && onLesson ? () => onLesson(slug) : null}
    demo={preset && onPreset ? () => onPreset(slug) : null}
    demoLabel={preset?.title ?? 'Watch a quick demo'}
  />
{/if}
{#if chRefs[slug]}
  <div class="ch-refs">
    <span class="ch-refs-label">Further reading</span>
    {#each chRefs[slug] as r}
      <a class="opt-cite-link" href={r.href} target="_blank" rel="noopener noreferrer">
        {#if r.kind === 'paper'}<FileText size={11} strokeWidth={2.2} />{:else}<BookOpen size={11} strokeWidth={2.2} />{/if}
        {r.label}
      </a>
    {/each}
  </div>
{/if}
