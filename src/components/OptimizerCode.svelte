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
  import { Copy, Check } from 'lucide-svelte';
  import { themeStore } from '../stores/stores';
  import { optimizerSource } from '../optim/source';

  export let id: string;

  const source = optimizerSource(id) ?? '// source not found';
  let html: string | null = null;
  let copied = false;
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  $: dark = $themeStore === 'dark';

  let mounted = false;
  onMount(() => {
    mounted = true;
    return () => clearTimeout(copyTimer);
  });

  $: if (mounted) highlight(dark);

  async function highlight(isDark: boolean) {
    try {
      const { codeToHtml } = await import('shiki');
      // Dark: vitesse-dark, blended into the card (transparent background).
      // Day: github-light — crisp, high-contrast tokens on its own clean
      // white panel, exactly how code reads best on a light page.
      html = await codeToHtml(source, {
        lang: 'typescript',
        theme: isDark ? 'vitesse-dark' : 'github-light'
      });
    } catch {
      html = null; // plain <pre> fallback below
    }
  }

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(source);
      ok = true;
    } catch {
      // Permission-less fallback: a transient textarea + execCommand.
      const ta = document.createElement('textarea');
      ta.value = source;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    if (ok) {
      copied = true;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = false), 1600);
    }
  }
</script>

<div class="opt-code" class:dark>
  <button class="copy-btn" class:copied on:click={copy} aria-label="Copy source">
    {#if copied}<Check size={13} strokeWidth={2.4} />{:else}<Copy size={13} strokeWidth={2} />{/if}
  </button>
  <div class="opt-code-scroll">
    {#if html}
      {@html html}
    {:else}
      <pre class="opt-code-plain">{source}</pre>
    {/if}
  </div>
</div>

<style>
  .opt-code {
    position: relative;
    margin-top: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    font-size: 0.72rem;
    line-height: 1.55;
  }
  .opt-code-scroll {
    overflow-y: auto;
    max-height: 420px;
    border-radius: 10px;
  }

  /* House scrollbar: invisible until the reader hovers, emerald thumb. */
  .opt-code-scroll::-webkit-scrollbar { width: 6px; }
  .opt-code-scroll::-webkit-scrollbar-track { background: transparent; }
  .opt-code-scroll::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 3px;
    transition: background 0.25s ease;
  }
  .opt-code:hover .opt-code-scroll::-webkit-scrollbar-thumb {
    background: rgba(16, 185, 129, 0.32);
  }
  .opt-code:hover .opt-code-scroll::-webkit-scrollbar-thumb:hover {
    background: rgba(16, 185, 129, 0.5);
  }

  /* Wrapped lines — no horizontal scrollbar, ever. The day theme keeps its
     own white panel (code reads best on white); dark blends into the card. */
  .opt-code :global(pre) {
    margin: 0;
    padding: 0.8rem 2.4rem 0.8rem 1rem;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .opt-code.dark :global(pre) {
    background: transparent !important;
  }
  .opt-code :global(code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    white-space: pre-wrap;
    word-break: break-word;
    /* Neutralize the app's inline-code chip style (grey background +
       padding) — inside a highlighted block it reads as a selection wash. */
    background: transparent;
    padding: 0;
    border-radius: 0;
    font-size: inherit;
  }
  .opt-code-plain {
    color: var(--color-text-secondary);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  /* Just the icon — no container. Theme colors come from the app's own
     text variables, so it reads correctly on both day and night. */
  .copy-btn {
    position: absolute;
    top: 9px;
    right: 10px;
    z-index: 1;
    display: inline-flex;
    padding: 2px;
    color: var(--color-text-tertiary);
    background: none;
    border: none;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s ease, color 0.15s ease;
  }
  .opt-code:hover .copy-btn,
  .copy-btn:focus-visible {
    opacity: 1;
  }
  .copy-btn:hover { color: var(--color-text-primary); }
  .copy-btn.copied {
    color: #10b981;
    opacity: 1;
  }
</style>
