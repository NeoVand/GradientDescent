# Inventor portraits

Drop portrait images here and they appear automatically in the guide's
optimizer cards (Help → "The optimizer family tree"). Until a file exists, the
card shows a monogram placeholder (the inventor's initials).

Use square-ish images (they're shown as a 50px circle). JPG or PNG is fine —
keep the filename exactly as listed below (referenced from `HelpModal.svelte`,
`OPT_CITE`). Prefer public-domain or Creative Commons portraits and keep a note
of the source/licence/attribution.

## Sourced so far (from Wikimedia Commons)

These four are in place. The two CC BY-SA credits are also shown in-app on the
portrait's hover tooltip (`OPT_CITE[...].credit`); the public-domain pair needs
no attribution. All licences read off the live Commons file pages.

| File | Source (Commons) | Licence | Attribution |
|------|------------------|---------|-------------|
| `cauchy.jpg` | `Augustin-Louis Cauchy 1901.jpg` | Public domain | — (PD, life+70) |
| `newton.jpg` | `GodfreyKneller-IsaacNewton-1689.jpg` | Public domain | — (PD, after Godfrey Kneller, 1689) |
| `hinton.jpg` | `Geoffrey E. Hinton, 2024 Nobel Prize Laureate in Physics.jpg` | CC BY-SA 4.0 | Arthur Petron, CC BY-SA 4.0, via Wikimedia Commons |
| `nesterov.jpg` | `Nesterov yurii.jpg` | CC BY-SA 2.0 DE | Renate Schmid / Oberwolfach Photo Collection (MFO), CC BY-SA 2.0 DE |

Each was fetched via `https://commons.wikimedia.org/wiki/Special:FilePath/<file>`
and downscaled (longest side ≈ 420 px) to keep the bundle small. The CSS frames
them with `object-position: center top`, so head-and-shoulders portraits crop
cleanly to the circle.

**Still placeholders** (no properly-licensed image found yet — drop one in to
replace the monogram): everyone in the table below except the four above. Boris
Polyak in particular has no usable Commons image; a properly-licensed photo would
need to come from the Institute for Control Sciences.

| File | Person | Optimizer |
|------|--------|-----------|
| `cauchy.jpg` | Augustin-Louis Cauchy | Gradient Descent |
| `polyak.jpg` | Boris Polyak | Momentum |
| `nesterov.jpg` | Yurii Nesterov | Nesterov |
| `duchi.jpg` | John Duchi | AdaGrad |
| `hinton.jpg` | Geoffrey Hinton | RMSProp |
| `zeiler.jpg` | Matthew Zeiler | AdaDelta |
| `kingma.jpg` | Diederik Kingma | Adam |
| `dozat.jpg` | Timothy Dozat | Nadam |
| `loshchilov.jpg` | Ilya Loshchilov | AdamW |
| `liu-radam.jpg` | Liyuan Liu | RAdam |
| `chen-lion.jpg` | Xiangning Chen | Lion |
| `newton.jpg` | Isaac Newton | Newton |
| `liu-sophia.jpg` | Hong Liu | Sophia |
| `mishchenko.jpg` | Konstantin Mishchenko | Prodigy |
