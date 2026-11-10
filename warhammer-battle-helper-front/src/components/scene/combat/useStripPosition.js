import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';

const storageKey = (gameId) => `combatStripPos:${gameId}`;
// Room for the scene bar's collapse handle (24px) plus a margin.
const DEFAULT_GAP = 32;

// Keep the whole strip inside the browser window (bounds/size: {width, height}).
export function clampPosition(pos, bounds, size) {
  return {
    x: Math.min(Math.max(0, pos.x), Math.max(0, bounds.width - size.width)),
    y: Math.min(Math.max(0, pos.y), Math.max(0, bounds.height - size.height)),
  };
}

// Per-viewer convenience only: null on any storage failure means "default position".
export function readStoredPosition(gameId) {
  try {
    const raw = window.localStorage.getItem(storageKey(gameId));
    if (!raw) return null;
    const p = JSON.parse(raw);
    return Number.isFinite(p?.x) && Number.isFinite(p?.y) ? { x: p.x, y: p.y } : null;
  } catch {
    return null;
  }
}

function storePosition(gameId, pos) {
  try {
    if (pos) window.localStorage.setItem(storageKey(gameId), JSON.stringify(pos));
    else window.localStorage.removeItem(storageKey(gameId));
  } catch {
    // storage unavailable: the position just won't survive a reload
  }
}

const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

// Drag the strip by its grip anywhere in the browser window — over the side panels too (a player
// may park it on the mostly empty left panel). Position is fixed, in viewport pixels, so zooming or
// panning the map never moves it. null = default spot: centred over the map area (mapRef), below
// the scene tab bars.
export default function useStripPosition(gameId, mapRef) {
  const [position, setPosition] = useState(() => readStoredPosition(gameId));
  // Callback ref + state: the strip node mounts late (CombatStrip renders null until combat is fetched),
  // and the re-clamp effect must re-run when it appears.
  const [stripEl, setStripEl] = useState(null);
  const dragCleanupRef = useRef(null);

  // Remove drag listeners if the strip unmounts mid-drag.
  useEffect(() => () => dragCleanupRef.current?.(), []);

  // A stored position may come from a bigger viewport: re-clamp after mount and on resize.
  // Automatic clamping never writes to storage.
  useLayoutEffect(() => {
    if (!position) return undefined;
    const reclamp = () => {
      if (!stripEl) return;
      const next = clampPosition(position, viewport(), stripEl.getBoundingClientRect());
      if (next.x !== position.x || next.y !== position.y) setPosition(next);
    };
    reclamp();
    window.addEventListener('resize', reclamp);
    return () => window.removeEventListener('resize', reclamp);
  }, [position, stripEl]);

  const onGripPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    const strip = stripEl;
    if (!strip) return;
    e.preventDefault();
    const s = strip.getBoundingClientRect();
    const offset = { x: e.clientX - s.left, y: e.clientY - s.top };
    let last = null;
    const move = (ev) => {
      last = clampPosition({ x: ev.clientX - offset.x, y: ev.clientY - offset.y }, viewport(), s);
      setPosition(last);
    };
    const cleanup = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      dragCleanupRef.current = null;
    };
    const up = () => {
      cleanup();
      if (last) storePosition(gameId, last);
    };
    dragCleanupRef.current?.();
    dragCleanupRef.current = cleanup;
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }, [gameId, stripEl]);

  // Default spot: centred over the map, just below the scene tab bars and clear of their collapse
  // handle (which hangs 24px below them). Bars collapse and side panels hide, so follow both.
  const [defaultSpot, setDefaultSpot] = useState(null);
  useLayoutEffect(() => {
    const area = mapRef.current;
    if (!area) return undefined;
    const bars = area.querySelector('.top-bars');
    const measure = () => {
      const r = area.getBoundingClientRect();
      const top = r.top + (bars ? bars.offsetHeight : 0) + DEFAULT_GAP;
      const centerX = r.left + r.width / 2;
      setDefaultSpot(prev => (prev && prev.top === top && prev.centerX === centerX ? prev : { top, centerX }));
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(area);
    if (bars) ro?.observe(bars);
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [mapRef, stripEl]);

  const reset = useCallback(() => {
    setPosition(null);
    storePosition(gameId, null);
  }, [gameId]);

  return { position, defaultSpot, onGripPointerDown, reset, stripRef: setStripEl };
}
