import { useCallback, useEffect, useRef, useState } from 'react';

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
      return image ? !!image.hidden : true;
    }
    const placement = characters.find(c => c.characterId === t.id);
    return placement ? !!placement.hidden : true;
  });
}

// Live measuring ruler while dragging a token (grab point → current position). Shown locally to the
// dragger AND broadcast to other players over the same MAP_RULER channel as the manual ruler tool —
// unless the drag carries a token hidden from players, in which case the readout stays on this
// client. Ephemeral, never persisted: the hub relays MAP_RULER to the whole game like POINTER_PING.
export default function useDragRuler({ sendMessage, sceneId, userId, userName, images, characters }) {
  const [dragRuler, setDragRuler] = useState(null); // { from: {col,row}, to: {col,row} } | null
  const fromRef = useRef(null);
  const lastSendRef = useRef(0);
  // Decided once per drag, on start, and honoured until the drag ends — a scene update mid-drag
  // must not flip a private drag into a broadcasting one.
  const privateRef = useRef(false);
  // Mirrored so the handlers keep a stable identity: DndContext rebuilds these arrays on every
  // render, and an unstable onMeasureStart would churn every token's mousedown callback.
  // Same trick as sceneIdRef in DndContext.
  const sceneRef = useRef({ images, characters });
  useEffect(() => { sceneRef.current = { images, characters }; }, [images, characters]);

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
    privateRef.current = isPrivateDrag(tokens, sceneRef.current);
    fromRef.current = center;
    setDragRuler({ from: center, to: center });
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
    send(from, from, false);
    privateRef.current = false;
  }, [send]);

  return { dragRuler, onMeasureStart, onMeasureMove, onMeasureEnd };
}
