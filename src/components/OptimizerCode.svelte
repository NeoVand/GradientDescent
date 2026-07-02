<script lang="ts">
  /**
   * Reveal-the-code: the REAL running source of one optimizer, syntax-
   * highlighted. The string comes from src/optim/source.ts (?raw import of
   * the actual module), so it can never drift from what executes; shiki is
   * lazy-imported so the highlighter's grammar/wasm never touches the main
   * bundle. Falls back to an unhighlighted <pre> while loading or if the
   * highlighter fails — the content is the point, the colours are a bonus.
   */
  import { onMount } from 'svelte';
  import { themeStore } from '../stores/stores';
  import { optimizerSource } from '../optim/source';

  export let id: string;

  const source = optimizerSource(id) ?? '// source not found';
  let html: string | null = null;

  $: dark = $themeStore === 'dark';

  let mounted = false;
  onMount(() => {
    mounted = true;
  });

  $: if (mounted) highlight(dark);

  async function highlight(isDark: boolean) {
    try {
      const { codeToHtml } = await import('shiki');
      html = await codeToHtml(source, {
        lang: 'typescript',
        theme: isDark ? 'vitesse-dark' : 'vitesse-light'
      });
    } catch {
      html = null; // plain <pre> fallback below
    }
  }
</script>

<div class="opt-code">
  {#if html}
    {@html html}
  {:else}
    <pre class="opt-code-plain">{source}</pre>
  {/if}
</div>

<style>
  .opt-code {
    margin-top: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    overflow: auto;
    max-height: 420px;
    font-size: 0.72rem;
    line-height: 1.55;
  }
  .opt-code :global(pre) {
    margin: 0;
    padding: 0.8rem 1rem;
    background: transparent !important;
    white-space: pre;
  }
  .opt-code :global(code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .opt-code-plain {
    color: var(--color-text-secondary);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
</style>
