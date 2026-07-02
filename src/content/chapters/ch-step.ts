import type { Block } from '../blocks';

/** Chapter 6 · One step of descent — the update rule, and the two arrows. */
export const chStep: Block[] = [
  {
    kind: 'p',
    text: 'Now we can actually walk. One step of **gradient descent** is almost insultingly simple:'
  },
  {
    kind: 'recipe',
    text: 'Stand at your current $(\\alpha, \\beta)$. Look downhill — that’s **$-\\nabla\\mathcal{L}$**. Take a step in that direction — {g:$\\gamma$} times as long as the slope is steep. Repeat.'
  },
  {
    kind: 'p',
    text: 'In symbols, that is the rule the entire field is built on. We write **$\\theta$** (“theta”) as shorthand for the pair $(\\alpha, \\beta)$ together:'
  },
  { kind: 'display', formula: 'stepRule', center: true },
  {
    kind: 'p',
    text: 'Press **Step** to take exactly one of these; press **Train** to take many in a row and watch the marker slide into a valley.'
  },
  {
    kind: 'p',
    text: 'You’ll now notice a {red:red arrow} on the marker beside the blue one. The blue arrow is the pure downhill direction; the **red arrow is the step the optimizer actually took**. Early on they almost agree. Once you add the tricks in Part IV, they’ll split apart — and *that gap is the optimizer’s personality.*'
  }
];
