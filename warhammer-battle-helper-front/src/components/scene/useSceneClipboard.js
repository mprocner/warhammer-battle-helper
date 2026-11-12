import { useEffect, useRef, useState } from 'react';
import useKeyboardShortcut from '../../shortcuts/useKeyboardShortcut';
import { pasteSceneImages } from '../../api/scenes';
import { CELL_SIZE } from '../../constants/scene';
import { buildClipboard, pastePositions } from './sceneClipboard';

// Must match MaxPastedSceneImages in the backend: a bigger selection goes in several requests.
const PASTE_BATCH = 20;

// The GM's Ctrl+C / Ctrl+V for scene images (registry: scene.copy / scene.paste). The clipboard
// lives in memory (the system clipboard cannot carry a scene image anyway) and survives a scene
// switch, so a group can be copied onto another scene. The pasted group is centred under the last
// pointer position over the viewport, or cascades next to the original when the pointer is off it.
//
// The pasted copies become the selection — but only once they have reached the scene: the HTTP
// answer can arrive before SCENE_IMAGE_ADDED, and the selection drops ids the scene does not hold.
// The pending ids are state, not a ref, because the events can also come first: then only the
// answer itself changes anything, and it must re-run the check.
export default function useSceneClipboard({
  enabled, gameId, sceneId, images, selectedTokens, viewportRef, clientToScenePx, snap, onSelect,
}) {
  const clipboardRef = useRef(null);
  const pointerRef = useRef(null); // { clientX, clientY } while over the viewport, else null
  const [pendingSelect, setPendingSelect] = useState(null); // ids of the last paste, until they show up in `images`

  useEffect(() => {
    if (!enabled) return undefined;
    const onMove = (e) => {
      pointerRef.current = viewportRef.current?.contains(e.target) ? { clientX: e.clientX, clientY: e.clientY } : null;
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [enabled, viewportRef]);

  const textSelected = () => !!window.getSelection?.()?.toString();

  useKeyboardShortcut('scene.copy', () => {
    clipboardRef.current = buildClipboard(sceneId, selectedTokens, images);
  }, {
    enabled,
    when: () => !textSelected() && !!buildClipboard(sceneId, selectedTokens, images),
  });

  useKeyboardShortcut('scene.paste', async () => {
    const clip = clipboardRef.current;
    const p = pointerRef.current;
    const anchor = p ? clientToScenePx(p.clientX, p.clientY) : null;
    const items = pastePositions(clip, anchor, { snap, cellSize: CELL_SIZE });
    const created = [];
    try {
      for (let i = 0; i < items.length; i += PASTE_BATCH) {
        const batch = items.slice(i, i + PASTE_BATCH);
        created.push(...(await pasteSceneImages(gameId, sceneId, { sourceSceneId: clip.sourceSceneId, items: batch })));
      }
    } catch (err) {
      console.error('Failed to paste scene images:', err);
    }
    if (created.length) setPendingSelect(created.map(img => img.id));
  }, {
    enabled,
    when: () => !!clipboardRef.current,
  });

  // Select the copies as soon as the scene holds all of them.
  const imageIds = (images || []).map(i => i.id).join(',');
  useEffect(() => {
    if (!pendingSelect) return;
    const present = new Set(imageIds.split(','));
    if (!pendingSelect.every(id => present.has(id))) return;
    setPendingSelect(null);
    onSelect(pendingSelect.map(id => ({ kind: 'image', id })), false);
  }, [pendingSelect, imageIds, onSelect]);
}
