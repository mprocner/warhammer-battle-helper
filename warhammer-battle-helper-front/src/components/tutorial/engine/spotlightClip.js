import { useLayoutEffect, useRef } from 'react';

// Joyride cuts the spotlight out of the overlay from the anchor's full box. An anchor taller than
// the scrolling container that holds it (a long group in the property popup) then lights up the
// page above and below that container. TourRunner points the spotlight at a fixed, invisible proxy
// box instead, kept over the part of the anchor that is actually visible.

// The anchor's viewport rect, cut down by every ancestor that clips its overflow and by the
// viewport itself. Per axis: an ancestor with overflow-y: auto clips only vertically.
// Joyride grows the cut-out by its spotlight padding on every side, so each clipping ancestor
// is shrunk by `inset` first - otherwise the padding spills onto whatever borders the container
// (the popup's title bar). The viewport needs no inset: padding past the screen edge is unseen.
const CLIPS = /^(auto|scroll|hidden|clip)$/;

export const visibleRect = (el, inset = 0) => {
  let { top, left, bottom, right } = el.getBoundingClientRect();
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowX, overflowY } = window.getComputedStyle(node);
    const box = node.getBoundingClientRect();
    if (CLIPS.test(overflowY)) { top = Math.max(top, box.top + inset); bottom = Math.min(bottom, box.bottom - inset); }
    if (CLIPS.test(overflowX)) { left = Math.max(left, box.left + inset); right = Math.min(right, box.right - inset); }
  }
  top = Math.max(top, 0);
  left = Math.max(left, 0);
  bottom = Math.min(bottom, window.innerHeight);
  right = Math.min(right, window.innerWidth);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
};

// Keeps one proxy element in <body> for as long as the tour runs and moves it over the visible
// part of `selector` - on every step and whenever anything scrolls or the window resizes.
// Returns a ref to the proxy, for Joyride's `spotlightTarget`. `inset` is the spotlight padding.
export const useSpotlightClip = (selector, active, inset = 0) => {
  const proxyRef = useRef(null);

  // Layout effects, this one first: the proxy exists before the placement below runs, and is in
  // place before the browser paints the new step's cut-out. position: fixed also tells Joyride to
  // draw the cut-out in viewport coordinates, which visibleRect returns.
  useLayoutEffect(() => {
    if (!active) return undefined;
    const proxy = document.createElement('div');
    proxy.className = 'tour-spotlight-clip';
    Object.assign(proxy.style, { position: 'fixed', pointerEvents: 'none', visibility: 'hidden' });
    document.body.appendChild(proxy);
    proxyRef.current = proxy;
    return () => {
      proxy.remove();
      proxyRef.current = null;
    };
  }, [active]);

  useLayoutEffect(() => {
    const proxy = proxyRef.current;
    if (!active || !selector || !proxy) return undefined;
    const place = () => {
      const el = document.querySelector(selector);
      if (!el) return;
      const r = visibleRect(el, inset);
      const next = { top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px` };
      if (Object.keys(next).every(k => proxy.style[k] === next[k])) return;
      Object.assign(proxy.style, next);
      // Joyride re-measures its spotlight target on window scroll/resize and on the target's own
      // size changes. A proxy that only moved triggers none of these, so nudge it.
      window.dispatchEvent(new Event('scroll'));
    };
    place();
    // Capture: scroll events do not bubble, and the popup body scrolls, not the window.
    document.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [selector, active, inset]);

  return proxyRef;
};
