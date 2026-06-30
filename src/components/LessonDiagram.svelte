<script lang="ts">
  /**
   * A small, honest schematic for each lesson's setup — the "still frame"
   * the learner studies before predicting. It mirrors the concept on the
   * live landscape (a parabola, a double well, a plateau, a saddle…) rather
   * than the exact pixels, so it stays legible at thumbnail size. Strokes
   * use currentColor so the figure inherits the card's theme.
   */
  export let id: string;

  const captions: Record<string, string> = {
    downhill: 'A 1-D parabola',
    'step-size': 'A step too big',
    trap: 'A double well',
    'dead-gradient': 'A flat plateau',
    'momentum-race': 'A stretched valley',
    'sgd-noise': 'Noisy mini-batch steps',
    'narrow-valley': "Rosenbrock's banana",
    adam: 'The same plateau',
    saddle: 'A saddle point',
    'tiny-net': 'Twin mirror minima'
  };
  $: caption = captions[id] ?? '';
</script>

<figure class="lesson-fig">
  <svg viewBox="0 0 240 170" role="img" aria-label={caption}>
    <defs>
      <marker id="ld-a-green" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5.4" markerHeight="5.4" orient="auto-start-reverse">
        <path d="M0,1 L9,5 L0,9 z" fill="#10b981" />
      </marker>
      <marker id="ld-a-red" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5.4" markerHeight="5.4" orient="auto-start-reverse">
        <path d="M0,1 L9,5 L0,9 z" fill="#ef4444" />
      </marker>
    </defs>

    {#if id === 'downhill'}
      <path class="surf" d="M30,28 Q120,178 210,28" />
      <path class="ghost" stroke-dasharray="4,3" d="M134,107 L188,63" />
      <path class="acc-green" marker-end="url(#ld-a-green)" d="M162,82 L131,96" />
      <circle class="mk" cx="165" cy="81" r="5.5" />
    {:else if id === 'step-size'}
      <path class="surf" d="M30,28 Q120,178 210,28" />
      <path class="acc-red" marker-end="url(#ld-a-red)" d="M165,81 L84,57 L196,33" />
      <circle class="mk" cx="165" cy="81" r="5.5" />
    {:else if id === 'trap'}
      <path class="surf" d="M22,34 C44,150 92,150 120,78 C140,30 150,30 168,74 C188,128 206,120 218,96" />
      <path class="acc-green" marker-end="url(#ld-a-green)" d="M199,92 L189,112" />
      <circle class="mk" cx="201" cy="88" r="5.5" />
    {:else if id === 'dead-gradient'}
      <path class="surf" d="M20,138 C72,138 96,40 120,40 C144,40 168,138 220,138" />
      <path class="acc-green" marker-end="url(#ld-a-green)" d="M200,134 L190,133" />
      <circle class="mk" cx="202" cy="135" r="5.5" />
      <text class="lbl" x="150" y="120">∇ℒ ≈ 0</text>
    {:else if id === 'adam'}
      <path class="surf" d="M20,138 C72,138 96,40 120,40 C144,40 168,138 220,138" />
      <path class="acc-green" marker-end="url(#ld-a-green)" d="M200,134 L150,127" />
      <circle class="mk" cx="202" cy="135" r="5.5" />
      <text class="lbl" x="116" y="156">adaptive step</text>
    {:else if id === 'momentum-race'}
      <g transform="rotate(-18 120 86)">
        <ellipse class="contour" cx="120" cy="86" rx="94" ry="26" />
        <ellipse class="contour" cx="120" cy="86" rx="64" ry="16" />
        <ellipse class="contour" cx="120" cy="86" rx="34" ry="8" />
      </g>
      <circle cx="46" cy="120" r="4.4" fill="#94a3b8" />
      <circle cx="55" cy="115" r="4.4" fill="#a855f7" />
      <circle cx="50" cy="129" r="4.4" fill="#14b8a6" />
      <circle cx="59" cy="124" r="4.4" fill="#10b981" />
    {:else if id === 'sgd-noise'}
      <ellipse class="contour" cx="128" cy="94" rx="92" ry="62" />
      <ellipse class="contour" cx="128" cy="94" rx="60" ry="40" />
      <ellipse class="contour" cx="128" cy="94" rx="28" ry="18" />
      <g stroke="#3b82f6" stroke-opacity="0.5" stroke-width="1.2" stroke-linecap="round">
        <path d="M46,40 L70,60" /><path d="M46,40 L60,68" /><path d="M46,40 L74,52" />
      </g>
      <path class="acc-green" fill="none" d="M46,40 L72,72 L62,88 L94,94 L90,110 L118,98 L128,94" />
      <circle class="mk" cx="46" cy="40" r="5" />
      <circle cx="128" cy="94" r="3" fill="#10b981" />
    {:else if id === 'narrow-valley'}
      <path class="contour" d="M40,132 Q120,8 206,68" />
      <path class="contour" d="M53,129 Q120,30 196,75" />
      <path class="contour" d="M67,124 Q120,52 183,82" />
      <path class="acc-green" marker-end="url(#ld-a-green)" d="M71,118 L98,97" />
      <circle class="mk" cx="66" cy="121" r="5" />
    {:else if id === 'saddle'}
      <path class="ghost" d="M52,42 L188,138" />
      <path class="ghost" d="M188,42 L52,138" />
      <path class="contour" d="M72,46 Q120,88 168,46" />
      <path class="contour" d="M72,134 Q120,92 168,134" />
      <path class="contour" d="M54,60 Q92,90 54,120" />
      <path class="contour" d="M186,60 Q148,90 186,120" />
      <path class="acc-green" marker-end="url(#ld-a-green)" d="M138,90 L150,120" />
      <circle class="mk" cx="138" cy="90" r="5" />
    {:else if id === 'tiny-net'}
      <path class="surf" d="M24,38 Q70,152 116,38" />
      <path class="surf" d="M124,38 Q170,152 216,38" />
      <circle cx="70" cy="118" r="3" fill="#10b981" />
      <circle cx="170" cy="118" r="3" fill="#10b981" />
      <text class="lbl" x="60" y="140">−</text>
      <text class="lbl" x="166" y="140">+</text>
      <path class="acc-green" marker-end="url(#ld-a-green)" d="M52,86 L67,110" />
      <circle class="mk" cx="48" cy="80" r="5" />
    {/if}
  </svg>
  {#if caption}<figcaption>{caption}</figcaption>{/if}
</figure>

<style>
  .lesson-fig {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }

  .lesson-fig svg {
    width: 100%;
    height: auto;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: rgba(148, 163, 184, 0.06);
    padding: 4px;
    box-sizing: border-box;
  }

  figcaption {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    opacity: 0.6;
    text-align: center;
  }

  .surf {
    fill: none;
    stroke: currentColor;
    stroke-opacity: 0.45;
    stroke-width: 2.4;
    stroke-linecap: round;
  }

  .contour {
    fill: none;
    stroke: currentColor;
    stroke-opacity: 0.32;
    stroke-width: 1.6;
  }

  .ghost {
    fill: none;
    stroke: currentColor;
    stroke-opacity: 0.25;
    stroke-width: 1.3;
  }

  .acc-green {
    fill: none;
    stroke: #10b981;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .acc-red {
    fill: none;
    stroke: #ef4444;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .mk {
    fill: #f59e0b;
    stroke: #fff;
    stroke-width: 1.6;
  }

  .lbl {
    fill: currentColor;
    fill-opacity: 0.6;
    font-size: 11px;
    font-family: 'SF Mono', Monaco, monospace;
  }
</style>
