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

/**
 * Minimalna liczba wierzchołków, przy której wielokąt jest figurą, a nie odcinkiem.
 * Poniżej tego progu nie ma czego zapisać — zamknięcie zamienia się w porzucenie.
 */
const MIN_POLYGON_POINTS = 3;

export const canClosePolygon = (points) => points.length >= MIN_POLYGON_POINTS;

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

  // Polygon tool refs
  const polygonPointsRef  = useRef([]);    // wierzchołki w scene coords
  const polygonCursorRef  = useRef(null);  // pozycja kursora w scene coords
  const polygonActiveRef  = useRef(false); // czy trwa rysowanie wielokąta

  const fogEnabled = scene?.fogEnabled || false;
  const fogOpacity = scene?.fogOpacity || 0.85;
  // In fog mode the GM always SEES the fog; the pan tool only suspends painting/interaction so
  // tokens can be moved underneath while the fog stays visible.
  const inFogMode = isGM && editingLayer === 'fog';
  const isEditingFog = inFogMode && fogTool !== 'pan';

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

    // --- Overlay wielokąta: linie pomocnicze i snap indicator ---
    if (isEditingFog && fogTool === 'polygon' && polygonActiveRef.current) {
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

        // Ciągła linia: ostatni punkt → kursor (podgląd następnego odcinka)
        ctx.strokeStyle = 'rgba(255, 220, 100, 0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
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
          ctx.fillStyle = 'rgba(255, 220, 100, 0.9)';
          ctx.beginPath();
          ctx.arc(px, py, 3 * scaleX, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
  }, [isEditingFog, scene, fogTool, brushSize]);

  // Re-render whenever saved paths or editing mode change
  useEffect(() => {
    render(currentPathRef.current ? { points: currentPathRef.current, brushSize } : null);
  }, [render, brushSize]);

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
    if (!isEditingFog || fogTool !== 'polygon') return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && polygonActiveRef.current) {
        finishPolygon(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditingFog, fogTool, finishPolygon]);

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
    if (!isEditingFog) return;
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
  }, [isEditingFog, fogTool, fogCoverMode, getSceneCoords, render, finishPolygon]);

  const handleMouseMove = useCallback((e) => {
    if (!isEditingFog) return;
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
    // Lustro guardu z handleMouseDown. Bez `e.button !== 0` zwolnienie prawego przycisku
    // w trakcie ciągnięcia prostokąta zapisuje kształt, który miał zostać porzucony — na
    // przeglądarkach, gdzie `mouseup` wyprzedza `contextmenu` (kolejność jest niezdefiniowana).
    // Bezpieczne dla relaya handleMouseLeave → handleMouseUp: wg specyfikacji `button` ma
    // znaczenie tylko przy wciśnięciu/zwolnieniu, a poza nimi wynosi 0.
    if (!isDrawingRef.current || !isEditingFog || e.button !== 0) return;
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

  /**
   * Prawy przycisk = „skończ to, co robisz".
   * Wielokąt: zamknij (>= 3 wierzchołki) albo porzuć. Pozostałe narzędzia: porzuć kształt
   * ciągnięty w tej chwili. Ten sam gest co w warstwie rysowania (DrawingLayer).
   */
  const handleContextMenu = useCallback((e) => {
    // Narzędzie `pan` i tryb bez edycji mgły przepuszczają natywne menu przeglądarki.
    if (!isEditingFog) return;
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
  }, [isEditingFog, fogTool, finishPolygon, render]);

  const handleMouseLeave = useCallback((e) => {
    polygonCursorRef.current = null;
    cursorPosRef.current = null;
    if (isDrawingRef.current) {
      handleMouseUp(e);
    } else {
      render(null);
    }
  }, [handleMouseUp, render]);

  // GM: whenever in fog mode (incl. pan). Players: only when fog is enabled by GM.
  if (isGM && !inFogMode) return null;
  if (!isGM && !fogEnabled) return null;

  // CSS opacity: players see full fog; GM sees a see-through 50% while in fog mode (edit or pan).
  const cssOpacity = !isGM ? 1.0 : inFogMode ? 0.5 : fogOpacity;

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
        opacity: cssOpacity,
        pointerEvents: isEditingFog ? 'auto' : 'none',
        cursor: isEditingFog ? (fogTool === 'freehand' ? 'none' : 'crosshair') : 'default',
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
