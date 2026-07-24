import { useState, useRef, useCallback, useEffect } from 'react';
import { CELL_SIZE } from '../constants/scene';
import { imageToMapToken, characterToMapToken, unionRect, clampGroupDelta, rectPx, centerOf } from '../utils/tokenGeometry';

// Group-drag controller. Holds the live delta (in cells) for the whole selection; individual tokens
// render themselves offset by this delta (single source of truth = server data + one delta).
// deltaRef mirrors the latest clamped delta so the mouseup handler reads it without re-subscribing.
//
// `characters` must be SceneCharacter placements (displayedScene.characters — characterId/positionX/
// positionY), the same shape characterToMapToken expects — NOT placedCharacters (fightZones-shaped
// {character,col,row,w,h}), which would give characterToMapToken the wrong fields.
export default function useGroupDrag({ selectedTokens, images, characters, gridWidth, gridHeight, snap, zoom, onCommit, onMeasureStart, onMeasureMove, onMeasureEnd }) {
  const [delta, setDelta] = useState(null); // {dCol,dRow} while dragging, else null
  const startRef = useRef(null);            // { mouseX, mouseY, bbox, center }
  const deltaRef = useRef({ dCol: 0, dRow: 0 });

  const begin = useCallback((e) => {
    if (!selectedTokens.length) return;
    const imgById = new Map((images || []).map(i => [i.id, i]));
    const charById = new Map((characters || []).map(c => [c.characterId, c]));
    const rects = [];
    selectedTokens.forEach(t => {
      if (t.kind === 'image' && imgById.has(t.id)) rects.push(imageToMapToken(imgById.get(t.id)));
      // Characters render on a whole cell (fightZones), while positionX/Y can be fractional in free
      // mode. Round to the rendered cell so the bounding box — and the ruler drawn from its center —
      // matches where the token actually sits, instead of drifting off it.
      if (t.kind === 'char' && charById.has(t.id)) {
        const tk = characterToMapToken(charById.get(t.id));
        rects.push({ col: Math.round(tk.col), row: Math.round(tk.row), w: tk.w, h: tk.h });
      }
    });
    const bbox = unionRect(rects);
    if (!bbox) return;
    const center = centerOf(bbox);
    startRef.current = { mouseX: e.clientX, mouseY: e.clientY, bbox, center };
    deltaRef.current = { dCol: 0, dRow: 0 };
    // Ruler measures the group's travel: from its bounding-box center to where the drag takes it.
    onMeasureStart?.({ col: center.col, row: center.row });
    setDelta({ dCol: 0, dRow: 0 });
  }, [selectedTokens, images, characters, onMeasureStart]);

  const dragging = delta !== null;

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e) => {
      const s = startRef.current;
      let dCol = (e.clientX - s.mouseX) / zoom / CELL_SIZE;
      let dRow = (e.clientY - s.mouseY) / zoom / CELL_SIZE;
      if (snap) { dCol = Math.round(dCol); dRow = Math.round(dRow); }
      const clamped = clampGroupDelta({ dCol, dRow }, s.bbox, gridWidth, gridHeight);
      deltaRef.current = clamped;
      onMeasureMove?.({ col: s.center.col + clamped.dCol, row: s.center.row + clamped.dRow });
      setDelta(clamped);
    };

    const onUp = () => {
      onMeasureEnd?.();
      const d = deltaRef.current;
      if (d && (d.dCol !== 0 || d.dRow !== 0)) {
        const imgById = new Map((images || []).map(i => [i.id, i]));
        const charById = new Map((characters || []).map(c => [c.characterId, c]));
        const outImages = [], outChars = [];
        selectedTokens.forEach(t => {
          if (t.kind === 'image' && imgById.has(t.id)) {
            const tk = imageToMapToken(imgById.get(t.id));
            const px = rectPx({ col: tk.col + d.dCol, row: tk.row + d.dRow, w: tk.w, h: tk.h });
            outImages.push({ id: t.id, x: px.x, y: px.y });
          }
          if (t.kind === 'char' && charById.has(t.id)) {
            const tk = characterToMapToken(charById.get(t.id));
            // Commit from the rendered (rounded) cell, matching the bbox/ruler above.
            outChars.push({ id: t.id, positionX: Math.round(tk.col) + d.dCol, positionY: Math.round(tk.row) + d.dRow });
          }
        });
        onCommit?.({ images: outImages, characters: outChars });
      }
      startRef.current = null;
      setDelta(null);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragging, zoom, snap, gridWidth, gridHeight, selectedTokens, images, characters, onCommit, onMeasureMove, onMeasureEnd]);

  return { delta, begin };
}
