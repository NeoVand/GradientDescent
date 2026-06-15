/**
 * A single, consistent hover/focus tooltip used across the whole app.
 *
 * Replaces the sidebar's hardcoded-position popup AND the panels' plain
 * native `title` tooltips, so every control explains itself the same way.
 * The tooltip is appended to <body> and positioned right next to its
 * trigger — above by default, flipping below when there isn't room, and
 * clamped to the viewport — so it appears where you'd expect and can never
 * be clipped by a panel's overflow.
 *
 * Usage:  <button use:tooltip={'Some text — supports <br/> and markup'} />
 */
// Only one tooltip is ever on screen — opening a new one closes the last,
// so overlapping hover/focus can never leave a stray tooltip behind.
let openTip: { hide: () => void } | null = null;

export function tooltip(node: HTMLElement, content: string | null | undefined) {
  let text = content ?? '';
  let el: HTMLDivElement | null = null;

  function position() {
    if (!el) return;
    const r = node.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const gap = 8;

    // Prefer above the trigger; flip below if it would clip the top.
    let top = r.top - h - gap;
    if (top < gap) top = r.bottom + gap;

    // Centre horizontally on the trigger, clamped to the viewport.
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(gap, Math.min(left, window.innerWidth - w - gap));

    el.style.top = `${Math.round(top)}px`;
    el.style.left = `${Math.round(left)}px`;
  }

  function show() {
    if (el || !text) return;
    openTip?.hide();            // close any other open tooltip first
    el = document.createElement('div');
    el.className = 'app-tooltip';
    el.setAttribute('role', 'tooltip');
    el.innerHTML = text;
    document.body.appendChild(el);
    position();
    openTip = { hide };
  }

  function hide() {
    el?.remove();
    el = null;
    if (openTip?.hide === hide) openTip = null;
  }

  node.addEventListener('mouseenter', show);
  node.addEventListener('mouseleave', hide);
  node.addEventListener('focus', show);
  node.addEventListener('blur', hide);

  return {
    update(c: string | null | undefined) {
      text = c ?? '';
      if (el) {
        el.innerHTML = text;
        position();
      }
    },
    destroy() {
      hide();
      node.removeEventListener('mouseenter', show);
      node.removeEventListener('mouseleave', hide);
      node.removeEventListener('focus', show);
      node.removeEventListener('blur', hide);
    }
  };
}
