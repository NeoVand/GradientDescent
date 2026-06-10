/**
 * Learning-rate schedules.
 *
 * Real training rarely uses a constant γ: step decay, cosine annealing,
 * and warmup are everyday practice. Each schedule is a pure multiplier
 * factor(t, T) ∈ (0, 1] applied to the user's base γ, where t is the step
 * within the current run and T the run's step budget.
 */

import type { ScheduleId } from '../types/types';

export interface Schedule {
  id: ScheduleId;
  name: string;
  description: string;
  factor: (t: number, T: number) => number;
}

// Cosine schedules anneal to a floor, not to zero — γ = 0 would freeze the
// run, which reads as a bug rather than a lesson.
const COS_FLOOR = 0.05;

export const schedules: Record<ScheduleId, Schedule> = {
  constant: {
    id: 'constant',
    name: 'Constant',
    description: 'γ stays fixed for the whole run',
    factor: () => 1
  },
  step: {
    id: 'step',
    name: 'Step decay',
    description: 'γ drops ×0.3 at ⅓ and ⅔ of the run',
    factor: (t, T) => {
      if (T <= 0) return 1;
      const k = Math.min(2, Math.floor((3 * Math.max(0, t)) / T));
      return Math.pow(0.3, k);
    }
  },
  cosine: {
    id: 'cosine',
    name: 'Cosine',
    description: 'γ glides smoothly from full to 5% over the run',
    factor: (t, T) => {
      if (T <= 0) return 1;
      const x = Math.min(1, Math.max(0, t / T));
      return COS_FLOOR + (1 - COS_FLOOR) * (1 + Math.cos(Math.PI * x)) / 2;
    }
  },
  'warmup-cosine': {
    id: 'warmup-cosine',
    name: 'Warmup + cosine',
    description: 'γ ramps up over the first 10%, then cosine-anneals',
    factor: (t, T) => {
      if (T <= 0) return 1;
      const W = Math.max(1, Math.round(T * 0.1));
      const tc = Math.min(T, Math.max(0, t));
      if (tc < W) return Math.max(0.02, tc / W);
      const x = (tc - W) / Math.max(1, T - W);
      return COS_FLOOR + (1 - COS_FLOOR) * (1 + Math.cos(Math.PI * x)) / 2;
    }
  }
};

export const scheduleOrder: ScheduleId[] = ['constant', 'step', 'cosine', 'warmup-cosine'];
