import React, { useRef, useEffect, useCallback } from 'react';

/**
 * FogLayer — a canvas element that renders fog of war on top of the scene.
 *
 * Rendering strategy:
 *  `render()` fills the canvas with opaque fog, then carves out every saved (and
 *  in-progress) reveal/cover path via `destination-out`/`source-over`. A single
 *  `destination-out` fade pass afterwards bakes the GM's preview opacity into those
 *  pixels — see `render()`'s own numbered sections for the exact order. GM affordances
 *  (brush ring, shape outlines, polygon guides) are drawn AFTER the fade, at full alpha,
 *  so dimming the fog for preview never dims the cursor along with it.
 *
 * Coordinate space:
 *  All points are stored/communicated in *scene space* (same as image/character
 *  coordinates).  The canvas is sized to match the scene canvas exactly and sits
 *  at position:absolute inside scene-viewport__content, so no extra transform
 *  is needed — CSS zoom/scale handles the rest.
 */

/**
 * Minimalna liczba wierzchołków, przy której wielokąt jest figurą, a nie odcinkiem.
 * Poniżej tego progu nie ma czego zapisać — zamknięcie zamienia się w porzucenie.
 */
const MIN_POLYGON_POINTS = 3;

export const canClosePolygon = (points) => points.length >= MIN_POLYGON_POINTS;

/** The GM overlay's working amber — shared by the polygon guides and the shape previews. */
const OVERLAY_COLOR = 'rgba(255, 220, 100, 0.9)';
const OVERLAY_WIDTH = 2;

/**
 * Tools dragged from point to point, which get a preview outline. Keyed on the currently
 * selected fogTool, since that is what decides whether a preview should render at all —
 * there is no in-progress path to key on before the drag has produced one.
 */
const OUTLINED_TOOLS = new Set(['rect', 'circle', 'line']);

/**
 * Who sees the fog layer. The single place this decision is made — SceneViewport mounts
 * FogLayer unconditionally, exactly like the neighbouring DrawingLayer.
 * The `|| inFogMode` term preserves painting ahead of time: with fog disabled for players
 * the GM still sees the layer once in fog mode and can prepare the reveals.
 */
export const fogVisibleFor = ({ isGM, fogEnabled, inFogMode }) =>
  isGM ? (fogEnabled || inFogMode) : fogEnabled;

/**
 * How see-through the fog canvas is. The only line in this file that could leak map
 * information: a player must always get full, opaque fog — the GM's own preview
 * preference (`fogGmOpacity`) never applies to them.
 */
export const fogShadeAlpha = ({ isGM, fogGmOpacity }) => (isGM ? fogGmOpacity : 1.0);

/**
 * Tools whose reach is set by brushSize — only those show the brush ring instead of a
 * crosshair. Rectangle and circle fill an area, so brushSize does not apply to them.
 * The same condition gates three things at once (drawing the ring, repainting on mouse
 * move, hiding the native cursor), which is why it lives in one place.
 */
export const usesBrushCursor = (fogTool) => fogTool === 'freehand' || fogTool === 'line';

/**
 * The four corners of the rectangle a thick straight stroke covers: the segment offset by
 * half the width along its own normal, in both directions. A butt-capped stroke of that
 * width paints exactly this shape, so the outline and the fill cannot disagree.
 * At zero length `atan2(0, 0)` is 0 and the rectangle collapses to a zero-area sliver — the
 * stroke itself is invisible at zero length too, so the two stay consistent.
 */
export const lineRectCorners = ([x1, y1], [x2, y2], halfWidth) => {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const nx = -Math.sin(angle) * halfWidth;
  const ny = Math.cos(angle) * halfWidth;
  return [
    [x1 + nx, y1 + ny],
    [x2 + nx, y2 + ny],
    [x2 - nx, y2 - ny],
    [x1 - nx, y1 - ny],
  ];
};

/**
 * Traces the axis-aligned rectangle spanning two opposite corners onto the current path.
 * Geometry only — no beginPath/fill/stroke/style, so both the fill pass and the outline
 * preview can share the exact same formula instead of risking two that quietly drift apart.
 */
const traceRectPath = (ctx, [x1, y1], [x2, y2]) => {
  ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
};

/**
 * Traces the circle centred on the first point, radius = distance to the second, onto the
 * current path. Same sharing rationale as `traceRectPath`.
 */
const traceCirclePath = (ctx, [cx, cy], [ex, ey]) => {
  ctx.arc(cx, cy, Math.hypot(ex - cx, ey - cy), 0, Math.PI * 2);
};

/**
 * Traces a closed polygon through the given corners onto the current path. Same sharing
 * rationale as `traceRectPath`: the line's outline and the line tool's square cursor are both
 * four-corner shapes coming out of `lineRectCorners`, and one tracer keeps the two from
 * drifting apart.
 */
const tracePolygonPath = (ctx, corners) => {
  ctx.moveTo(corners[0][0], corners[0][1]);
  for (let i = 1; i < corners.length; i++) {
    ctx.lineTo(corners[i][0], corners[i][1]);
  }
  ctx.closePath();
};

/**
 * Builds the in-progress path object for a drag, the way `handleMouseMove` does while the
 * mouse is moving. Shared with the saved-paths/editing-mode effect below so a WS-driven scene
 * refetch mid-drag re-renders the SAME in-flight shape instead of silently reinterpreting it
 * as freehand — that mismatch is what let the outline (section 4) and the fill (section 2)
 * disagree about what was being dragged.
 */
const buildDragPath = (fogTool, points, brushSize, cover) => {
  if (fogTool === 'rect' || fogTool === 'line' || fogTool === 'circle') {
    return { points, brushSize, shape: fogTool, cover };
  }
  return { points, brushSize, cover };
};

/**
 * The outline of what will be saved once the button is released. At a low fog opacity the
 * reveal preview itself is nearly invisible — you are erasing something already faint — so
 * this is often the only signal of how far the stroke reaches.
 */
const strokeShapeOutline = (ctx, fogTool, points, brushSize) => {
  const [p1, p2] = points;
  ctx.beginPath();
  if (fogTool === 'rect') {
    traceRectPath(ctx, p1, p2);
  } else if (fogTool === 'circle') {
    traceCirclePath(ctx, p1, p2);
  } else if (fogTool === 'line') {
    tracePolygonPath(ctx, lineRectCorners(p1, p2, brushSize / 2));
  }
  ctx.stroke();
};

/**
 * Draws the two-ring brush cursor marker centred on (cx, cy): a dark outer ring then a white
 * inner ring, both at their literal colour/width regardless of shape. The freehand brush
 * traces a circle; the line tool traces a square, built from the SAME `lineRectCorners`
 * geometry as the rectangle it is about to stroke — a short segment of length `brushSize`
 * through the centre, offset by half that width — so the marker and the eventual stroke can
 * never quietly disagree about shape.
 * `angle` only matters for the line tool: callers pass 0 before a drag has a direction, and
 * the drag's own angle while dragging, so the square lines up with the end of the rectangle.
 */
const drawCursorMarker = (ctx, fogTool, cx, cy, brushSize, angle) => {
  const radius = brushSize / 2;
  const tracePath = fogTool === 'line'
    ? () => {
      const dx = Math.cos(angle) * radius;
      const dy = Math.sin(angle) * radius;
      tracePolygonPath(ctx, lineRectCorners([cx - dx, cy - dy], [cx + dx, cy + dy], radius));
    }
    : () => ctx.arc(cx, cy, radius, 0, Math.PI * 2);

  // Dark outer ring
  ctx.beginPath();
  tracePath();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = 3;
  ctx.stroke();
  // White inner ring
  ctx.beginPath();
  tracePath();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
};

const FogLayer = ({
  scene,
  isGM,
  editingLayer,
  brushSize = 30,
  fogGmOpacity = 0.5,
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

  // Polygon tool refs
  const polygonPointsRef  = useRef([]);    // wierzchołki w scene coords
  const polygonCursorRef  = useRef(null);  // pozycja kursora w scene coords
  const polygonActiveRef  = useRef(false); // czy trwa rysowanie wielokąta

  const fogEnabled = scene?.fogEnabled || false;
  // The GM always sees fog that the scene has enabled; fog mode only adds visibility for
  // fog that is disabled.
  const inFogMode = isGM && editingLayer === 'fog';

  // The GM's preview opacity is now part of the canvas CONTENT, not its style, so it has to
  // join `render`'s dependency array — otherwise moving the slider repaints nothing.
  const shadeAlpha = fogShadeAlpha({ isGM, fogGmOpacity });

  // Render the full fog canvas (saved paths + optional in-progress path)
  const render = useCallback((extraPath = null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const savedPaths = scene?.revealPaths || [];

    // --- 1. Fill with solid fog ---
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
        ctx.beginPath();
        traceRectPath(ctx, path.points[0], path.points[1]);
        ctx.fill();
      } else if (path.shape === 'circle') {
        ctx.beginPath();
        traceCirclePath(ctx, path.points[0], path.points[1]);
        ctx.fill();
      } else if (path.shape === 'line') {
        // Butt caps make a thick straight stroke exactly the rectangle the outline previews.
        ctx.lineWidth = path.brushSize || 30;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(path.points[0][0], path.points[0][1]);
        ctx.lineTo(path.points[1][0], path.points[1][1]);
        ctx.stroke();
      } else if (path.shape === 'polygon') {
        if (canClosePolygon(path.points)) {
          ctx.beginPath();
          ctx.moveTo(path.points[0][0], path.points[0][1]);
          for (let i = 1; i < path.points.length; i++) {
            ctx.lineTo(path.points[i][0], path.points[i][1]);
          }
          ctx.closePath();
          ctx.fill();
        }
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

    // --- 3. Bake the GM's preview opacity into the pixels ---
    // One destination-out pass multiplies the alpha of everything drawn so far by
    // shadeAlpha — exactly what CSS opacity did, only earlier in the pipeline. Revealed
    // holes stay holes (0 × anything = 0). It runs AFTER every path, not as alpha in the
    // fog fillStyle: cover mode repaints fog with source-over, and per-fill alpha would
    // stack there (0.5 over 0.5 = 0.75), making covered ground darker than base fog.
    if (shadeAlpha < 1) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0, 0, 0, ${1 - shadeAlpha})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Everything below is a GM affordance, drawn at full alpha on top of the faded fog.
    ctx.globalCompositeOperation = 'source-over';

    // --- 4. Preview outline of the shape being dragged ---
    if (inFogMode && OUTLINED_TOOLS.has(fogTool) && extraPath?.points?.length >= 2) {
      ctx.strokeStyle = OVERLAY_COLOR;
      ctx.lineWidth = OVERLAY_WIDTH;
      ctx.setLineDash([]);
      strokeShapeOutline(ctx, fogTool, extraPath.points, brushSize);
    }

    // --- 5. Draw brush cursor (for tools whose reach is brushSize, when GM is editing) ---
    if (inFogMode && usesBrushCursor(fogTool) && cursorPosRef.current) {
      const [cx, cy] = cursorPosRef.current;
      // No direction before the drag starts; while dragging, the square lines up with the
      // rectangle's own angle so it coincides with the end of the shape being dragged.
      const angle = fogTool === 'line' && isDrawingRef.current && rectStartRef.current
        ? Math.atan2(cy - rectStartRef.current[1], cx - rectStartRef.current[0])
        : 0;
      drawCursorMarker(ctx, fogTool, cx, cy, brushSize, angle);
    }

    // --- 6. Polygon overlay: guide lines and snap indicator ---
    if (inFogMode && fogTool === 'polygon' && polygonActiveRef.current) {
      const pts = polygonPointsRef.current;
      const cursor = polygonCursorRef.current;
      if (pts.length >= 1 && cursor) {
        const [cx, cy] = cursor;
        const [fx, fy] = pts[0];
        const rect2 = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect2.width;
        const snapDist = Math.hypot(cx - fx, cy - fy) / scaleX; // w px ekranu
        const isSnapping = canClosePolygon(pts) && snapDist < 15;

        ctx.lineCap = 'round';

        // Solid chain: every edge already placed, then on to the cursor. One path rather than
        // a separate preview segment — with a single vertex the loop adds no edge and this
        // collapses to exactly the cursor segment on its own.
        ctx.strokeStyle = OVERLAY_COLOR;
        ctx.lineWidth = OVERLAY_WIDTH;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i][0], pts[i][1]);
        }
        ctx.lineTo(cx, cy);
        ctx.stroke();

        // Przerywana linia: kursor → pierwszy punkt (podgląd zamknięcia)
        if (pts.length >= 2) {
          ctx.strokeStyle = 'rgba(255, 220, 100, 0.55)';
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(fx, fy);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Snap indicator: żółty okrąg wokół pierwszego punktu gdy blisko
        if (isSnapping) {
          ctx.strokeStyle = 'rgba(255, 255, 100, 1.0)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(fx, fy, 8 * scaleX, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Kropki na każdym umieszczonym wierzchołku
        pts.forEach(([px, py]) => {
          ctx.fillStyle = OVERLAY_COLOR;
          ctx.beginPath();
          ctx.arc(px, py, 3 * scaleX, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
  }, [inFogMode, scene, fogTool, brushSize, shadeAlpha]);

  // Re-render whenever saved paths or editing mode change
  useEffect(() => {
    render(currentPathRef.current
      ? buildDragPath(fogTool, currentPathRef.current, brushSize, fogCoverMode)
      : null);
  }, [render, brushSize, fogTool, fogCoverMode]);

  /**
   * Kończy aktywny wielokąt — zapisem albo porzuceniem.
   * Kopia punktów musi powstać PRZED wyzerowaniem refa: `render` czyta te refy przy
   * przerysowaniu, więc zostawiona zawartość odmalowałaby porzuconą figurę.
   */
  const finishPolygon = useCallback((commit) => {
    const pts = polygonPointsRef.current;
    const completed = commit ? [...pts] : null;

    polygonPointsRef.current = [];
    polygonActiveRef.current = false;
    polygonCursorRef.current = null;
    render(null);

    if (completed && onPathComplete) {
      onPathComplete({ points: completed, brushSize, shape: 'polygon', cover: fogCoverMode });
    }
  }, [render, onPathComplete, brushSize, fogCoverMode]);

  // Escape key — cancel active polygon
  useEffect(() => {
    if (!inFogMode || fogTool !== 'polygon') return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && polygonActiveRef.current) {
        finishPolygon(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inFogMode, fogTool, finishPolygon]);

  // Reset lokalny, nie finishPolygon: ten efekt ma odpalać się wyłącznie przy zmianie
  // narzędzia, a finishPolygon zależy od brushSize i fogCoverMode — wciągnięcie go do
  // tablicy zależności dokładałoby przebiegi bez powodu.
  // Cancel polygon when switching away from polygon tool
  useEffect(() => {
    if (fogTool !== 'polygon' && polygonActiveRef.current) {
      polygonPointsRef.current = [];
      polygonActiveRef.current = false;
      polygonCursorRef.current = null;
      render(null);
    }
  }, [fogTool, render]);

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
    if (!inFogMode) return;
    // Rysuje wyłącznie goły lewy przycisk. Ctrl+lewy jest odrzucany, bo na macOS to
    // systemowa emulacja prawego przycisku: przeglądarka wysyła wtedy OBA zdarzenia —
    // `contextmenu` i to `mousedown` z button 0 — w kolejności, której spec nie ustala.
    // Bez tego warunku jedno kliknięcie dokłada wierzchołek I zamyka wielokąt.
    if (e.button !== 0 || e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();

    const canvas = canvasRef.current;
    const [x, y] = getSceneCoords(e);

    // Polygon tool — obsługa kliku (nie ustawiamy isDrawingRef)
    if (fogTool === 'polygon') {
      const pts = polygonPointsRef.current;
      if (pts.length === 0) {
        // Pierwszy punkt — start wielokąta
        polygonPointsRef.current = [[x, y]];
        polygonActiveRef.current = true;
        render(null);
        return;
      }
      // Snap check — czy blisko pierwszego punktu?
      const rect2 = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect2.width;
      const snapDist = Math.hypot(x - pts[0][0], y - pts[0][1]) / scaleX;
      if (canClosePolygon(pts) && snapDist < 15) {
        finishPolygon(true);
        return;
      }
      // Dodaj nowy punkt
      polygonPointsRef.current = [...pts, [x, y]];
      render({
        points: [...polygonPointsRef.current, polygonCursorRef.current ?? [x, y]],
        shape: 'polygon',
        cover: fogCoverMode,
      });
      return;
    }

    isDrawingRef.current = true;

    if (fogTool === 'rect' || fogTool === 'line' || fogTool === 'circle') {
      rectStartRef.current = [x, y];
      currentPathRef.current = [[x, y], [x, y]];
    } else {
      currentPathRef.current = [[x, y]];
    }
  }, [inFogMode, fogTool, fogCoverMode, getSceneCoords, render, finishPolygon]);

  const handleMouseMove = useCallback((e) => {
    if (!inFogMode) return;
    e.preventDefault();

    const [x, y] = getSceneCoords(e);
    cursorPosRef.current = [x, y];

    // Polygon — aktualizacja kursora i podgląd
    if (fogTool === 'polygon') {
      polygonCursorRef.current = [x, y];
      if (polygonActiveRef.current) {
        const pts = polygonPointsRef.current;
        const virtualPath = pts.length >= 2
          ? { points: [...pts, [x, y]], shape: 'polygon', cover: fogCoverMode }
          : null;
        render(virtualPath);
      }
      return;
    }

    if (isDrawingRef.current) {
      if (fogTool === 'rect' || fogTool === 'line' || fogTool === 'circle') {
        currentPathRef.current = [rectStartRef.current, [x, y]];
      } else {
        currentPathRef.current.push([x, y]);
      }
      render(buildDragPath(fogTool, currentPathRef.current, brushSize, fogCoverMode));
    } else if (usesBrushCursor(fogTool)) {
      // Not drawing — redraw to update cursor circle position
      render(null);
    }
  }, [inFogMode, fogTool, fogCoverMode, getSceneCoords, render, brushSize]);

  const handleMouseUp = useCallback((e) => {
    // Lustro guardu z handleMouseDown. Bez `e.button !== 0` zwolnienie prawego przycisku
    // w trakcie ciągnięcia prostokąta zapisuje kształt, który miał zostać porzucony — na
    // przeglądarkach, gdzie `mouseup` wyprzedza `contextmenu` (kolejność jest niezdefiniowana).
    // Bezpieczne dla relaya handleMouseLeave → handleMouseUp: wg specyfikacji `button` ma
    // znaczenie tylko przy wciśnięciu/zwolnieniu, a poza nimi wynosi 0.
    if (!isDrawingRef.current || !inFogMode || e.button !== 0) return;
    e.preventDefault();

    isDrawingRef.current = false;
    const pts = currentPathRef.current;
    currentPathRef.current = null;
    rectStartRef.current = null;

    if (pts && pts.length >= 2 && onPathComplete) {
      let shape = 'freehand';
      if (fogTool === 'rect') shape = 'rect';
      else if (fogTool === 'circle') shape = 'circle';
      else if (fogTool === 'line') shape = 'line';
      onPathComplete({ points: pts, brushSize, shape, cover: fogCoverMode });
    }
  }, [inFogMode, fogTool, fogCoverMode, onPathComplete, brushSize]);

  /**
   * Prawy przycisk = „skończ to, co robisz".
   * Wielokąt: zamknij (>= 3 wierzchołki) albo porzuć. Pozostałe narzędzia: porzuć kształt
   * ciągnięty w tej chwili. Ten sam gest co w warstwie rysowania (DrawingLayer).
   */
  const handleContextMenu = useCallback((e) => {
    // Outside fog mode the native browser context menu passes through untouched.
    if (!inFogMode) return;
    e.preventDefault();
    e.stopPropagation();

    if (fogTool === 'polygon' && polygonActiveRef.current) {
      finishPolygon(canClosePolygon(polygonPointsRef.current));
      return;
    }

    // Porzucenie kształtu w trakcie. Wyzerowanie currentPathRef liczy się tak samo jak
    // flaga isDrawingRef: render czyta ten ref przy podglądzie, więc zostawiona zawartość
    // odmalowałaby porzucony kształt przy najbliższym przerysowaniu.
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      currentPathRef.current = null;
      rectStartRef.current = null;
      render(null);
    }
  }, [inFogMode, fogTool, finishPolygon, render]);

  const handleMouseLeave = useCallback((e) => {
    polygonCursorRef.current = null;
    cursorPosRef.current = null;
    if (isDrawingRef.current) {
      handleMouseUp(e);
    } else {
      render(null);
    }
  }, [handleMouseUp, render]);

  if (!fogVisibleFor({ isGM, fogEnabled, inFogMode })) return null;

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
        zIndex: 30,
        pointerEvents: inFogMode ? 'auto' : 'none',
        cursor: inFogMode ? (usesBrushCursor(fogTool) ? 'none' : 'crosshair') : 'default',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
    />
  );
};

export default FogLayer;
