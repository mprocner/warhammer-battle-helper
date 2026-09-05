import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { isCharacterPlacementPrivate, isImagePrivate } from '../utils/tokenGeometry';

// Throttle for outgoing MAP_RULER updates during a drag — keeps the WS chatty-but-cheap,
// same spirit as a cursor stream. Mirrors useMapRuler's SEND_THROTTLE_MS.
const SEND_THROTTLE_MS = 50;

// A token hidden from players must not leak its position through the broadcast drag ruler (BUG-178):
// the player never sees the token, but a ruler drawn from its cell to the drop cell tells them
// exactly where it was and where it went.
//
// `tokens` is [{ kind: 'char' | 'image', id }] — every token the drag moves. One entry for a single
// drag, the whole selection for a group drag, where one hidden token makes the whole group private.
//
// Fail closed: an id we cannot resolve counts as hidden — a missing ruler beats a leaked position.
// Anything that is not kind 'image' is looked up as a character placement, so a malformed kind also
// fails closed instead of silently broadcasting.
export function isPrivateDrag(tokens, { images = [], characters = [] } = {}) {
  if (!tokens || !tokens.length) return false;
  return tokens.some(t => {
    if (t.kind === 'image') {
      const image = images.find(i => i.id === t.id);
      // A gm-layer image is invisible to players just like a hidden one — see isImagePrivate.
      return image ? isImagePrivate(image) : true;
    }
    const placement = characters.find(c => c.characterId === t.id);
    return placement ? isCharacterPlacementPrivate(placement) : true;
  });
}

// True when a point lies outside the grid — the GM staging ring, or anything past an edge. Players
// never render that area, so a ruler endpoint sitting there tells them a token is coming onto the
// map and from which side, even when the token itself is perfectly visible (FEATURE-135).
//
// The name is deliberately position-neutral: the two rulers apply it to different ends of the line.
// The DRAG ruler judges only the START (see onMeasureStart below); the MANUAL ruler judges the start
// AND every endpoint it would broadcast (see useMapRuler). Same predicate, two policies.
//
// Fail closed like isPrivateDrag: a point or grid size we cannot read counts as off-scene.
export function isOffscenePoint(point, { gridWidth, gridHeight } = {}) {
  if (!point || !Number.isFinite(point.col) || !Number.isFinite(point.row)) return true;
  if (!Number.isFinite(gridWidth) || !Number.isFinite(gridHeight)) return true;
  return point.col < 0 || point.col > gridWidth || point.row < 0 || point.row > gridHeight;
}

// Live measuring ruler while dragging a token (grab point → current position). Shown locally to the
// dragger AND broadcast to other players over the same MAP_RULER channel as the manual ruler tool —
// unless the drag carries a token hidden from players (isPrivateDrag) or STARTS in the GM staging
// margin (isOffscenePoint), in which case the readout stays on this client. Either way only the
// broadcast is suppressed; the dragger keeps their own line and distance.
//
// Only the START is judged here, unlike the manual ruler: a token dragged OUT of the scene is
// visible to players for the whole gesture, so there is nothing left to hide once it leaves.
// Ephemeral, never persisted: the hub relays MAP_RULER to the whole game like POINTER_PING.
export default function useDragRuler({ sendMessage, sceneId, userId, userName, images, characters, gridWidth, gridHeight }) {
  const [dragRuler, setDragRuler] = useState(null); // { from: {col,row}, to: {col,row} } | null
  const fromRef = useRef(null);
  const lastSendRef = useRef(0);
  // Decided once per drag, on start, and honoured until the drag ends — a scene update mid-drag
  // must not flip a private drag into a broadcasting one.
  const privateRef = useRef(false);
  // Mirrored so the handlers keep a stable identity: DndContext rebuilds these arrays on every
  // render, and an unstable onMeasureStart would churn every token's mousedown callback.
  // Same trick as sceneIdRef in DndContext.
  // useLayoutEffect, not useEffect: the mirror must be current before the browser can deliver the
  // next mousedown/pointerdown, or a drag that starts in that window would read a stale scene and
  // could misjudge privacy.
  const sceneRef = useRef({ images, characters, gridWidth, gridHeight });
  useLayoutEffect(() => { sceneRef.current = { images, characters, gridWidth, gridHeight }; }, [images, characters, gridWidth, gridHeight]);

  const send = useCallback((from, to, active) => {
    if (!sendMessage) return;
    if (privateRef.current) return; // hidden token in this drag — nothing leaves the client
    if (active) {
      const now = Date.now();
      if (now - lastSendRef.current < SEND_THROTTLE_MS) return; // throttle live updates
      lastSendRef.current = now;
    }
    sendMessage('MAP_RULER', { sceneId, userId, name: userName, from, to, active, aoe: false });
  }, [sendMessage, sceneId, userId, userName]);

  const onMeasureStart = useCallback((center, tokens) => {
    privateRef.current = isPrivateDrag(tokens, sceneRef.current)
      || isOffscenePoint(center, sceneRef.current);
    fromRef.current = center;
    setDragRuler({ from: center, to: center });
    // Clear the throttle window unconditionally: without this, a drag starting within
    // SEND_THROTTLE_MS of the previous drag's last move would have its start frame silently
    // dropped, and a click with no movement would broadcast only `active: false`.
    lastSendRef.current = 0;
    send(center, center, true);
  }, [send]);

  const onMeasureMove = useCallback((center) => {
    const from = fromRef.current;
    setDragRuler(from ? { from, to: center } : null);
    if (from) send(from, center, true);
  }, [send]);

  const onMeasureEnd = useCallback(() => {
    const from = fromRef.current;
    fromRef.current = null;
    setDragRuler(null);
    // No drag was active (unpaired or duplicate end) — nothing was ever broadcast, so there is
    // nothing on any player's screen that needs clearing.
    if (from) send(from, from, false);
    privateRef.current = false;
  }, [send]);

  return { dragRuler, onMeasureStart, onMeasureMove, onMeasureEnd };
}
