import { useCallback, useRef, useState } from 'react';
import { distanceBetween } from '../utils/tokenGeometry';

// Throttle for outgoing MAP_RULER updates during a drag — keeps the WS chatty-but-cheap,
// same spirit as a cursor stream.
const SEND_THROTTLE_MS = 50;

// Manages the local measuring ruler and mirrors it to other players over WS (ephemeral,
// never persisted — the generic hub relay rebroadcasts MAP_RULER to the whole game, exactly
// like POINTER_PING). `snapPoint` optionally magnetizes endpoints to token centers.
export default function useMapRuler({ metric = 'euclidean', sendMessage, sceneId, userId, userName, snapPoint, aoeEnabled = true }) {
  const [ruler, setRuler] = useState(null); // { from: {col,row}, to: {col,row} } | null
  const lastSendRef = useRef(0);

  const send = useCallback((from, to, active) => {
    if (!sendMessage) return;
    // aoe → whether other players draw the AoE circle for this ruler (GM/player toggle).
    sendMessage('MAP_RULER', { sceneId, userId, name: userName, from, to, active, aoe: aoeEnabled });
  }, [sendMessage, sceneId, userId, userName, aoeEnabled]);

  const start = useCallback((point) => {
    const p = snapPoint ? snapPoint(point) : point;
    setRuler({ from: p, to: p });
    send(p, p, true);
    lastSendRef.current = Date.now();
  }, [send, snapPoint]);

  const move = useCallback((point) => {
    setRuler(prev => {
      if (!prev) return prev;
      const p = snapPoint ? snapPoint(point) : point;
      const now = Date.now();
      if (now - lastSendRef.current >= SEND_THROTTLE_MS) {
        lastSendRef.current = now;
        send(prev.from, p, true);
      }
      return { from: prev.from, to: p };
    });
  }, [send, snapPoint]);

  const end = useCallback(() => {
    setRuler(prev => {
      if (prev) send(prev.from, prev.to, false);
      return null;
    });
  }, [send]);

  const distance = ruler
    ? distanceBetween(
        { col: ruler.from.col, row: ruler.from.row, w: 0, h: 0 },
        { col: ruler.to.col, row: ruler.to.row, w: 0, h: 0 },
        metric,
      )
    : 0;

  return { ruler, distance, start, move, end };
}
