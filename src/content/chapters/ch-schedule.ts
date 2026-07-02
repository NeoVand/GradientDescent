import type { Block } from '../blocks';

/** Chapter 9 · Scheduling the learning rate — four shapes for one dial. */
export const chSchedule: Block[] = [
  {
    kind: 'p',
    text: 'The learning rate just handed us a single, unavoidable compromise: a **large** $\\gamma$ covers ground fast but overshoots the floor; a **small** $\\gamma$ lands precisely but crawls to get there. You don’t actually have to choose. Stop treating $\\gamma$ as one frozen number and **schedule** it — large early to cover ground, small late to settle cleanly — and you get both halves of the bargain. The **Schedule** control beneath the learning rate does exactly that: it multiplies your base $\\gamma$ by a factor that changes on every step of the run.'
  },
  {
    kind: 'p',
    text: 'The four schedules trace four different shapes for that factor over a run — flat, then three ways of bleeding $\\gamma$ away as the steps tick by:'
  },
  { kind: 'widget', id: 'schedule-grid' },
  {
    kind: 'p',
    text: '**Constant** holds $\\gamma$ start to finish — the honest baseline, and always the compromise above. **Step decay** keeps $\\gamma$ flat, then cuts it by a fixed factor at set milestones (here ×0.3 a third of the way in, and again at two-thirds). It leaves the loss curve’s most recognizable fingerprint: a long plateau, then a sudden *cliff* the instant $\\gamma$ drops and the smaller step resolves detail the larger one skated over. For most of deep learning’s history, that staircase trained nearly every network.'
  },
  {
    kind: 'p',
    text: '**Cosine** does the same work without the jolts — $\\gamma$ eases down the first half of a cosine from full strength to a small floor (about 5%): gentle at first, fastest through the middle, feather-light by the end. Lingering near full strength early is the point — the run banks its fast progress before precision matters. With no brutal transition it then simply settles, which is why cosine annealing is the modern default. **Warmup + cosine** bolts a short on-ramp onto the front: $\\gamma$ starts near zero and climbs over the first tenth before the cosine takes over. That protects the opening, where a run *begins* at a random, often dreadful point and one full-size step could fling the marker off the map — so it is now standard for training large models from scratch.'
  },
  {
    kind: 'p',
    text: 'One practical wrinkle: each shape stretches to fit the run, and at 1× the decay only finishes on the run’s very last step — so you never get to watch the *settled* tail. The **Decay speed** slider — it appears whenever a non-constant schedule is active on a finite run (in ∞ mode there is no horizon, so schedules switch off) — compresses the whole schedule into a fraction of the run, so at *4×* it finishes annealing a quarter of the way in and the rest of the run shows you the landing. Turn it up and read the result off the dotted $\\gamma(t)$ line in the loss chart.'
  },
  {
    kind: 'p',
    text: 'Scheduling has a second, deeper payoff that only lands once gradients turn *noisy* — the subject of the next part. A $\\gamma$ bled toward zero is the one thing that pulls a restless run in to a clean stop. And one optimizer you’ll meet there, **Lion**, takes a fixed-size step and so cannot settle *at all* on a constant $\\gamma$: it just orbits the minimum forever. It is the purest illustration of why schedules exist — switch it to cosine and the orbit closes to a point.'
  }
];
