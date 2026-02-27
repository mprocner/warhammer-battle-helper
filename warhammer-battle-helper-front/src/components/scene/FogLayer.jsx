import React, { useRef, useEffect, useCallback } from 'react';

/**
 * FogLayer — a canvas element that renders fog of war on top of the scene.
 *
 * Rendering strategy:
 *  1. Fill canvas with the fog colour (dark, semi-transparent).
 *  2. For every saved reveal path use `destination-out` composite operation
 *     to "erase" the fog and show the content underneath.
 *  3. While the GM is actively drawing (currentPath), re-render with the
 *     in-progress stroke on top so feedback is instant.
 *
 * Coordinate space:
 *  All points are stored/communicated in *scene space* (same as image/character
 *  coordinates).  The canvas is sized to match the scene canvas exactly and sits
 *  at position:absolute inside scene-viewport__content, so no extra transform
 *  is needed — CSS zoom/scale handles the rest.
 */
const FogLayer = ({
  scene,
  isGM,
  editingLayer,
  brushSize = 30,
  fogTool = 'freehand',
  fogCoverMode = false,
  onPathComplete,
  canvasWidth,
  canvasHeight,
}) => {
  const canvasRef = useRef(null);
  const currentPathRef = useRef(null); // points being drawn right now
  const rectStartRef = useRef(null);   // start point for rectangle tool
  const isDrawingRef = useRef(false);
  const cursorPosRef = useRef(null);   // current cursor position in scene coords

  const fogEnabled = scene?.fogEnabled || false;
  const fogOpacity = scene?.fogOpacity || 0.85;
  const isEditingFog = isGM && editingLayer === 'fog';

  // Render the full fog canvas (saved paths + optional in-progress path)
  const render = useCallback((extraPath = null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const savedPaths = scene?.revealPaths || [];

    // --- 1. Fill with solid fog (opacity applied via canvas CSS) ---
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(20, 20, 20, 1.0)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // --- 2. Process paths in order: reveal = destination-out, cover = source-over ---
    const allPaths = extraPath ? [...savedPaths, extraPath] : savedPaths;
    allPaths.forEach((path) => {
      if (!path.points || path.points.length < 2) return;

      if (path.cover) {
        // Cover mode: paint solid fog back
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(20, 20, 20, 1.0)';
        ctx.strokeStyle = 'rgba(20, 20, 20, 1.0)';
      } else {
        // Reveal mode: erase fog
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      }

      if (path.shape === 'rect') {
        const x = Math.min(path.points[0][0], path.points[1][0]);
        const y = Math.min(path.points[0][1], path.points[1][1]);
        const w = Math.abs(path.points[1][0] - path.points[0][0]);
        const h = Math.abs(path.points[1][1] - path.points[0][1]);
        ctx.fillRect(x, y, w, h);
      } else if (path.shape === 'circle') {
        const [cx, cy] = path.points[0];
        const [ex, ey] = path.points[1];
        const radius = Math.hypot(ex - cx, ey - cy);
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.lineWidth = path.brushSize || 30;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(path.points[0][0], path.points[0][1]);
        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i][0], path.points[i][1]);
        }
        ctx.stroke();
      }
    });

    ctx.globalCompositeOperation = 'source-over';

    // --- 3. Draw brush cursor circle (freehand only, when GM is editing) ---
    if (isEditingFog && fogTool === 'freehand' && cursorPosRef.current) {
      const [cx, cy] = cursorPosRef.current;
      const radius = brushSize / 2;
      // Dark outer ring
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.lineWidth = 3;
      ctx.stroke();
      // White inner ring
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }, [scene?.revealPaths, isEditingFog, scene, fogTool, brushSize]);

  // Re-render whenever saved paths or editing mode change
  useEffect(() => {
    render(currentPathRef.current ? { points: currentPathRef.current, brushSize } : null);
  }, [render, brushSize]);

  // Helpers — convert mouse event to scene-space coords
  const getSceneCoords = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY];
  }, []);

  // Mouse event handlers — only active when GM is editing fog layer
  const handleMouseDown = useCallback((e) => {
    if (!isEditingFog) return;
    e.preventDefault();
    e.stopPropagation();

    const [x, y] = getSceneCoords(e);
    isDrawingRef.current = true;

    if (fogTool === 'rect' || fogTool === 'line' || fogTool === 'circle') {
      rectStartRef.current = [x, y];
      currentPathRef.current = [[x, y], [x, y]];
    } else {
      currentPathRef.current = [[x, y]];
    }
  }, [isEditingFog, fogTool, getSceneCoords]);

  const handleMouseMove = useCallback((e) => {
    if (!isEditingFog) return;
    e.preventDefault();

    const [x, y] = getSceneCoords(e);
    cursorPosRef.current = [x, y];

    if (isDrawingRef.current) {
      if (fogTool === 'rect' || fogTool === 'line' || fogTool === 'circle') {
        currentPathRef.current = [rectStartRef.current, [x, y]];
        const shape = fogTool === 'rect' ? 'rect' : fogTool === 'circle' ? 'circle' : 'freehand';
        render({ points: currentPathRef.current, brushSize, shape, cover: fogCoverMode });
      } else {
        currentPathRef.current.push([x, y]);
        render({ points: currentPathRef.current, brushSize, cover: fogCoverMode });
      }
    } else if (fogTool === 'freehand') {
      // Not drawing — redraw to update cursor circle position
      render(null);
    }
  }, [isEditingFog, fogTool, fogCoverMode, getSceneCoords, render, brushSize]);

  const handleMouseUp = useCallback((e) => {
    if (!isDrawingRef.current || !isEditingFog) return;
    e.preventDefault();

    isDrawingRef.current = false;
    const pts = currentPathRef.current;
    currentPathRef.current = null;
    rectStartRef.current = null;

    if (pts && pts.length >= 2 && onPathComplete) {
      let shape = 'freehand';
      if (fogTool === 'rect') shape = 'rect';
      else if (fogTool === 'circle') shape = 'circle';
      onPathComplete({ points: pts, brushSize, shape, cover: fogCoverMode });
    }
  }, [isEditingFog, fogTool, fogCoverMode, onPathComplete, brushSize]);

  const handleMouseLeave = useCallback((e) => {
    cursorPosRef.current = null;
    if (isDrawingRef.current) {
      handleMouseUp(e);
    } else {
      render(null);
    }
  }, [handleMouseUp, render]);

  // GM: only when actively editing the fog layer
  // Players: only when fog is enabled by GM
  if (isGM && !isEditingFog) return null;
  if (!isGM && !fogEnabled) return null;

  // CSS opacity: players see full fog; GM sees 50% in edit mode, fogOpacity otherwise
  const cssOpacity = !isGM ? 1.0 : isEditingFog ? 0.5 : fogOpacity;

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 20,
        opacity: cssOpacity,
        pointerEvents: isEditingFog ? 'auto' : 'none',
        cursor: isEditingFog ? (fogTool === 'freehand' ? 'none' : 'crosshair') : 'default',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    />
  );
};

export default FogLayer;
