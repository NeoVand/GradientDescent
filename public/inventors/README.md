# Inventor portraits

Drop portrait images here and they appear automatically in the guide's
optimizer cards (Help → "The optimizer family tree"). Until a file exists, the
card shows a monogram placeholder (the inventor's initials). Co-authored methods
(AdaGrad, Adam, AdamW) show a small **facepile** of all their authors.

Use square-ish images (they're shown as a ~50px circle, framed with
`object-position: center top`). JPG or PNG is fine — keep the filename exactly as
listed below (referenced from `HelpModal.svelte`, `OPT_CITE`). Each was downscaled
to ≈ 420 px on the longest side to keep the bundle small.

## In place (11 of 14 cards)

### Wikimedia Commons — verified licences

Fetched via `https://commons.wikimedia.org/wiki/Special:FilePath/<file>`. The two
CC BY-SA credits are also shown in-app on the portrait's hover tooltip
(`OPT_CITE[...].credit`); the public-domain pair needs no attribution.

| File | Source (Commons) | Licence | Attribution |
|------|------------------|---------|-------------|
| `cauchy.jpg` | `Augustin-Louis Cauchy 1901.jpg` | Public domain | — (PD, life+70) |
| `newton.jpg` | `GodfreyKneller-IsaacNewton-1689.jpg` | Public domain | — (PD, after Godfrey Kneller, 1689) |
| `hinton.jpg` | `Geoffrey E. Hinton, 2024 Nobel Prize Laureate in Physics.jpg` | CC BY-SA 4.0 | Arthur Petron, CC BY-SA 4.0, via Wikimedia Commons |
| `nesterov.jpg` | `Nesterov yurii.jpg` | CC BY-SA 2.0 DE | Renate Schmid / Oberwolfach Photo Collection (MFO), CC BY-SA 2.0 DE |

### Provided by the project owner — licence to be confirmed

These were supplied directly (URLs below) for use in the educational guide. They
come from personal / institutional / professional pages and are **not confirmed
public-domain or CC** — treat them as courtesy-of-source and confirm reuse
permission before any production/commercial release.

| File | Person | Card | Source URL |
|------|--------|------|------------|
| `polyak.jpg` | Boris Polyak | Momentum | http://ait.mtas.ru/images/personal/polyak.jpg |
| `duchi.jpg` | John Duchi | AdaGrad | compression.stanford.edu (`…/johnduch3i_0.jpg`) |
| `hazan.jpg` | Elad Hazan | AdaGrad | toc.csail.mit.edu (`…/elad.jpg`) |
| `singer.jpg` | Yoram Singer | AdaGrad | toc.csail.mit.edu (`…/generate_thumbnail.jpg`) |
| `zeiler.jpg` | Matthew D. Zeiler | AdaDelta | matthewzeiler.com/hs2.jpg |
| `kingma.jpg` | Durk (Diederik) Kingma | Adam | dpkingma.com/files/portrait.jpg |
| `ba.jpg` | Jimmy Ba | Adam | vectorinstitute.ai (`…/vi_jimmy_ba-1.jpg`) |
| `dozat.jpg` | Timothy Dozat | Nadam | pbs.twimg.com (profile image) |
| `loshchilov.jpg` | Ilya Loshchilov | AdamW | (Google image result, original source TBD) |
| `hutter.jpg` | Frank Hutter | AdamW | chessprogramming.org (`…/240px-Frank_hutter.jpg`) |
| `liu-radam.jpg` | Liyuan (Lucas) Liu | RAdam | media.licdn.com (LinkedIn profile photo) |
| `jiang-radam.jpg` | Haoming Jiang | RAdam | scholar.googleusercontent.com (Google Scholar photo) |
| `he-radam.jpg` | Pengcheng He | RAdam | media.licdn.com (LinkedIn profile photo) |

## Still placeholders (monogram until an image is dropped in)

An exhaustive Wikimedia Commons check (Wikidata P18, Commons API namespace 6,
infoboxes) found no properly-licensed image for these three:

| File | Person | Optimizer |
|------|--------|-----------|
| `chen-lion.jpg` | Xiangning Chen | Lion |
| `liu-sophia.jpg` | Hong Liu | Sophia |
| `mishchenko.jpg` | Konstantin Mishchenko | Prodigy |
