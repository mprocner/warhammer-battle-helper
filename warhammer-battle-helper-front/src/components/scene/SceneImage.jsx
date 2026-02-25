import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { updateSceneImage, deleteSceneImage } from '../../api/scenes';
import { getApiUrl } from '../../api/axios';
import SceneImageContextMenu from './SceneImageContextMenu';
import { useZoom } from './ZoomContext';
import { CELL_SIZE } from '../../constants/scene';

const getFileUrl = (fileUrl) => {
  if (!fileUrl) return '';
  return fileUrl.startsWith('http') ? fileUrl : `${getApiUrl()}${fileUrl}`;
};

const RESIZE_HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

const SceneImage = ({ image, isGM, gameId, sceneId }) => {
  const { t } = useTranslation();
  const { zoom, gridWidth, gridHeight } = useZoom();
  const [pos, setPos] = useState({ x: image.x, y: image.y });
  const [size, setSize] = useState({ width: image.width, height: image.height });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);

  const dragStartRef = useRef(null);
  const resizeStartRef = useRef(null);
  const justFinishedDraggingRef = useRef(false);
  const justFinishedResizingRef = useRef(false);

  // Sync with props when image updates from server
  useEffect(() => {
    if (!isDragging && !isResizing) {
      if (justFinishedDraggingRef.current) {
        justFinishedDraggingRef.current = false;
        return;
      }
      if (justFinishedResizingRef.current) {
        justFinishedResizingRef.current = false;
        return;
      }
      setPos({ x: image.x, y: image.y });
      setSize({ width: image.width, height: image.height });
    }
  }, [image.x, image.y, image.width, image.height, isDragging, isResizing]);

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

  // --- Drag ---
  const handleMouseDown = useCallback((e) => {
    if (!isGM || e.button !== 0 || image.locked) return;
    e.preventDefault();
    e.stopPropagation();
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
  }, [isGM, pos, zoom, image.locked, size, gridWidth, gridHeight]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const { mouseX, mouseY, startX, startY, z, maxX, maxY } = dragStartRef.current;
      setPos({
        x: Math.max(0, Math.min(startX + (e.clientX - mouseX) / z, maxX)),
        y: Math.max(0, Math.min(startY + (e.clientY - mouseY) / z, maxY)),
      });
    };

    const handleMouseUpFinal = (e) => {
      const { mouseX, mouseY, startX, startY, z, maxX, maxY } = dragStartRef.current;
      const finalX = Math.max(0, Math.min(startX + (e.clientX - mouseX) / z, maxX));
      const finalY = Math.max(0, Math.min(startY + (e.clientY - mouseY) / z, maxY));
      setPos({ x: finalX, y: finalY });
      justFinishedDraggingRef.current = true;
      setIsDragging(false);
      savePosition(finalX, finalY, undefined, undefined);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUpFinal);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUpFinal);
    };
  }, [isDragging, savePosition]);

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
    };
  }, [isGM, pos, size, zoom, image.locked]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      const { handle, mouseX, mouseY, startX, startY, startW, startH, z } = resizeStartRef.current;
      const dx = (e.clientX - mouseX) / z;
      const dy = (e.clientY - mouseY) / z;

      let newX = startX, newY = startY, newW = startW, newH = startH;

      if (handle.includes('e')) newW = Math.max(20, startW + dx);
      if (handle.includes('w')) { newW = Math.max(20, startW - dx); newX = startX + dx; }
      if (handle.includes('s')) newH = Math.max(20, startH + dy);
      if (handle.includes('n')) { newH = Math.max(20, startH - dy); newY = startY + dy; }

      setPos({ x: newX, y: newY });
      setSize({ width: newW, height: newH });
    };

    const handleMouseUp = (e) => {
      const { handle, mouseX, mouseY, startX, startY, startW, startH, z } = resizeStartRef.current;
      const dx = (e.clientX - mouseX) / z;
      const dy = (e.clientY - mouseY) / z;

      let newX = startX, newY = startY, newW = startW, newH = startH;
      if (handle.includes('e')) newW = Math.max(20, startW + dx);
      if (handle.includes('w')) { newW = Math.max(20, startW - dx); newX = startX + dx; }
      if (handle.includes('s')) newH = Math.max(20, startH + dy);
      if (handle.includes('n')) { newH = Math.max(20, startH - dy); newY = startY + dy; }

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
  }, [isResizing, savePosition]);

  // --- Context menu ---
  const handleContextMenu = useCallback((e) => {
    if (!isGM) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, [isGM]);

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

  const handleLockToggle = async () => {
    try {
      await updateSceneImage(gameId, sceneId, image.id, { locked: !image.locked });
    } catch (err) {
      console.error('Failed to toggle image lock:', err);
    }
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
        className={`scene-image ${isDragging ? 'scene-image--dragging' : ''} ${image.layer === 'gm' ? 'scene-image--gm' : ''} ${image.locked ? 'scene-image--locked' : ''}`}
        style={{
          position: 'absolute',
          left: pos.x,
          top: pos.y,
          width: size.width,
          height: size.height,
          zIndex: image.zIndex || 0,
          pointerEvents: 'auto',
          cursor: isGM ? (image.locked ? 'default' : isDragging ? 'grabbing' : 'grab') : 'default',
        }}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
      >
        <img
          src={getFileUrl(image.fileUrl)}
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

        {/* Lock badge (GM only) */}
        {isGM && image.locked && (
          <span className="scene-image__lock-badge">🔒</span>
        )}

        {/* Resize handles (GM only, only when unlocked) */}
        {isGM && !image.locked && RESIZE_HANDLES.map(handle => (
          <div
            key={handle}
            className={`scene-image__handle scene-image__handle--${handle}`}
            style={{ cursor: cursorMap[handle] }}
            onMouseDown={(e) => handleResizeStart(e, handle)}
          />
        ))}
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
          onLockToggle={handleLockToggle}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
};

export default SceneImage;
