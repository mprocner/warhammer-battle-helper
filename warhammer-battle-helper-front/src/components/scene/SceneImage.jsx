import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { updateSceneImage, deleteSceneImage, duplicateSceneImage } from '../../api/scenes';
import { resolveFileUrl } from '../../utils/fileUrl';
import SceneImageContextMenu from './SceneImageContextMenu';
import { useZoom } from './ZoomContext';
import { CELL_SIZE } from '../../constants/scene';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import ImageTokenOverlay from '../token-display/ImageTokenOverlay';
import TokenResizeHandles from './TokenResizeHandles';

const RESIZE_HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

const SceneImage = ({ image, isGM, gameId, sceneId, editingLayer, imageEditLayer, gameSystem, selected = false, onSelectImage, tokenPlacementMode = 'snap', onTokenDragMeasureStart, onTokenDragMeasureMove, onTokenDragMeasureEnd, activeTool = null }) => {
  const { t } = useTranslation();
  // In Images ('grid') mode only the armed layer is manipulable; images on other layers
  // are dimmed + inert. Outside grid mode nothing here is armed.
  const isLayerArmed = editingLayer === 'grid' && image.layer === imageEditLayer;
  const isLayerInert = editingLayer === 'grid' && image.layer !== imageEditLayer;
  // A token-layer image can be dragged both when its layer is armed (Images mode) AND in Pan
  // mode (editingLayer null) — like a character token, tokens are the interactive pieces you
  // move around the map. Resize/rotate stay gated to Images mode to avoid clutter; background
  // and GM images are only editable when their layer is armed.
  const canDragImage = isGM && !image.locked && (isLayerArmed || (image.layer === 'tokens' && (editingLayer === null || activeTool === 'pan')));
  const { zoom, gridWidth, gridHeight } = useZoom();
  const [pos, setPos] = useState({ x: image.x, y: image.y });
  const [size, setSize] = useState({ width: image.width, height: image.height });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [rotation, setRotation] = useState(image.rotation || 0);
  const [contextMenu, setContextMenu] = useState(null);

  const dragStartRef = useRef(null);
  const resizeStartRef = useRef(null);
  const rotateStartRef = useRef(null);
  const movedRef = useRef(false); // true once a drag actually moved — suppresses the post-drag select
  const justFinishedDraggingRef = useRef(false);
  const justFinishedResizingRef = useRef(false);
  const justFinishedRotatingRef = useRef(false);
  const containerRef = useRef(null);

  // Sync with props when image updates from server
  useEffect(() => {
    if (!isDragging && !isResizing && !isRotating) {
      if (justFinishedDraggingRef.current) {
        justFinishedDraggingRef.current = false;
        return;
      }
      if (justFinishedResizingRef.current) {
        justFinishedResizingRef.current = false;
        return;
      }
      if (justFinishedRotatingRef.current) {
        justFinishedRotatingRef.current = false;
        return;
      }
      setPos({ x: image.x, y: image.y });
      setSize({ width: image.width, height: image.height });
      setRotation(image.rotation || 0);
    }
  }, [image.x, image.y, image.width, image.height, image.rotation, isDragging, isResizing, isRotating]);

  const savePosition = useCallback(async (newX, newY, newWidth, newHeight) => {
    try {
      const update = {};
      if (newX !== undefined) update.x = newX;
      if (newY !== undefined) update.y = newY;
      if (newWidth !== undefined) update.width = newWidth;
      if (newHeight !== undefined) update.height = newHeight;
      await updateSceneImage(gameId, sceneId, image.id, update);
    } catch (err) {
      console.error('Failed to update scene image:', err);
    }
  }, [gameId, sceneId, image.id]);

  // In snap mode, token-layer images quantize to whole cells on commit (drag/resize end).
  // Free mode and non-token layers stay pixel-precise. Snap belongs to the shared geometry,
  // so it works in the same cell units the future unified renderer will use.
  const snapEnabled = image.layer === 'tokens' && tokenPlacementMode === 'snap';
  const snapCoord = useCallback((v) => (snapEnabled ? Math.round(v / CELL_SIZE) * CELL_SIZE : v), [snapEnabled]);
  const snapDim = useCallback((v) => (snapEnabled ? Math.max(CELL_SIZE, Math.round(v / CELL_SIZE) * CELL_SIZE) : v), [snapEnabled]);

  // --- Drag ---
  const handleMouseDown = useCallback((e) => {
    if (!canDragImage || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    movedRef.current = false;
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: pos.x,
      startY: pos.y,
      z: zoom,
      maxX: Math.max(0, gridWidth * CELL_SIZE - size.width),
      maxY: Math.max(0, gridHeight * CELL_SIZE - size.height),
    };
    // Live distance readout from the grab point (token center) to the current position.
    // snapCoord quantizes to the cell in snap mode (identity otherwise) → ruler steps cell-to-cell.
    onTokenDragMeasureStart?.({ col: (snapCoord(pos.x) + size.width / 2) / CELL_SIZE, row: (snapCoord(pos.y) + size.height / 2) / CELL_SIZE });
  }, [canDragImage, pos, zoom, size, gridWidth, gridHeight, snapCoord, onTokenDragMeasureStart]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const { mouseX, mouseY, startX, startY, z, maxX, maxY } = dragStartRef.current;
      if (Math.abs(e.clientX - mouseX) + Math.abs(e.clientY - mouseY) > 3) movedRef.current = true;
      const x = Math.max(0, Math.min(startX + (e.clientX - mouseX) / z, maxX));
      const y = Math.max(0, Math.min(startY + (e.clientY - mouseY) / z, maxY));
      setPos({ x, y });
      onTokenDragMeasureMove?.({ col: (snapCoord(x) + size.width / 2) / CELL_SIZE, row: (snapCoord(y) + size.height / 2) / CELL_SIZE });
    };

    const handleMouseUpFinal = (e) => {
      const { mouseX, mouseY, startX, startY, z, maxX, maxY } = dragStartRef.current;
      const finalX = snapCoord(Math.max(0, Math.min(startX + (e.clientX - mouseX) / z, maxX)));
      const finalY = snapCoord(Math.max(0, Math.min(startY + (e.clientY - mouseY) / z, maxY)));
      setPos({ x: finalX, y: finalY });
      justFinishedDraggingRef.current = true;
      setIsDragging(false);
      onTokenDragMeasureEnd?.();
      savePosition(finalX, finalY, undefined, undefined);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUpFinal);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUpFinal);
    };
  }, [isDragging, savePosition, snapCoord, size, onTokenDragMeasureMove, onTokenDragMeasureEnd]);

  // --- Resize ---
  const handleResizeStart = useCallback((e, handle) => {
    if (!isGM || image.locked) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = {
      handle,
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: pos.x,
      startY: pos.y,
      startW: size.width,
      startH: size.height,
      z: zoom,
      rad: rotation * Math.PI / 180,
    };
  }, [isGM, pos, size, zoom, image.locked, rotation]);

  useEffect(() => {
    if (!isResizing) return;

    const computeResize = (e) => {
      const { handle, mouseX, mouseY, startX, startY, startW, startH, z, rad } = resizeStartRef.current;
      const cosR = Math.cos(rad);
      const sinR = Math.sin(rad);
      const dxScreen = (e.clientX - mouseX) / z;
      const dyScreen = (e.clientY - mouseY) / z;
      // Project screen-space delta onto image local axes
      const dx = dxScreen * cosR + dyScreen * sinR;
      const dy = -dxScreen * sinR + dyScreen * cosR;

      let newW = startW, newH = startH;
      // dcx/dcy: how much the image center must move in scene space
      // so that the opposite edge stays fixed (CSS rotates around center)
      let dcx = 0, dcy = 0;

      if (handle.includes('e')) {
        newW = Math.max(20, startW + dx);
        const dw = newW - startW;
        dcx += dw / 2 * cosR; dcy += dw / 2 * sinR;
      }
      if (handle.includes('w')) {
        newW = Math.max(20, startW - dx);
        const dw = newW - startW;
        dcx -= dw / 2 * cosR; dcy -= dw / 2 * sinR;
      }
      if (handle.includes('s')) {
        newH = Math.max(20, startH + dy);
        const dh = newH - startH;
        dcx += dh / 2 * (-sinR); dcy += dh / 2 * cosR;
      }
      if (handle.includes('n')) {
        newH = Math.max(20, startH - dy);
        const dh = newH - startH;
        dcx -= dh / 2 * (-sinR); dcy -= dh / 2 * cosR;
      }

      // New top-left = new center − half the new size
      const newX = startX + startW / 2 + dcx - newW / 2;
      const newY = startY + startH / 2 + dcy - newH / 2;
      return { newX, newY, newW, newH };
    };

    const handleMouseMove = (e) => {
      const { newX, newY, newW, newH } = computeResize(e);
      setPos({ x: newX, y: newY });
      setSize({ width: newW, height: newH });
    };

    const handleMouseUp = (e) => {
      const raw = computeResize(e);
      const newW = snapDim(raw.newW);
      const newH = snapDim(raw.newH);
      const newX = snapCoord(raw.newX);
      const newY = snapCoord(raw.newY);

      setPos({ x: newX, y: newY });
      setSize({ width: newW, height: newH });
      justFinishedResizingRef.current = true;
      setIsResizing(false);
      savePosition(newX, newY, newW, newH);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, savePosition, snapCoord, snapDim]);

  // --- Rotate ---
  const saveRotation = useCallback(async (newRotation) => {
    try {
      await updateSceneImage(gameId, sceneId, image.id, { rotation: newRotation });
    } catch (err) {
      console.error('Failed to update scene image rotation:', err);
    }
  }, [gameId, sceneId, image.id]);

  const handleRotateStart = useCallback((e) => {
    if (!isGM || image.locked) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    rotateStartRef.current = { centerX, centerY, startAngle, startRotation: rotation };
    setIsRotating(true);
  }, [isGM, image.locked, rotation]);

  useEffect(() => {
    if (!isRotating) return;

    const onMove = (e) => {
      const { centerX, centerY, startAngle, startRotation } = rotateStartRef.current;
      const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
      setRotation(startRotation + (currentAngle - startAngle));
    };

    const onUp = (e) => {
      const { centerX, centerY, startAngle, startRotation } = rotateStartRef.current;
      const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
      const finalRotation = startRotation + (currentAngle - startAngle);
      setRotation(finalRotation);
      justFinishedRotatingRef.current = true;
      setIsRotating(false);
      saveRotation(finalRotation);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isRotating, saveRotation]);

  // --- Context menu ---
  const handleContextMenu = useCallback((e) => {
    if (!isGM) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, [isGM]);

  const isToken = image.layer === 'tokens';

  // --- Click-to-select (GM only) ---
  // GM click selects any image so it can be deleted via keyboard. For a tokens-layer image
  // selecting also expands its ring (a GM editing affordance); players can't select, so their
  // visible slots/HP stay in the rest ("sun") position on the token.
  // Gated to non-drawing context (default or pan) — same condition as token drag/ring — so tool
  // clicks aren't hijacked. A real drag ends with a native click too, so ignore the click right
  // after a drag (movedRef / isDragging).
  const handleClick = useCallback((e) => {
    if (!isGM || !onSelectImage) return;
    if (!(editingLayer === null || activeTool === 'pan')) return;
    if (movedRef.current || isDragging) return;
    e.stopPropagation();
    onSelectImage(image.id);
  }, [isGM, onSelectImage, editingLayer, activeTool, isDragging, image.id]);

  const handleZIndexChange = async (newZIndex) => {
    try {
      await updateSceneImage(gameId, sceneId, image.id, { zIndex: newZIndex });
    } catch (err) {
      console.error('Failed to update z-index:', err);
    }
    setContextMenu(null);
  };

  const handleLayerChange = async (newLayer) => {
    try {
      await updateSceneImage(gameId, sceneId, image.id, { layer: newLayer });
    } catch (err) {
      console.error('Failed to change layer:', err);
    }
    setContextMenu(null);
  };

  const handleDelete = async () => {
    try {
      await deleteSceneImage(gameId, sceneId, image.id);
    } catch (err) {
      console.error('Failed to delete scene image:', err);
    }
    setContextMenu(null);
  };

  const handleDuplicate = async (count) => {
    try {
      await duplicateSceneImage(gameId, sceneId, image.id, count);
    } catch (err) {
      console.error('Failed to duplicate scene image:', err);
    }
    setContextMenu(null);
  };

  const handleLockToggle = async () => {
    try {
      await updateSceneImage(gameId, sceneId, image.id, { locked: !image.locked });
    } catch (err) {
      console.error('Failed to toggle image lock:', err);
    }
    setContextMenu(null);
  };

  const handleResetRotation = async () => {
    setRotation(0);
    await saveRotation(0);
    setContextMenu(null);
  };

  const handleResizeToGrid = () => {
    const newX = 0;
    const newY = 0;
    const newWidth = gridWidth * CELL_SIZE;
    const newHeight = gridHeight * CELL_SIZE;

    setPos({ x: newX, y: newY });
    setSize({ width: newWidth, height: newHeight });
    savePosition(newX, newY, newWidth, newHeight);
    setContextMenu(null);
  };

  const cursorMap = {
    n: 'ns-resize', s: 'ns-resize',
    e: 'ew-resize', w: 'ew-resize',
    ne: 'nesw-resize', sw: 'nesw-resize',
    nw: 'nwse-resize', se: 'nwse-resize',
  };

  return (
    <>
      <div
        ref={containerRef}
        className={`scene-image ${isGM ? 'scene-image--editable' : ''} ${isDragging ? 'scene-image--dragging' : ''} ${image.layer === 'gm' ? 'scene-image--gm' : ''} ${isToken ? 'scene-image--token' : ''} ${selected ? 'scene-image--selected' : ''} ${image.locked ? 'scene-image--locked' : ''} ${isLayerInert ? 'scene-image--inert' : ''} ${image.hidden ? 'scene-image--hidden' : ''}`}
        style={{
          position: 'absolute',
          left: pos.x,
          top: pos.y,
          width: size.width,
          height: size.height,
          zIndex: image.zIndex || 0,
          pointerEvents: 'auto',
          cursor: canDragImage ? (isDragging ? 'grabbing' : 'grab') : (isGM && (editingLayer === null || activeTool === 'pan') ? 'pointer' : 'default'),
          transform: `rotate(${rotation}deg)`,
        }}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Snap preview — the grid cell the token image will land in (snap mode only). */}
        {isDragging && snapEnabled && (
          <div className="token-snap-preview" style={{
            left: Math.round(pos.x / CELL_SIZE) * CELL_SIZE - pos.x,
            top: Math.round(pos.y / CELL_SIZE) * CELL_SIZE - pos.y,
            width: size.width,
            height: size.height,
          }} />
        )}

        <img
          src={resolveFileUrl(image.fileUrl)}
          alt={image.fileName}
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'fill',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />

        {/* GM layer badge */}
        {image.layer === 'gm' && (
          <span className="scene-image__gm-badge">{t('scenes.gmBadge')}</span>
        )}

        {/* States/HP ring for tokens-layer images */}
        {isToken && (
          <ImageTokenOverlay
            image={image}
            gameId={gameId}
            sceneId={sceneId}
            selected={selected}
            canEdit={isGM}
            gameSystem={gameSystem}
          />
        )}

        {/* Lock badge (GM only) */}
        {isGM && image.locked && (
          <span className="scene-image__lock-badge">🔒</span>
        )}

        {/* Background/GM images: full editor (8 handles + rotate) on the armed image layer. */}
        {!isToken && isGM && !image.locked && isLayerArmed && RESIZE_HANDLES.map(handle => (
          <div
            key={handle}
            className={`scene-image__handle scene-image__handle--${handle}`}
            style={{ cursor: cursorMap[handle] }}
            onMouseDown={(e) => handleResizeStart(e, handle)}
          />
        ))}
        {!isToken && isGM && !image.locked && isLayerArmed && (
          <div
            className="scene-image__rotate-handle"
            onMouseDown={handleRotateStart}
            title={t('scenes.rotateImage')}
          >
            <RotateRightIcon style={{ fontSize: 14 }} />
          </div>
        )}

        {/* Token images: the SAME shared resize handles as character tokens (selected, in the
            token-manipulation context — default or pan tool). No rotate, matching characters. */}
        {isToken && selected && isGM && !image.locked && (editingLayer === null || activeTool === 'pan') && (
          <TokenResizeHandles onResizeStart={handleResizeStart} />
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <SceneImageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          image={image}
          onZIndexChange={handleZIndexChange}
          onLayerChange={handleLayerChange}
          onDelete={handleDelete}
          onResizeToGrid={handleResizeToGrid}
          onResetRotation={handleResetRotation}
          onLockToggle={handleLockToggle}
          onDuplicate={handleDuplicate}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
};

export default SceneImage;
