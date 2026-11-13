import React, { useState, useRef, useEffect, useCallback } from 'react';
import useKeyboardShortcut from '../../shortcuts/useKeyboardShortcut';
import { drawText, drawTextHighlight, ensureTextFont, hitTestText, isTextFontReady } from './drawingText';

/**
 * DrawingLayer — canvas for freehand annotations visible to all participants.
 *
 * Rendering strategy (source-over, unlike fog's destination-out):
 *  1. Clear canvas.
 *  2. Draw every saved path with its own colour/tool.
 *  3. During mouse drag, re-render with the in-progress path on top (live preview).
 *  4. If a path is selected, draw a cyan dashed highlight over it.
 *
 * Tool encoding:
 *  - freehand: polyline [[x,y], ...]
 *  - line, arrow: [[x0,y0], [x1,y1]]
 *  - rect: [[topLeft], [bottomRight]]
 *  - circle: [[cx,cy], [edgeX,edgeY]] — radius = hypot(edge - center)
 *  - text: [[x,y]] — top-left of the first line and the rotation pivot (see drawingText.js)
 *  - select: no drawing — click to select/deselect paths; drag a label to move it,
 *    double-click a label to edit it
 *
 * Text tool: a click on a label the user may edit opens it for editing (onEditText); a click
 * elsewhere places a new one (onTextPlacement).
 *
 * Right button (every tool): deletes the topmost path under the cursor that the user may
 * delete, or abandons the in-progress shape when pressed mid-stroke.
 * Hover: the same path the right button would delete gets a faint cyan glow.
 *
 * Coordinate space: scene space (identical to FogLayer).
 */

// Point-to-segment distance helper
function distPointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Hit-test a path at scene point (px, py)
function hitTestPath(path, px, py, tolerance = 10) {
  if (!path || !path.points || path.points.length === 0) return false;

  switch (path.tool) {
    case 'freehand': {
      if (path.points.length < 2) return false;
      for (let i = 1; i < path.points.length; i++) {
        if (distPointToSegment(px, py, path.points[i - 1][0], path.points[i - 1][1], path.points[i][0], path.points[i][1]) <= tolerance) return true;
      }
      return false;
    }
    case 'line':
    case 'arrow': {
      if (path.points.length < 2) return false;
      return distPointToSegment(px, py, path.points[0][0], path.points[0][1], path.points[1][0], path.points[1][1]) <= tolerance;
    }
    case 'rect': {
      if (path.points.length < 2) return false;
      const x1 = Math.min(path.points[0][0], path.points[1][0]);
      const y1 = Math.min(path.points[0][1], path.points[1][1]);
      const x2 = Math.max(path.points[0][0], path.points[1][0]);
      const y2 = Math.max(path.points[0][1], path.points[1][1]);
      return (
        (Math.abs(px - x1) <= tolerance && py >= y1 && py <= y2) ||
        (Math.abs(px - x2) <= tolerance && py >= y1 && py <= y2) ||
        (Math.abs(py - y1) <= tolerance && px >= x1 && px <= x2) ||
        (Math.abs(py - y2) <= tolerance && px >= x1 && px <= x2)
      );
    }
    case 'circle': {
      if (path.points.length < 2) return false;
      const [cx, cy] = path.points[0];
      const [ex, ey] = path.points[1];
      const radius = Math.hypot(ex - cx, ey - cy);
      return Math.abs(Math.hypot(px - cx, py - cy) - radius) <= tolerance;
    }
    case 'text':
      return hitTestText(path, px, py);
    default:
      return false;
  }
}

// Topmost path under (px, py) that the caller is allowed to delete.
// Paths the predicate rejects are skipped, not treated as blockers — a player
// right-clicking through the GM's line still reaches their own drawing beneath it.
export function findDeletablePathAt(paths, px, py, canDelete) {
  for (let i = paths.length - 1; i >= 0; i--) {
    const path = paths[i];
    if (!canDelete(path)) continue;
    if (hitTestPath(path, px, py)) return path.id;
  }
  return null;
}

// Topmost text label under (px, py) that the caller may edit — same skip rule as deletion.
export function findEditableTextAt(paths, px, py, canEdit) {
  for (let i = paths.length - 1; i >= 0; i--) {
    const path = paths[i];
    if (path.tool !== 'text' || !canEdit(path)) continue;
    if (hitTestPath(path, px, py)) return path;
  }
  return null;
}

// Pointer travel (scene px) before a press on a label becomes a move rather than a click.
const MOVE_THRESHOLD = 3;

const DrawingLayer = ({
  scene,
  isDrawingMode,
  activeTool = 'freehand',
  brushSize = 3,
  color,
  fontSize = 16,
  onPathComplete,
  onTextPlacement,
  onEditText,
  onMoveText,
  hiddenPathId = null,
  pathOverride = null,
  selectedPathId = null,
  onSelectionChange,
  onDeletePath,
  userId = null,
  isGM = false,
  canvasWidth,
  canvasHeight,
}) => {
  const canvasRef = useRef(null);
  const currentPathRef = useRef(null);
  const shapeStartRef = useRef(null);
  const isDrawingRef = useRef(false);
  // A press on a label in the select tool: { id, start, origin, offset } — offset is null until
  // the pointer has travelled past MOVE_THRESHOLD.
  const textDragRef = useRef(null);
  const [hoveredPathId, setHoveredPathId] = useState(null);
  // Bumped when a label font finishes loading, so the canvas repaints with the real face.
  const [fontTick, setFontTick] = useState(0);

  useEffect(() => {
    const pending = (scene?.drawingPaths || []).filter(p => p.tool === 'text' && !isTextFontReady(p));
    if (pending.length === 0) return undefined;
    let alive = true;
    Promise.all(pending.map(ensureTextFont)).then(() => { if (alive) setFontTick(t => t + 1); });
    return () => { alive = false; };
  }, [scene?.drawingPaths]);

  // Leaving drawing mode drops the hover — the canvas stops receiving mouse events,
  // so there would be no later event to clear it.
  useEffect(() => {
    if (!isDrawingMode) setHoveredPathId(null);
  }, [isDrawingMode]);

  // Draw a single path onto the given context
  const drawPath = useCallback((ctx, path) => {
    if (!path || !path.points || path.points.length === 0) return;

    ctx.save();
    ctx.strokeStyle = path.color || '#ff0000';
    ctx.fillStyle = path.color || '#ff0000';
    ctx.lineWidth = path.brushSize || 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (path.tool) {
      case 'freehand': {
        if (path.points.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(path.points[0][0], path.points[0][1]);
        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i][0], path.points[i][1]);
        }
        ctx.stroke();
        break;
      }
      case 'line': {
        if (path.points.length < 2) break;
        const [x0, y0] = path.points[0];
        const [x1, y1] = path.points[1];
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        break;
      }
      case 'rect': {
        if (path.points.length < 2) break;
        const rx = Math.min(path.points[0][0], path.points[1][0]);
        const ry = Math.min(path.points[0][1], path.points[1][1]);
        const rw = Math.abs(path.points[1][0] - path.points[0][0]);
        const rh = Math.abs(path.points[1][1] - path.points[0][1]);
        ctx.strokeRect(rx, ry, rw, rh);
        break;
      }
      case 'circle': {
        if (path.points.length < 2) break;
        const [cx, cy] = path.points[0];
        const [ex, ey] = path.points[1];
        const radius = Math.hypot(ex - cx, ey - cy);
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'arrow': {
        if (path.points.length < 2) break;
        const [ax0, ay0] = path.points[0];
        const [ax1, ay1] = path.points[1];
        ctx.beginPath();
        ctx.moveTo(ax0, ay0);
        ctx.lineTo(ax1, ay1);
        ctx.stroke();
        const angle = Math.atan2(ay1 - ay0, ax1 - ax0);
        const headLen = Math.max(10, (path.brushSize || 3) * 4);
        ctx.beginPath();
        ctx.moveTo(ax1, ay1);
        ctx.lineTo(
          ax1 - headLen * Math.cos(angle - Math.PI / 7),
          ay1 - headLen * Math.sin(angle - Math.PI / 7)
        );
        ctx.moveTo(ax1, ay1);
        ctx.lineTo(
          ax1 - headLen * Math.cos(angle + Math.PI / 7),
          ay1 - headLen * Math.sin(angle + Math.PI / 7)
        );
        ctx.stroke();
        break;
      }
      case 'text':
        drawText(ctx, path);
        break;
      default:
        break;
    }
    ctx.restore();
  }, []);

  // Cyan glow over a path. Selection is bright and dashed; hover is faint and solid.
  const drawHighlight = useCallback((ctx, path, { alpha = 0.7, dashed = true } = {}) => {
    if (!path || !path.points || path.points.length === 0) return;
    ctx.save();
    ctx.strokeStyle = '#00e5ff';
    ctx.fillStyle = '#00e5ff';
    ctx.lineWidth = (path.brushSize || 3) + 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dashed ? [8, 4] : []);
    ctx.globalAlpha = alpha;

    switch (path.tool) {
      case 'freehand': {
        if (path.points.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(path.points[0][0], path.points[0][1]);
        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i][0], path.points[i][1]);
        }
        ctx.stroke();
        break;
      }
      case 'line':
      case 'arrow': {
        if (path.points.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(path.points[0][0], path.points[0][1]);
        ctx.lineTo(path.points[1][0], path.points[1][1]);
        ctx.stroke();
        break;
      }
      case 'rect': {
        if (path.points.length < 2) break;
        const rx = Math.min(path.points[0][0], path.points[1][0]);
        const ry = Math.min(path.points[0][1], path.points[1][1]);
        const rw = Math.abs(path.points[1][0] - path.points[0][0]);
        const rh = Math.abs(path.points[1][1] - path.points[0][1]);
        ctx.strokeRect(rx, ry, rw, rh);
        break;
      }
      case 'circle': {
        if (path.points.length < 2) break;
        const [cx, cy] = path.points[0];
        const [ex, ey] = path.points[1];
        const radius = Math.hypot(ex - cx, ey - cy);
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'text':
        drawTextHighlight(ctx, path);
        break;
      default:
        break;
    }
    ctx.restore();
  }, []);

  // Full render: clear + saved paths + optional live preview + selection highlight
  const render = useCallback((extraPath = null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Live state layered over the saved paths: a label being dragged, a label being rotated by
    // its handle (pathOverride), and the label open in the edit field (hidden — the field
    // stands exactly in its place).
    const drag = textDragRef.current;
    const savedPaths = (scene?.drawingPaths || [])
      .filter(p => p.id !== hiddenPathId)
      .map((p) => {
        let out = p;
        if (pathOverride && p.id === pathOverride.id) out = { ...out, ...pathOverride };
        if (drag?.offset && p.id === drag.id) {
          out = { ...out, points: [[drag.origin[0] + drag.offset[0], drag.origin[1] + drag.offset[1]]] };
        }
        return out;
      });
    const allPaths = extraPath ? [...savedPaths, extraPath] : savedPaths;
    allPaths.forEach(path => drawPath(ctx, path));

    // Hover first, selection over it — selection is the durable state, hover is transient.
    if (hoveredPathId) {
      const hov = savedPaths.find(p => p.id === hoveredPathId);
      if (hov) drawHighlight(ctx, hov, { alpha: 0.35, dashed: false });
    }

    if (selectedPathId) {
      const sel = savedPaths.find(p => p.id === selectedPathId);
      if (sel) drawHighlight(ctx, sel);
    }
  }, [scene?.drawingPaths, drawPath, drawHighlight, selectedPathId, hoveredPathId, hiddenPathId, pathOverride]);

  // Re-render when saved paths or selection changes
  useEffect(() => {
    render(currentPathRef.current ? {
      tool: activeTool,
      points: currentPathRef.current,
      brushSize,
      color,
      fontSize,
    } : null);
    // fontTick: a label font finished loading — repaint with the real face.
  }, [render, activeTool, brushSize, color, fontSize, fontTick]);

  // Delete/Backspace deletes the selected path (shortcut registry: drawing.deleteSelected).
  useKeyboardShortcut('drawing.deleteSelected', () => onDeletePath?.(selectedPathId), {
    enabled: isDrawingMode && activeTool === 'select' && !!selectedPathId,
  });

  // Convert mouse event to scene-space coordinates
  const getSceneCoords = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY];
  }, []);

  // Client-side convenience only — the server re-checks owner-or-GM on DELETE.
  const canDelete = useCallback(
    (path) => isGM || path.userId === userId,
    [isGM, userId]
  );

  const handleContextMenu = useCallback((e) => {
    if (!isDrawingMode) return;
    e.preventDefault();

    // Right-click mid-stroke abandons the shape. Zeroing currentPathRef matters as much
    // as the isDrawingRef flag: the render effect reads that ref for the live preview,
    // so a leftover value would repaint the abandoned shape on the next re-render.
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      currentPathRef.current = null;
      shapeStartRef.current = null;
      render(null);
      return;
    }

    const [px, py] = getSceneCoords(e);
    const id = findDeletablePathAt(scene?.drawingPaths || [], px, py, canDelete);
    if (id) onDeletePath?.(id);
  }, [isDrawingMode, getSceneCoords, render, scene?.drawingPaths, canDelete, onDeletePath]);

  const handleMouseDown = useCallback((e) => {
    if (!isDrawingMode) return;
    // Only a plain left button draws; the right button deletes (see handleContextMenu).
    // Ctrl+left-click is also rejected: on macOS it's the OS-level secondary-click
    // emulation, so the browser dispatches both `contextmenu` and this `mousedown` for the
    // same physical click, in an order that varies by browser. Letting it through here
    // would start a stroke under either ordering — masking the delete when mousedown fires
    // first, or saving a degenerate dot when contextmenu fires first and this mousedown/the
    // following mouseup still complete a "stroke" from a single click.
    if (e.button !== 0 || e.ctrlKey) return;
    setHoveredPathId(null);
    e.preventDefault();
    e.stopPropagation();

    if (activeTool === 'select') {
      // Selection exists to feed the trash button and the Delete key, so it follows the same
      // rule as the right button: you can only pick a path you may delete, and someone else's
      // path is skipped rather than blocking the one underneath it. A miss deselects.
      const [px, py] = getSceneCoords(e);
      const paths = scene?.drawingPaths || [];
      const hitId = findDeletablePathAt(paths, px, py, canDelete);
      onSelectionChange?.(hitId);
      // A press on a label may turn into a move; it only becomes one past MOVE_THRESHOLD.
      const hit = hitId && paths.find(p => p.id === hitId);
      if (hit?.tool === 'text') {
        textDragRef.current = { id: hit.id, start: [px, py], origin: hit.points[0], offset: null };
      }
      return;
    }

    if (activeTool === 'text') {
      const coords = getSceneCoords(e);
      const label = findEditableTextAt(scene?.drawingPaths || [], coords[0], coords[1], canDelete);
      if (label) onEditText?.(label);
      else onTextPlacement?.(coords);
      return;
    }

    const [x, y] = getSceneCoords(e);
    isDrawingRef.current = true;

    if (activeTool === 'freehand') {
      currentPathRef.current = [[x, y], [x, y]];
    } else {
      shapeStartRef.current = [x, y];
      currentPathRef.current = [[x, y], [x, y]];
    }
  }, [isDrawingMode, activeTool, getSceneCoords, onTextPlacement, onEditText, onSelectionChange, scene?.drawingPaths, canDelete]);

  const handleMouseMove = useCallback((e) => {
    const drag = textDragRef.current;
    if (drag) {
      const [x, y] = getSceneCoords(e);
      const dx = x - drag.start[0];
      const dy = y - drag.start[1];
      if (drag.offset || Math.hypot(dx, dy) > MOVE_THRESHOLD) {
        drag.offset = [dx, dy];
        render(null);
      }
      return;
    }

    // Hover runs only between strokes — one gesture at a time. Returning `prev`
    // unchanged makes React bail out, so the canvas repaints on enter/leave only,
    // not on every mouse event.
    if (isDrawingMode && !isDrawingRef.current) {
      const [hx, hy] = getSceneCoords(e);
      const hoverId = findDeletablePathAt(scene?.drawingPaths || [], hx, hy, canDelete);
      setHoveredPathId(prev => (prev === hoverId ? prev : hoverId));
    }

    if (!isDrawingRef.current || !isDrawingMode) return;
    e.preventDefault();

    const [x, y] = getSceneCoords(e);

    if (activeTool === 'freehand') {
      currentPathRef.current.push([x, y]);
    } else {
      currentPathRef.current = [shapeStartRef.current, [x, y]];
    }

    render({
      tool: activeTool,
      points: currentPathRef.current,
      brushSize,
      color,
      fontSize,
    });
  }, [isDrawingMode, activeTool, getSceneCoords, render, brushSize, color, fontSize, scene?.drawingPaths, canDelete]);

  const handleMouseUp = useCallback((e) => {
    const drag = textDragRef.current;
    if (drag) {
      textDragRef.current = null;
      if (drag.offset) {
        onMoveText?.(drag.id, [drag.origin[0] + drag.offset[0], drag.origin[1] + drag.offset[1]]);
      }
      // Repaint without the local offset; the caller's optimistic update keeps the label in place.
      render(null);
      return;
    }

    // Mirrors handleMouseDown's button guard. Without it, a right-button release during
    // a left-drag can reach here first on browsers/OSes that fire mouseup before
    // contextmenu (event order is unspecified across browsers) — completing and saving
    // the stroke the user meant to abandon, instead of leaving it for handleContextMenu's
    // abandon branch. Safe for the mouseleave→handleMouseUp relay below: per spec, button
    // is only meaningful for press/release events and defaults to 0 otherwise.
    if (!isDrawingRef.current || !isDrawingMode || e.button !== 0) return;
    e.preventDefault();

    isDrawingRef.current = false;
    const pts = currentPathRef.current;
    currentPathRef.current = null;
    shapeStartRef.current = null;

    if (pts && pts.length >= 2 && onPathComplete) {
      onPathComplete({
        tool: activeTool,
        points: pts,
        brushSize,
        color,
        fontSize,
      });
    }
    render(null);
  }, [isDrawingMode, activeTool, onPathComplete, onMoveText, brushSize, color, fontSize, render]);

  const handleMouseLeave = useCallback((e) => {
    setHoveredPathId(null);
    if (isDrawingRef.current || textDragRef.current) {
      handleMouseUp(e);
    }
  }, [handleMouseUp]);

  // Select tool: double-click opens a label for editing (the text tool does it on a single click).
  const handleDoubleClick = useCallback((e) => {
    if (!isDrawingMode || activeTool !== 'select') return;
    const [px, py] = getSceneCoords(e);
    const label = findEditableTextAt(scene?.drawingPaths || [], px, py, canDelete);
    if (label) onEditText?.(label);
  }, [isDrawingMode, activeTool, getSceneCoords, scene?.drawingPaths, canDelete, onEditText]);

  const hoveredPath = hoveredPathId && (scene?.drawingPaths || []).find(p => p.id === hoveredPathId);
  const isInteractive = isDrawingMode;
  const cursor = !isInteractive
    ? 'default'
    : activeTool === 'text'
      ? 'text'
      : activeTool === 'select'
        ? (hoveredPath?.tool === 'text' ? 'move' : 'default')
        : 'crosshair';

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
        zIndex: 25,
        pointerEvents: isInteractive ? 'auto' : 'none',
        cursor,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    />
  );
};

export default DrawingLayer;
