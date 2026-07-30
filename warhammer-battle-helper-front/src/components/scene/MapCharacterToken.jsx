import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import Avatar from '../Avatar';
import TokenOverlay from '../token-display/TokenOverlay';
import TokenResizeHandles from './TokenResizeHandles';
import TokenRotateHandle from './TokenRotateHandle';
import { useTokenRotate } from './useTokenRotate';
import { canManipulateToken } from '../../utils/tokenManipulation';
import { useZoom } from './ZoomContext';
import { CELL_SIZE } from '../../constants/scene';

// A character token on the unified tokens layer: absolute-positioned, with its own drag/resize
// (the same zoom-aware math as SceneImage). Movement stays snapped to whole cells in snap mode,
// matching the existing grid data flow; resize grows in whole cells.
function MapCharacterToken({
  character, col, row, w, h, rotation = 0,
  isGM = false, isMultiplayer = false, canDrag = true, selected = false,
  tokenPlacementMode = 'snap', tokenDisplay = null, gameId = null, token = null,
  sceneId = null, hidden = false, placementId = null, tokenGear = null, tokenView = null,
  gameSystem = null, editingLayer = null, imageEditLayer = 'background', activeTool = null,
  onSelect, onCommitMove, onCommitResize, onCommitRotate,
  onTokenDragMeasureStart, onTokenDragMeasureMove, onTokenDragMeasureEnd,
  multiSelected = false, multiSelectActive = false, onToggleSelect, groupDragDelta = null, onGroupDragStart,
}) {
  const { zoom, gridWidth, gridHeight } = useZoom();
  const [pos, setPos] = useState({ col, row });
  const [size, setSize] = useState({ w, h });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [angle, setAngle] = useState(rotation);
  const containerRef = useRef(null);
  const justRotatedRef = useRef(false);

  const dragStartRef = useRef(null);
  const resizeStartRef = useRef(null);
  const movedRef = useRef(false);
  const groupPressRef = useRef(null); // select-mode press point — distinguishes a group drag from a click
  const justMovedRef = useRef(false);
  const justResizedRef = useRef(false);

  // Sync from props unless a live interaction owns the value. After committing a move/resize we
  // skip one sync so the token doesn't snap back before the server round-trip reconciles.
  useEffect(() => {
    if (isDragging) return;
    if (justMovedRef.current) { justMovedRef.current = false; return; }
    setPos({ col, row });
  }, [col, row, isDragging]);
  useEffect(() => {
    if (isResizing) return;
    if (justResizedRef.current) { justResizedRef.current = false; return; }
    setSize({ w, h });
  }, [w, h, isResizing]);
  // --- Rotate ---
  // Only the avatar badge turns; the name and the states/HP overlay stay upright so their text
  // never ends up sideways. Rotation is purely visual — the token's grid footprint (w/h) is
  // unchanged, matching how scene images behave.
  // Declared here (ahead of the prop-sync effect below, which reads isRotating) rather than next to
  // Drag/Resize — the hook must be called before anything references the isRotating it returns.
  const commitRotation = useCallback((finalAngle) => {
    justRotatedRef.current = true;
    onCommitRotate?.(character.id, finalAngle);
  }, [character.id, onCommitRotate]);

  const { isRotating, handleRotateStart, consumeJustFinished } = useTokenRotate({
    containerRef,
    rotation: angle,
    setRotation: setAngle,
    enabled: isGM || canDrag,
    onCommit: commitRotation,
  });

  useEffect(() => {
    if (isRotating) return;
    if (justRotatedRef.current) { justRotatedRef.current = false; return; }
    setAngle(rotation);
  }, [rotation, isRotating]);

  const snap = tokenPlacementMode === 'snap';

  // --- Drag ---
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    // Presses on the states/HP overlay must not start a drag. (Resize/rotate handles already stop
    // propagation on their own mousedown, so a press on them never reaches here.)
    if (e.target.closest('.token-overlay')) return;
    // Measure mode: the ruler owns the press (it magnetizes to this token's center in the
    // viewport's capture handler). The token must stay put — never drag/select while measuring.
    if (editingLayer === 'measure') return;
    if (editingLayer === 'select') {
      // Record the press point so the native click that follows can tell a drag (single OR group)
      // from a real click — a drag must not toggle this selection.
      groupPressRef.current = { x: e.clientX, y: e.clientY };
      if (e.button !== 0) return; // right/middle → context menu, never a drag
      // Characters are draggable only when the tokens layer is armed (their own layer). On another
      // armed layer they're backdrop, so the press falls through to the viewport marquee.
      if (imageEditLayer !== 'tokens') return;
      // Part of the multi-selection → group drag (moves the whole selection together).
      if (multiSelected && onGroupDragStart) {
        e.preventDefault();
        e.stopPropagation();
        onGroupDragStart(e);
        return;
      }
      // Otherwise fall through to the normal single-character drag below (like an armed image), so
      // a lone token can be repositioned without leaving Select mode.
    }
    // Selection is allowed for everyone able to select; dragging is ownership-gated.
    e.stopPropagation();
    if (!canDrag) return;
    e.preventDefault();
    movedRef.current = false;
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX, mouseY: e.clientY,
      startCol: pos.col, startRow: pos.row, z: zoom,
      maxCol: Math.max(0, gridWidth - size.w),
      maxRow: Math.max(0, gridHeight - size.h),
    };
    // Snap mode: the ruler measures cell-to-cell (start cell → landing cell), stepping discretely.
    onTokenDragMeasureStart?.(snap
      ? { col: Math.round(pos.col) + size.w / 2, row: Math.round(pos.row) + size.h / 2 }
      : { col: pos.col + size.w / 2, row: pos.row + size.h / 2 });
  }, [canDrag, pos, size, zoom, gridWidth, gridHeight, snap, editingLayer, imageEditLayer, onTokenDragMeasureStart, multiSelected, onGroupDragStart]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => {
      const { mouseX, mouseY, startCol, startRow, z, maxCol, maxRow } = dragStartRef.current;
      const dCol = (e.clientX - mouseX) / z / CELL_SIZE;
      const dRow = (e.clientY - mouseY) / z / CELL_SIZE;
      if (Math.abs(e.clientX - mouseX) + Math.abs(e.clientY - mouseY) > 3) movedRef.current = true;
      const nc = Math.max(0, Math.min(startCol + dCol, maxCol));
      const nr = Math.max(0, Math.min(startRow + dRow, maxRow));
      setPos({ col: nc, row: nr });
      // Snap: report the landing cell's center so the distance steps cell-by-cell, not smoothly.
      onTokenDragMeasureMove?.(snap
        ? { col: Math.max(0, Math.min(Math.round(nc), gridWidth - size.w)) + size.w / 2, row: Math.max(0, Math.min(Math.round(nr), gridHeight - size.h)) + size.h / 2 }
        : { col: nc + size.w / 2, row: nr + size.h / 2 });
    };
    const onUp = () => {
      setIsDragging(false);
      onTokenDragMeasureEnd?.();
      if (!movedRef.current) return; // a plain click, handled by onClick
      const finalCol = Math.max(0, Math.min(snap ? Math.round(pos.col) : pos.col, gridWidth - size.w));
      const finalRow = Math.max(0, Math.min(snap ? Math.round(pos.row) : pos.row, gridHeight - size.h));
      justMovedRef.current = true;
      setPos({ col: finalCol, row: finalRow });
      onCommitMove?.(character.id, finalCol, finalRow);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, pos, size, gridWidth, gridHeight, character.id, onCommitMove, onTokenDragMeasureMove, onTokenDragMeasureEnd, snap]);

  // --- Resize (GM/owner only) ---
  // Handles only in the token-manipulation context (default/pan), matching how SceneImage shows
  // handles only when its layer is armed — so they don't clutter fog/drawing/measure modes.
  // One shared predicate decides both handle kinds, so the pan and select tools can never drift
  // apart again (see utils/tokenManipulation.js).
  const showHandles = canManipulateToken({
    allowed: isGM || canDrag,
    locked: false, // character placements have no lock concept
    editingLayer,
    activeTool,
    imageEditLayer,
    activeSelected: selected,
    groupSelected: multiSelected,
    multiSelectActive,
  });
  const handleResizeStart = useCallback((e, handle) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = { handle, mouseX: e.clientX, mouseY: e.clientY, z: zoom, startCol: pos.col, startRow: pos.row, startW: size.w, startH: size.h };
  }, [zoom, pos, size]);

  useEffect(() => {
    if (!isResizing) return;
    const compute = (e) => {
      const { handle, mouseX, mouseY, z, startCol, startRow, startW, startH } = resizeStartRef.current;
      const dCol = (e.clientX - mouseX) / z / CELL_SIZE;
      const dRow = (e.clientY - mouseY) / z / CELL_SIZE;
      let nc = startCol, nr = startRow, nw = startW, nh = startH;
      if (handle.includes('e')) nw = Math.max(1, startW + dCol);
      if (handle.includes('s')) nh = Math.max(1, startH + dRow);
      if (handle.includes('w')) { nw = Math.max(1, startW - dCol); nc = startCol + (startW - nw); }
      if (handle.includes('n')) { nh = Math.max(1, startH - dRow); nr = startRow + (startH - nh); }
      return { nc, nr, nw, nh };
    };
    const onMove = (e) => {
      const { nc, nr, nw, nh } = compute(e);
      setPos({ col: nc, row: nr });
      setSize({ w: nw, h: nh });
    };
    const onUp = (e) => {
      const r = compute(e);
      const nw = snap ? Math.max(1, Math.round(r.nw)) : r.nw;
      const nh = snap ? Math.max(1, Math.round(r.nh)) : r.nh;
      const nc = snap ? Math.round(r.nc) : r.nc;
      const nr = snap ? Math.round(r.nr) : r.nr;
      justResizedRef.current = true;
      setPos({ col: nc, row: nr });
      setSize({ w: nw, h: nh });
      setIsResizing(false);
      onCommitResize?.(character.id, nw, nh, nc, nr);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isResizing, snap, character.id, onCommitResize]);

  const handleClick = (e) => {
    if (movedRef.current) return; // drag, not a click
    // The rotate handle stops propagation on mousedown, so neither branch below ever set up its own
    // "this was a drag" state — the native click that follows a rotation must not fall through to
    // select/deselect logic.
    if (consumeJustFinished()) return;
    if (editingLayer === 'select') {
      if (!isGM || !onToggleSelect) return;
      // Characters are only selectable when the tokens layer is armed (matching the marquee scope);
      // otherwise they're backdrop and the press falls through to the marquee.
      if (imageEditLayer !== 'tokens') return;
      e.stopPropagation();
      // A group drag ends with a native click too; if the pointer moved, this was a drag — skip the
      // toggle (else a multi-token drag would collapse the selection down to just this token).
      const press = groupPressRef.current;
      groupPressRef.current = null;
      if (press && Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) > 3) return;
      onToggleSelect('char', character.id, e.shiftKey);
      return;
    }
    if (editingLayer === 'measure') return; // measuring — a press must not open the character
    e.stopPropagation();
    onSelect?.(character);
  };

  const displayName = character.basicInfo?.name || character.name;
  const displayAvatar = character.avatar || character.basicInfo?.avatar;
  // basicInfo.type is Warhammer-only and starts empty on a fresh character, so a blank type
  // falls back to the system-agnostic isNPC flag rather than silently reading as "ally".
  const isEnemy = character.basicInfo?.type === 'enemy' || (character.isNPC && !character.basicInfo?.type);
  // Group drag: while this token is part of an in-progress group drag, offset its render by the
  // controller's single shared delta (in cells) — pos.col/row stay untouched, the controller
  // commits the real move on mouseup (see useGroupDrag).
  // Grab cursor only when the token is actually draggable in the current context: never while
  // measuring, and in Select mode only when its own (tokens) layer is armed — on another layer a
  // character is backdrop for the marquee, so a move cursor would be misleading.
  const dragEnabledNow = canDrag && editingLayer !== 'measure' && (editingLayer !== 'select' || imageEditLayer === 'tokens');
  const groupDCol = (multiSelected && groupDragDelta) ? groupDragDelta.dCol : 0;
  const groupDRow = (multiSelected && groupDragDelta) ? groupDragDelta.dRow : 0;
  const px = { left: (pos.col + groupDCol) * CELL_SIZE, top: (pos.row + groupDRow) * CELL_SIZE, width: size.w * CELL_SIZE, height: size.h * CELL_SIZE };

  // When a group drag ends, bake the last delta into local pos and skip one prop-sync so the token
  // holds its dropped cell until the batch move round-trips (mirrors justMovedRef on single drag).
  // useLayoutEffect: run before paint so the token never paints a frame at its stale position.
  const prevGroupDeltaRef = useRef(null);
  useLayoutEffect(() => {
    const prev = prevGroupDeltaRef.current;
    prevGroupDeltaRef.current = groupDragDelta;
    if (multiSelected && prev && !groupDragDelta && (prev.dCol !== 0 || prev.dRow !== 0)) {
      justMovedRef.current = true;
      setPos(p => ({ col: p.col + prev.dCol, row: p.row + prev.dRow }));
    }
  }, [groupDragDelta, multiSelected]);

  // GM-only dim: this token's placement is hidden from players (players without the card don't
  // receive it at all). An explicit GM action, so dimming it is always the right signal.
  const hiddenFromPlayers = isGM && hidden;

  return (
    <div
      ref={containerRef}
      className={`map-char-token${isEnemy ? ' map-char-token--enemy' : ''}${selected ? ' map-char-token--selected' : ''}${isDragging ? ' map-char-token--dragging' : ''}${hiddenFromPlayers ? ' map-char-token--hidden' : ''}${multiSelected ? ' map-char-token--multi-selected' : ''}`}
      style={{ position: 'absolute', ...px, cursor: dragEnabledNow ? (isDragging ? 'grabbing' : 'grab') : 'default', pointerEvents: 'auto' }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {/* Snap preview — the cell(s) the token will land in (snap mode only). Positioned in canvas
          space via an offset from the token's continuous drag position. */}
      {isDragging && snap && (
        <div className="token-snap-preview" style={{
          left: (Math.max(0, Math.min(Math.round(pos.col), gridWidth - size.w)) - pos.col) * CELL_SIZE,
          top: (Math.max(0, Math.min(Math.round(pos.row), gridHeight - size.h)) - pos.row) * CELL_SIZE,
          width: size.w * CELL_SIZE,
          height: size.h * CELL_SIZE,
        }} />
      )}

      <div className="map-char-token__avatar" style={{ transform: `rotate(${angle}deg)` }}>
        <Avatar key={displayAvatar || 'default'} src={displayAvatar} />
      </div>
      <span className="map-char-token__name">{displayName}</span>

      {(tokenDisplay || tokenView) && (
        <TokenOverlay
          character={character}
          config={tokenDisplay}
          tokenGear={tokenGear}
          tokenView={tokenView}
          selected={selected}
          canEdit={canDrag}
          isGM={isGM}
          sceneId={sceneId}
          placementId={placementId}
          hidden={hidden}
          gameId={gameId}
          token={token}
          gameSystem={gameSystem}
          width={size.w * CELL_SIZE}
          height={size.h * CELL_SIZE}
        />
      )}

      {showHandles && (
        <>
          <TokenResizeHandles onResizeStart={handleResizeStart} />
          <TokenRotateHandle onRotateStart={handleRotateStart} />
        </>
      )}
    </div>
  );
}

export default MapCharacterToken;
