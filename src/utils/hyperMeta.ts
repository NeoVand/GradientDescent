/**
 * Shared icon + colour for each hyperparameter, keyed by its descriptive label
 * (not the raw key, which mislabels e.g. Lion's β₂ or Sophia's ρ). Used by both
 * the sidebar and the Race-settings modal so the same idea always reads the
 * same way:
 *   • momentum / inertia  → gauge, violet
 *   • adaptive scale (RMS) → resize, teal
 *   • direction blend      → blend, blue (its own hue; Lion pairs it with
 *                            momentum decay, so they must not both read violet)
 *   • weight decay         → magnet (pull to origin), amber
 *   • step clip            → scissors, rose
 */
import { Gauge, Scaling, Blend, Magnet, Scissors, SlidersHorizontal } from 'lucide-svelte';

export interface HyperMeta {
  icon: any;
  color: string;
}

export const HYPER_META: Record<string, HyperMeta> = {
  Momentum: { icon: Gauge, color: '#a855f7' },
  'Momentum decay': { icon: Gauge, color: '#a855f7' },
  'Direction blend': { icon: Blend, color: '#60a5fa' },
  Decay: { icon: Scaling, color: '#14b8a6' },
  'Scale decay': { icon: Scaling, color: '#14b8a6' },
  'Weight decay': { icon: Magnet, color: '#f59e0b' },
  Clip: { icon: Scissors, color: '#fb7185' }
};

export const HYPER_FALLBACK: HyperMeta = { icon: SlidersHorizontal, color: '#10b981' };

export const hyperMeta = (label: string): HyperMeta => HYPER_META[label] ?? HYPER_FALLBACK;
