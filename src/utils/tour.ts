/**
 * The driver.js product tour — a guided walk through the sidebar, run deck,
 * and plots, launched from the compass button (or auto-popped once on a first
 * visit). Lazy-loaded so driver.js and its CSS stay out of the first paint;
 * App.svelte imports this only when the tour actually runs.
 */

import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { get } from 'svelte/store';
import { currentProblemConfig, themeStore, tourActiveStore } from '../stores/stores';

const SEEN_KEY = 'gl-tour-seen';

export function hasSeenTour(): boolean {
  try {
    return !!localStorage.getItem(SEEN_KEY);
  } catch {
    return false;
  }
}

function markTourSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private mode / quota — fine, the tour just may re-pop */
  }
}

// lucide ships no GitHub mark (removed upstream), so inline the glyph.
const GH_SVG =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">' +
  '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>';

const WELCOME_HTML =
  '<div class="gl-tour-welcome">' +
  '<div class="gl-tour-brand"><span class="gl-tour-mark">∂</span><span class="gl-tour-name">Gradient Lab</span></div>' +
  '<p class="gl-tour-tag">An interactive playground for gradient descent — loss landscapes in 1D, 2D &amp; 3D, a dozen optimizers, races, and basins of attraction.</p>' +
  '<div class="gl-tour-meta">' +
  `<a class="gl-tour-gh" href="https://github.com/NeoVand/GradientDescent" target="_blank" rel="noopener noreferrer">${GH_SVG}<span>NeoVand/GradientDescent</span></a>` +
  '<span class="gl-tour-by">by Neo Mohsenvand</span>' +
  '</div></div>';

type RawStep = {
  sel: string | null;
  title?: string;
  body: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  nextBtnText?: string;
};

const RAW_STEPS: RawStep[] = [
  { sel: null, body: WELCOME_HTML, nextBtnText: 'Take the tour →' },
  { sel: 'problem-picker', title: 'Pick a problem', body: "Start here — choose what you're optimizing. Each problem is a different loss landscape, from a textbook bowl to a tiny neural network.", side: 'right', align: 'start' },
  { sel: 'data-section', title: 'Your dataset', body: 'The synthetic data the model fits. (Hidden for pure-math surfaces that carry no data.)', side: 'right', align: 'start' },
  { sel: 'data-points', title: 'How much data', body: 'Set how many points to generate; the dice rerolls a fresh sample.', side: 'right', align: 'start' },
  { sel: 'data-noise', title: 'How noisy', body: 'Add scatter to the data — 0 is clean, 2 is very noisy.', side: 'right', align: 'start' },
  { sel: 'data-split', title: 'Train vs. test', body: 'Split the data into a training set and a held-out test set. Watch the two losses part ways when the model overfits.', side: 'right', align: 'start' },
  { sel: 'optimizer-picker', title: 'The optimizer', body: 'Choose how the model walks downhill — Gradient Descent, Momentum, Adam, and a dozen more.', side: 'right', align: 'start' },
  { sel: 'optimizer-hypers', title: 'Its own knobs', body: "Each optimizer exposes its own dials (momentum β, Adam's β₁/β₂…). They appear here for whichever one is selected.", side: 'right', align: 'start' },
  { sel: 'learning-rate', title: 'The learning rate γ', body: 'The step size — the single most important dial. Too high and it diverges; too low and it crawls.', side: 'right', align: 'start' },
  { sel: 'lr-schedule', title: 'Schedule γ', body: 'Anneal the learning rate over the run: drop it in steps, glide it down a cosine, or warm it up first.', side: 'right', align: 'start' },
  { sel: 'batch-size', title: 'Batch size', body: 'How many points each step looks at. Small batches give noisy, stochastic descent — the S in SGD.', side: 'right', align: 'start' },
  { sel: 'run-section', title: 'The run deck', body: 'Set how many steps to take and how fast to animate them.', side: 'right', align: 'start' },
  { sel: 'run-step', title: 'One step', body: 'Take a single gradient step — perfect for watching one update at a time. (Shortcut: S)', side: 'right', align: 'center' },
  { sel: 'run-train', title: 'Train', body: 'Run or pause the whole descent. (Shortcut: Space)', side: 'right', align: 'center' },
  { sel: 'run-reset', title: 'Reset', body: 'Send the marker back to its start and clear the path. (Shortcut: R)', side: 'right', align: 'center' },
  { sel: 'run-race', title: 'Race optimizers', body: 'Send several optimizers downhill from the same point and see which reaches the basin first.', side: 'right', align: 'center' },
  { sel: 'run-race-settings', title: 'Race setup', body: "Pick the lineup and tune each optimizer's parameters here.", side: 'right', align: 'center' },
  { sel: 'plot-data', title: 'The data plot', body: 'Your data and the model’s current fit. Click to add points and reshape the problem live.', side: 'bottom', align: 'start' },
  { sel: 'plot-landscape', title: 'The loss landscape', body: 'The loss over the two parameters α and β — bright is low. The marker is your current spot; drag it anywhere.', side: 'left', align: 'start' },
  { sel: 'landscape-view-toggle', title: '2D or 3D', body: 'Flip the landscape between a flat heatmap and a 3-D surface. (Shortcut: D)', side: 'bottom', align: 'end' },
  { sel: 'landscape-tools', title: 'Overlays', body: 'Layer on the gradient field and contours, the curvature lens, basins of attraction, and a video export.', side: 'bottom', align: 'end' },
  { sel: 'plot-history', title: 'Loss over time', body: 'Training and test loss step by step, with the γ schedule — your convergence story.', side: 'top', align: 'start' },
  { sel: 'plot-guide', title: 'Live formulas', body: "The model, loss, and update rule, rendered for whatever you've set up.", side: 'top', align: 'end' },
  { sel: 'help-button', title: 'Go deeper', body: 'Open the full illustrated textbook and the guided course any time. Happy descending!', side: 'left', align: 'end' }
];

/** Is this anchor present AND on screen right now? */
function visible(sel: string): boolean {
  const el = document.querySelector(`[data-tour="${sel}"]`);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  // Reject anchors scrolled/transformed fully off the viewport (e.g. the
  // mobile sidebar drawer) — this naturally reduces the tour on small screens.
  return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}

function buildSteps() {
  return RAW_STEPS.filter((s) => s.sel === null || visible(s.sel)).map((s) => ({
    element: s.sel ? `[data-tour="${s.sel}"]` : undefined,
    popover: {
      title: s.title ?? '',
      description: s.body,
      side: s.side,
      align: s.align,
      ...(s.nextBtnText ? { nextBtnText: s.nextBtnText } : {})
    }
  }));
}

/** Build and run the tour. Safe to call from a click or an auto-pop. */
export function runTour() {
  markTourSeen();
  const steps = buildSteps();
  if (steps.length < 2) return; // nothing meaningful to show

  const light = get(themeStore) === 'light';
  tourActiveStore.set(true);

  const d = driver({
    showProgress: true,
    progressText: '{{current}} of {{total}}',
    overlayColor: light ? 'rgba(15, 23, 42, 0.45)' : 'rgba(2, 6, 12, 0.64)',
    overlayOpacity: 1,
    stagePadding: 6,
    stageRadius: 10,
    popoverClass: 'gl-tour',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    steps,
    onDestroyed: () => {
      tourActiveStore.set(false);
    }
  });

  d.drive();
}
