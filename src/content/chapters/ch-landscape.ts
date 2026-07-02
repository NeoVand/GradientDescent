import type { Block } from '../blocks';

/** Chapter 2 · Loss is a landscape — the move that makes everything visual. */
export const chLandscape: Block[] = [
  {
    kind: 'p',
    text: 'Here is the move that makes everything visual. The loss is not one fixed number — it is a number *for every possible setting of the knobs.* Pick one $(\\alpha, \\beta)$ and you get a loss. Nudge to a nearby pair and you get a slightly different loss. Sweep across **all** pairs and those losses trace out a **surface**: a landscape floating above the flat plane of every possible $\\alpha$ and $\\beta$.'
  },
  {
    kind: 'p',
    text: 'Low places in that landscape are good models; high places are bad ones. *Training is simply walking downhill on this surface*, and the orange marker is you, standing somewhere on it.'
  },
  {
    kind: 'p',
    text: 'The **Loss & Gradient** panel is a map of that landscape seen from straight above. {dark:**Brighter colours are lower** (better) loss; dark is high.}{light:**Deeper, richer colours are lower** (better) loss; the pale wash is high.} (The panel’s colour bar always shows which end is low.) The thin loops are **contour lines** — exactly like a hiking map: each loop joins points of equal loss, and loops bunched tightly together mean a steep slope. Flip the panel to **3D** and the same map lifts into real hills and valleys you can rotate.'
  },
  {
    kind: 'hd',
    text: 'One luxury to savor while you have it: this app draws the *entire, exact* loss surface, because two knobs are all there are. A real network’s surface lives in a billion dimensions, so every landscape picture you will ever see of one is a two-dimensional *slice* — pick two directions, sweep them, plot. And raw slices lie: scaling tricks inside networks stretch some directions and shrink others, so honest pictures need careful normalization (that is the “filter normalization” of Li et al., 2018, in the reading list below). Here, and almost nowhere else, what you see is the whole truth.'
  },
  {
    kind: 'figure',
    id: 'landscape-two-views',
    caption: 'The same loss, two ways: the flat contour map (left) is exactly the 3-D surface (right) seen from straight above. Each ring joins points of equal loss; the bright dimple is the basin every run is trying to reach.'
  },
  {
    kind: 'look',
    text: 'Look at the Loss & Gradient panel right now: the {dark:bright}{light:deep-coloured} dimple at the centre of the rings is where the loss is lowest, and the marker is trying to reach it.'
  }
];
