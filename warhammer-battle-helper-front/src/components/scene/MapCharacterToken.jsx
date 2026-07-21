import React, { useState, useEffect, useRef, useCallback } from 'react';
import Avatar from '../Avatar';
import TokenOverlay from '../token-display/TokenOverlay';
import TokenResizeHandles from './TokenResizeHandles';
import { useZoom } from './ZoomContext';
import { CELL_SIZE } from '../../constants/scene';

// A character token on the unified tokens layer: absolute-positioned, with its own drag/resize
// (the same zoom-aware math as SceneImage). Movement stays snapped to whole cells in snap mode,
// matching the existing grid data flow; resize grows in whole cells.
function MapCharacterToken({
  character, col, row, w, h,
  isGM = false, isMultiplayer = false, canDrag = true, selected = false,
  tokenPlacementMode = 'snap', tokenDisplay = null, gameId = null, token = null,
  editingLayer = null, activeTool = null,
  onSelect, onCommitMove, onCommitResize,
  onTokenDragMeasureStart, onTokenDragMeasureMove, onTokenDragMeasureEnd,
}) {
  const { zoom, gridWidth, gridHeight } = useZoom();
  const [pos, setPos] = useState({ col, row });
  const [size, setSize] = useState({ w, h });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const dragStartRef = useRef(null);
  const resizeStartRef = useRef(null);
  const movedRef = useRef(false);
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

  const snap = tokenPlacementMode === 'snap';

  // --- Drag ---
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    // Presses on a resize handle or on the states/HP overlay must not start a drag.
    if (e.target.closest('.map-char-token__handle') || e.target.closest('.token-overlay')) return;
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
  }, [canDrag, pos, size, zoom, gridWidth, gridHeight, snap, onTokenDragMeasureStart]);

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
  const canResize = (isGM || canDrag) && (!editingLayer || activeTool === 'pan');
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
    e.stopPropagation();
    onSelect?.(character);
  };

  const displayName = character.basicInfo?.name || character.name;
  const displayAvatar = character.avatar || character.basicInfo?.avatar;
  const isEnemy = character.basicInfo?.type === 'enemy' || (character.isNPC && !character.basicInfo);
  const px = { left: pos.col * CELL_SIZE, top: pos.row * CELL_SIZE, width: size.w * CELL_SIZE, height: size.h * CELL_SIZE };

  return (
    <div
      className={`map-char-token${isEnemy ? ' map-char-token--enemy' : ''}${selected ? ' map-char-token--selected' : ''}${isDragging ? ' map-char-token--dragging' : ''}`}
      style={{ position: 'absolute', ...px, cursor: canDrag ? (isDragging ? 'grabbing' : 'grab') : 'pointer', pointerEvents: 'auto' }}
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

      <div className="map-char-token__avatar">
        <Avatar key={displayAvatar || 'default'} src={displayAvatar} />
      </div>
      <span className="map-char-token__name">{displayName}</span>

      {tokenDisplay && (
        <TokenOverlay
          character={character}
          config={tokenDisplay}
          selected={selected}
          canEditToken={canDrag}
          canEdit={canDrag}
          gameId={gameId}
          token={token}
          width={size.w * CELL_SIZE}
          height={size.h * CELL_SIZE}
        />
      )}

      {canResize && selected && <TokenResizeHandles onResizeStart={handleResizeStart} />}
    </div>
  );
}

export default MapCharacterToken;
