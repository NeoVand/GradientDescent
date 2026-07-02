import type { Block } from '../blocks';

/** Chapter 1 · The bottom of a bowl — knobs, loss, and the shape of "wrong". */
export const chBowl: Block[] = [
  {
    kind: 'p',
    text: 'Everything in this lab is one idea wearing many costumes: a machine has a few **knobs**, and *learning* means turning those knobs until the machine’s guesses line up with reality.'
  },
  {
    kind: 'p',
    text: 'Here every machine has exactly **two** knobs, called {g:$\\alpha$} and {g:$\\beta$} (alpha and beta). Together they are the model’s **parameters** — the numbers that decide how it behaves. Choose values for $\\alpha$ and $\\beta$ and the model makes a **prediction** for every input. Compare those predictions with the real answers and you get the **loss**: one number for how wrong the model is right now. Lower is better; a perfect fit sits near zero.'
  },
  {
    kind: 'p',
    text: 'That is the whole game — *find the $\\alpha$ and $\\beta$ that make the loss as small as possible.* The orange marker is your current guess. Drag it around the **Loss & Gradient** panel, press **Train**, and watch the number fall.'
  },
  {
    kind: 'concept',
    title: 'Why a “bowl”?',
    text: 'For a simple fit, the loss is smallest at one best setting and grows as you move away in any direction — a valley with a single lowest point. Slide along it and the loss traces a bowl shape; the marker just wants to roll to the bottom.',
    fig: 'bowl-1d'
  },
  {
    kind: 'p',
    text: 'We can write that “how wrong” down exactly. For most fits here the loss is the **mean squared error**: take each prediction $\\hat{y}$, subtract the true value *y*, square the gap so that overshooting and undershooting both count as wrong, and average over all *n* data points.'
  },
  { kind: 'display', formula: 'lossDefinition' },
  {
    kind: 'aside',
    text: '**Reading the symbols** — your first formula, decoded once and for all: $\\Sigma$ (capital sigma) means “add up one copy per data point” — a for-loop, in Greek; the subscript $i$ names *which* data point; and the hat on $\\hat{y}$ marks a *prediction* (say “y-hat” — bare $y$ is always the truth). Every formula in this book is built from pieces this small.'
  },
  {
    kind: 'p',
    text: 'The squaring is the quiet hero here: it punishes a big miss far more than a small one, and it makes the loss a smooth, rounded *bowl* rather than a creased tent — and a smooth bowl is exactly what lets us roll downhill in the chapters ahead.'
  },
  {
    kind: 'p',
    text: 'Squared error is the right “how wrong” when the answer is a *number*. But several problems here ask a *yes/no* question — is this point inside the circle? on which side of the line? — and there the model outputs a **probability** $\\hat{y}\\in(0,1)$ that the answer is “yes” (read $(0,1)$ as “any number strictly between 0 and 1” — not a coordinate pair). Where does a probability come from? The model computes a plain score — any number at all — and squashes it through the S-shaped **sigmoid** $\\sigma$, which bends the whole number line smoothly into $(0,1)$: hugely positive scores land near 1, hugely negative near 0, a score of zero at an honest ½. You will spot $\\sigma$ doing exactly this in the zoo’s classifier formulas. The natural loss for a probability is **cross-entropy** (log-loss):'
  },
  { kind: 'display', formula: 'crossEntropy' },
  {
    kind: 'p',
    text: 'It is gentle when the model is confidently right and brutal when it is confidently wrong: predict $\\hat{y}=0.99$ while the truth is $y=0$ and the penalty is already $-\\log(0.01) \\approx 4.6$ — and it climbs toward infinity as the confidence approaches certainty. In plain words, cross-entropy scores the model by *how much probability it placed on what actually happened* (statisticians call that quantity the likelihood; this loss is its negative logarithm) — which is why it, not squared error, is the standard loss for classification: squared error for numbers, cross-entropy for categories.'
  }
];
