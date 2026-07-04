/**
 * Rehome an overlay element to #app so position:fixed means the viewport.
 *
 * The mobile controls drawer is CSS-transformed (its slide-in animation), and
 * a transformed ancestor becomes the containing block for fixed-position
 * descendants: popovers "fixed" inside it ride along with the drawer's scroll
 * and their full-screen backdrops shrink to the drawer's box. Moving the node
 * to the Svelte mount target (#app — NOT document.body, so the framework's
 * delegated events keep firing) restores true viewport positioning.
 *
 * Usage:  <div class="my-popover" use:portalToApp>
 */
export function portalToApp(node: HTMLElement) {
  (document.getElementById('app') ?? document.body).appendChild(node);
  return { destroy: () => node.remove() };
}
