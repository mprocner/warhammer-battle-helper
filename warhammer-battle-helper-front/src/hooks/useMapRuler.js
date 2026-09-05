import { useCallback, useRef, useState } from 'react';
import { distanceBetween } from '../utils/tokenGeometry';
import { isOffscenePoint } from './useDragRuler';

// Throttle for outgoing MAP_RULER updates during a drag — keeps the WS chatty-but-cheap,
// same spirit as a cursor stream.
const SEND_THROTTLE_MS = 50;

// Manages the local measuring ruler and mirrors it to other players over WS (ephemeral,
// never persisted — the generic hub relay rebroadcasts MAP_RULER to the whole game, exactly
// like POINTER_PING). `snapPoint` optionally magnetizes endpoints to token centers.
//
// FEATURE-135 — BOTH ends of the manual ruler are gated, and they are gated differently:
//
//   START off-scene  → the whole measurement is private, permanently. Players never render the GM
//                      staging margin, so a line coming out of it announces an incoming token and
//                      its side. Decided once in start(), frozen until end(): nothing ever leaves
//                      the client, not even a closing frame — there is nothing to close.
//   ENDPOINT off-scene → that frame is not broadcast. A measurement started on the grid is public,
//                      but dragging its far end onto a token parked in the margin would put that
//                      token's exact centre on the wire (snapPoint magnetizes to token centres, and
//                      buildRulerSnapTargets filters by privacy, not by position). One clearing
//                      frame goes out so nobody is left with a frozen line, then silence until the
//                      endpoint returns to the grid.
//
// The drag ruler deliberately keeps a start-only rule: the token it carries is visible to players
// for the whole gesture, so leaving the scene discloses nothing. Here nothing moves — the endpoint
// IS the disclosure — so it has to be judged every frame.
//
// The manual tool is reachable from the margin at all because its mousedown handler is a CAPTURE
// listener on `content`: capture runs the whole ancestor chain, so pressing a token staged outside
// the grid still starts a ruler.
//
// Either gate suppresses the BROADCAST only. The local line, badge and distance readout always work,
// off-scene endpoint included.
export default function useMapRuler({ metric = 'euclidean', sendMessage, sceneId, userId, userName, snapPoint, aoeEnabled = true, gridWidth, gridHeight }) {
  const [ruler, setRuler] = useState(null); // { from: {col,row}, to: {col,row} } | null
  // The ruler state mirrored in a ref, exactly like useDragRuler's fromRef. Every send is decided
  // and issued from the HANDLER body against this ref — never from inside a setRuler updater.
  // React 19 double-invokes state updaters under React.StrictMode (src/index.js wraps the app), so
  // an updater that sends, or that resets privateRef, runs TWICE in development: the second pass
  // would see the already-cleared flag and broadcast the very frame the gate exists to suppress.
  const rulerRef = useRef(null);
  const lastSendRef = useRef(0);
  // Decided once per measurement, in start(), and frozen until end() — a scene update mid-drag
  // must not flip a private measurement into a broadcasting one.
  const privateRef = useRef(false);
  // Whether a line of ours is currently drawn on the other players' screens. Drives two decisions:
  // an endpoint leaving the scene clears it exactly once (not once per mousemove), and end() skips
  // the closing frame when nothing is out there to close.
  const liveRef = useRef(false);

  // Returns whether the frame actually went on the wire, so callers can track liveRef from the
  // single place that knows about every suppression.
  const send = useCallback((from, to, active) => {
    if (!sendMessage) return false;
    if (privateRef.current) return false; // started off-scene — nothing leaves the client
    // aoe → whether other players draw the AoE circle for this ruler (GM/player toggle).
    sendMessage('MAP_RULER', { sceneId, userId, name: userName, from, to, active, aoe: aoeEnabled });
    return true;
  }, [sendMessage, sceneId, userId, userName, aoeEnabled]);

  const start = useCallback((point) => {
    const p = snapPoint ? snapPoint(point) : point;
    // Judge the SNAPPED point, not the raw cursor: snapping magnetizes the origin to a nearby
    // token's exact centre, and that centre is what would actually go on the wire.
    privateRef.current = isOffscenePoint(p, { gridWidth, gridHeight });
    rulerRef.current = { from: p, to: p };
    setRuler(rulerRef.current);
    liveRef.current = send(p, p, true);
    lastSendRef.current = Date.now();
  }, [send, snapPoint, gridWidth, gridHeight]);

  const move = useCallback((point) => {
    const prev = rulerRef.current;
    if (!prev) return;
    const p = snapPoint ? snapPoint(point) : point;
    rulerRef.current = { from: prev.from, to: p };
    setRuler(rulerRef.current);

    if (privateRef.current) return; // private from the start — not even the clearing frame

    if (isOffscenePoint(p, { gridWidth, gridHeight })) {
      // The endpoint left the players' world. Clear the line we already put on their screens once,
      // then stay quiet until it comes back — a frozen line would still point at the staged token.
      // The clearing frame carries `from` twice: `from` started on the grid (or we would be
      // private), so in the ordinary case no off-scene coordinate can ride along on it. Edge case:
      // privateRef is frozen from the START-time grid dims while move() re-reads gridWidth/gridHeight
      // live, so a GM resizing the grid mid-measurement could in principle leave `from` outside the
      // NEW grid with privateRef still false — harmless here since every prior active:true frame
      // already carried that same `from`, so it is not a new disclosure.
      if (liveRef.current) {
        send(prev.from, prev.from, false);
        liveRef.current = false;
      }
      // lastSendRef is deliberately left alone: the clear is rate-limited by liveRef, and leaving
      // the window open lets the line reappear the instant the endpoint returns to the grid.
      return;
    }

    const now = Date.now();
    if (now - lastSendRef.current >= SEND_THROTTLE_MS) {
      lastSendRef.current = now;
      if (send(prev.from, p, true)) liveRef.current = true;
    }
  }, [send, snapPoint, gridWidth, gridHeight]);

  const end = useCallback(() => {
    const prev = rulerRef.current;
    rulerRef.current = null;
    setRuler(null);
    // Close only what is actually on someone's screen. Nothing is, when the measurement was private
    // from the start, when no measurement was active (unpaired or duplicate end), or when the
    // endpoint already went off-scene and was cleared then.
    if (prev && liveRef.current) send(prev.from, prev.to, false);
    liveRef.current = false;
    privateRef.current = false;
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
