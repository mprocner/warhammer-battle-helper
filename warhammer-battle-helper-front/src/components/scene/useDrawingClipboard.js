import { useEffect, useRef, useState } from 'react';
import useKeyboardShortcut from '../../shortcuts/useKeyboardShortcut';
import { pasteDrawingPaths } from '../../api/scenes';
import { buildDrawingClipboard, pasteDrawingRequests } from './drawingClipboard';

// Must match MaxPastedDrawingPaths in the backend: a bigger clipboard goes in several requests.
const PASTE_BATCH = 50;

// Ctrl+C / Ctrl+V of drawings in drawing mode (registry: drawing.copy / drawing.paste), for every
// participant. The clipboard lives in memory and survives a scene switch, so drawings can be copied
// onto another scene. The pasted group is centred under the last pointer position over the
// viewport, or cascades next to the original when the pointer is off it.
//
// Like useSceneClipboard, the copies are handed to onPasted only once the scene holds them: the
// HTTP answer and the DRAWING_PATHS_ADDED event arrive in either order, and a selection of ids
// the scene does not hold yet would be pruned at once.
export default function useDrawingClipboard({
  enabled, canCopy, gameId, sceneId, paths, selectedIds, viewportRef, clientToScenePx, canvasSize, onPasted,
}) {
  const clipboardRef = useRef(null);
  const pointerRef = useRef(null); // { clientX, clientY } while over the viewport, else null
  const [pending, setPending] = useState(null); // ids of the last paste, until they show up in `paths`

  useEffect(() => {
    if (!enabled) return undefined;
    const onMove = (e) => {
      pointerRef.current = viewportRef.current?.contains(e.target) ? { clientX: e.clientX, clientY: e.clientY } : null;
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [enabled, viewportRef]);

  const textSelected = () => !!window.getSelection?.()?.toString();
  const build = () => buildDrawingClipboard(sceneId, selectedIds, paths);

  useKeyboardShortcut('drawing.copy', () => {
    clipboardRef.current = build();
  }, {
    enabled: enabled && canCopy,
    when: () => !textSelected() && !!build(),
  });

  useKeyboardShortcut('drawing.paste', async () => {
    const p = pointerRef.current;
    const anchor = p ? clientToScenePx(p.clientX, p.clientY) : null;
    const requests = pasteDrawingRequests(clipboardRef.current, anchor, canvasSize);
    const created = [];
    try {
      for (let i = 0; i < requests.length; i += PASTE_BATCH) {
        created.push(...(await pasteDrawingPaths(gameId, sceneId, requests.slice(i, i + PASTE_BATCH))));
      }
    } catch (err) {
      console.error('Failed to paste drawings:', err);
    }
    if (created.length) setPending(created.map(path => path.id));
  }, {
    enabled,
    when: () => !!clipboardRef.current,
  });

  const pathIds = (paths || []).map(path => path.id).join(',');
  useEffect(() => {
    if (!pending) return;
    const present = new Set(pathIds.split(','));
    if (!pending.every(id => present.has(id))) return;
    setPending(null);
    onPasted(pending);
  }, [pending, pathIds, onPasted]);
}
