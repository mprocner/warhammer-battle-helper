import { useState, useRef, useCallback } from 'react';

const storageKey = (gameId) => `combatStripPos:${gameId}`;

// Keep the whole strip inside the map area (bounds/size: {width, height}).
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

// Drag the strip by its grip. Position is in screen space relative to boundsRef (the map area), so
// zooming or panning the map never moves it. null = default (top centre, from CSS).
export default function useStripPosition(gameId, boundsRef) {
  const [position, setPosition] = useState(() => readStoredPosition(gameId));
  const stripRef = useRef(null);

  const onGripPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    const strip = stripRef.current;
    const area = boundsRef.current;
    if (!strip || !area) return;
    e.preventDefault();
    const b = area.getBoundingClientRect();
    const s = strip.getBoundingClientRect();
    const offset = { x: e.clientX - s.left, y: e.clientY - s.top };
    let last = null;
    const move = (ev) => {
      last = clampPosition({ x: ev.clientX - b.left - offset.x, y: ev.clientY - b.top - offset.y }, b, s);
      setPosition(last);
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      if (last) storePosition(gameId, last);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }, [gameId, boundsRef]);

  const reset = useCallback(() => {
    setPosition(null);
    storePosition(gameId, null);
  }, [gameId]);

  return { position, onGripPointerDown, reset, stripRef };
}
