import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import SceneLayer from './SceneLayer';
import FogLayer from './FogLayer';
import DrawingLayer from './DrawingLayer';
import ZoomContext from './ZoomContext';
import PointerPing from './PointerPing';
import MapRulerOverlay from './MapRulerOverlay';
import MapTokensLayer from './MapTokensLayer';
import MarqueeOverlay from './MarqueeOverlay';
import SceneTokenMultiContextMenu from './SceneTokenMultiContextMenu';
import ModeSwitchLabel from './ModeSwitchLabel';
import { useDrawingTextInput } from './useDrawingTextInput';
import { useRightDragPan } from './useRightDragPan';
import { nextMode, modeLabelKey, isModeCycleClick } from './sceneModes';
import useMapRuler from '../../hooks/useMapRuler';
import useGroupDrag from '../../hooks/useGroupDrag';
import { getCanvasSize, MIN_ZOOM, MAX_ZOOM, GRID_BORDER, GRID_PADDING, CELL_SIZE, OFFSCENE_MARGIN_CELLS } from '../../constants/scene';
import { characterToMapToken, imageToMapToken, snapPointToTokens, distanceBetween, selectTokensInRect, buildRulerSnapTargets } from '../../utils/tokenGeometry';
import './SceneViewport.css';

// Deterministic colour per measuring player, so remote rulers are distinguishable.
const rulerColorFor = (id) => {
  let hash = 0;
  for (let i = 0; i < String(id).length; i++) hash = (hash * 31 + String(id).charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360}, 70%, 60%)`;
};

const FRAME_SIZE = GRID_BORDER + GRID_PADDING; // 26px — outer border + inner frame
// GM staging margin in px. Module-level (not derived from canvasSize) so handleFit can use the
// same value as the render below without depending on render-scope state.
const OFFSCENE_MARGIN = OFFSCENE_MARGIN_CELLS * CELL_SIZE;

const ZOOM_STEP = 0.1;
const WHEEL_ZOOM_FACTOR = 0.001;
const PING_HOLD_MS = 500;
const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0];

const SceneViewport = ({
  scene, isGM, gameId, editingLayer, onEditingLayerChange, imageEditLayer = 'background', gridWidth, gridHeight, children,
  onZoomChange, sendMessage, pointerPings = [], onRemovePing,
  brushSize = 10, fogGmOpacity = 0.5, activeTool = 'freehand', fogCoverMode = false, onFogPathComplete,
  drawingColor = '#ff0000', drawingFontSize = 16, onDrawingPathComplete,
  selectedPathId = null, onSelectionChange, onDeletePath,
  controlScheme = 'modern', onBackgroundClick,
  selectedImageId = null, onSelectImage, gameSystem = 'warhammer4e',
  tokenPlacementMode = 'snap',
  userId = null, userName = '', measurementMetric = 'euclidean', mapRulers = [],
  cellDistance = 1, distanceUnit = '',
  dragRuler = null, onTokenDragMeasureStart, onTokenDragMeasureMove, onTokenDragMeasureEnd,
  aoeEnabled = true,
  placedCharacters = [], isMultiplayer = false, tokenDisplay = null, token = null,
  activeTokenId = null, onSelectCharacter, onCommitMove, onCommitResize, onCommitRotate,
  selectedTokens = [], onMarqueeSelect, onCommitGroupMove, isTokenSelected, onToggleTokenSelected,
  onGroupDelete, onGroupSetLock, onGroupSetLayer, onGroupResetRotation,
}) => {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(1);
  // Group context menu (Select mode, right-click on the multi-selection). GM-only, gated below.
  const [multiMenu, setMultiMenu] = useState(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [zoomDropdownOpen, setZoomDropdownOpen] = useState(false);
  const zoomDropdownRef = useRef(null);

  // displayedScene lags behind the scene prop during transitions so the old scene
  // stays rendered while the overlay covers the viewport.
  const [displayedScene, setDisplayedScene] = useState(scene);

  // isCovering = true  → overlay opacity:1, no CSS transition (instant cover)
  // isCovering = false → overlay opacity:0, with CSS transition (fade out)
  const [isCovering, setIsCovering] = useState(false);

  const panStartRef = useRef(null);
  const viewportRef = useRef(null);

  const zoomRef = useRef(zoom);
  const panOffsetRef = useRef(panOffset);
  // canvasSizeRef is updated manually before handleFit so it always uses correct dimensions
  const canvasSizeRef = useRef(null);
  const displayedSceneIdRef = useRef(null);
  // pendingSceneRef captures the scene that triggered the cover, used when the setTimeout fires
  const pendingSceneRef = useRef(null);
  const firstSceneLoad = useRef(true);

  useEffect(() => { onZoomChange?.(zoom); }, [zoom, onZoomChange]);

  useEffect(() => {
    if (!zoomDropdownOpen) return;
    const handleClickOutside = (e) => {
      if (zoomDropdownRef.current && !zoomDropdownRef.current.contains(e.target)) {
        setZoomDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [zoomDropdownOpen]);

  // Grid dimensions of the scene actually on screen: displayedScene lags the `scene` prop during a
  // transition, and the props are the fallback until the first scene lands. Declared up here, above
  // the `if (!scene) return` exit below, so every consumer in the file can use the one expression.
  const dGridWidth = displayedScene?.gridWidth ?? gridWidth;
  const dGridHeight = displayedScene?.gridHeight ?? gridHeight;

  // canvasSize for rendering — derived from displayedScene so it only updates when the scene swap happens
  const canvasSize = useMemo(
    () => getCanvasSize(dGridWidth, dGridHeight),
    [dGridWidth, dGridHeight]
  );

  // Fit scene to viewport — reads canvasSizeRef directly so it works correctly when called
  // before the React render has propagated the new canvasSize value.
  const handleFit = useCallback(() => {
    const el = viewportRef.current;
    const cs = canvasSizeRef.current;
    if (!el || !cs) return;
    const totalW = cs.width + FRAME_SIZE * 2;
    const totalH = cs.height + FRAME_SIZE * 2;
    const fitZoom = Math.min(el.clientWidth / totalW, el.clientHeight / totalH, MAX_ZOOM);
    setZoom(fitZoom);
    zoomRef.current = fitZoom;
    if (schemeRef.current === 'classic') {
      // Classic: scroll to center the GRID (not the staging area) after React re-renders the
      // sizer with new dimensions. For the GM, `scene-viewport__transform` is anchored
      // OFFSCENE_MARGIN px inside the sizer (see its style below) so the grid no longer starts
      // at the sizer's origin — that anchor must be added back in before halving the slack, or
      // this would center the whole sizer (grid + staging area) instead of the grid alone. For a
      // player the anchor is 0, so this reduces to the pre-fix formula exactly.
      const anchor = (isGMRef.current ? OFFSCENE_MARGIN : 0) * fitZoom;
      const scaledW = totalW * fitZoom;
      const scaledH = totalH * fitZoom;
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, anchor + (scaledW - el.clientWidth) / 2);
        el.scrollTop = Math.max(0, anchor + (scaledH - el.clientHeight) / 2);
      });
    } else {
      // Modern positions purely by transform, so any scroll offset left over from classic mode is
      // pure displacement — and `overflow: hidden` KEEPS that offset (it only hides the scrollbars
      // and blocks user scrolling), while nothing on the modern path ever writes scrollLeft/Top.
      // Without this reset a GM switching classic -> modern kept the classic scroll, which for a GM
      // is the ~OFFSCENE_MARGIN anchor — parking the viewport deep in the staging margin where only
      // the veil is visible, with no way back since fit only moved panOffset.
      el.scrollLeft = 0;
      el.scrollTop = 0;
      const sw = totalW * fitZoom;
      const sh = totalH * fitZoom;
      const newOffset = { x: (el.clientWidth - sw) / 2, y: (el.clientHeight - sh) / 2 };
      setPanOffset(newOffset);
      panOffsetRef.current = newOffset;
    }
  }, []);

  // Zoom toward viewport center
  const applyZoom = useCallback((newZoom) => {
    const el = viewportRef.current;
    if (!el) return;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
    const oldZoom = zoomRef.current;
    if (schemeRef.current === 'classic') {
      const cx = el.clientWidth / 2;
      const cy = el.clientHeight / 2;
      const canvasX = (cx + el.scrollLeft) / oldZoom;
      const canvasY = (cy + el.scrollTop) / oldZoom;
      setZoom(clamped);
      zoomRef.current = clamped;
      requestAnimationFrame(() => {
        el.scrollLeft = canvasX * clamped - cx;
        el.scrollTop = canvasY * clamped - cy;
      });
    } else {
      const offset = panOffsetRef.current;
      const cx = (el.clientWidth / 2 - offset.x) / oldZoom;
      const cy = (el.clientHeight / 2 - offset.y) / oldZoom;
      const newOffsetX = el.clientWidth / 2 - cx * clamped;
      const newOffsetY = el.clientHeight / 2 - cy * clamped;
      setZoom(clamped);
      zoomRef.current = clamped;
      const newOffset = { x: newOffsetX, y: newOffsetY };
      setPanOffset(newOffset);
      panOffsetRef.current = newOffset;
    }
  }, []);

  // Scroll wheel zoom (toward mouse position)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !scene) return;
    const handleWheel = (e) => {
      if (schemeRef.current === 'classic') {
        if (e.ctrlKey || e.metaKey) {
          // Classic: Ctrl+scroll = zoom toward cursor
          e.preventDefault();
          const delta = -e.deltaY * WHEEL_ZOOM_FACTOR;
          const oldZoom = zoomRef.current;
          const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom + delta));
          const rect = el.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          const canvasX = (mouseX + el.scrollLeft) / oldZoom;
          const canvasY = (mouseY + el.scrollTop) / oldZoom;
          setZoom(newZoom);
          zoomRef.current = newZoom;
          requestAnimationFrame(() => {
            el.scrollLeft = canvasX * newZoom - mouseX;
            el.scrollTop = canvasY * newZoom - mouseY;
          });
        } else if (e.shiftKey || e.deltaX !== 0) {
          // Classic: Shift+scroll = horizontal scroll
          // On macOS browsers convert Shift+wheel to deltaX, so use deltaX when available
          e.preventDefault();
          el.scrollLeft += e.deltaX !== 0 ? e.deltaX : e.deltaY;
        }
        // Classic: plain scroll = native vertical scroll (no preventDefault)
        return;
      }
      // Modern: scroll = zoom toward cursor
      e.preventDefault();
      const delta = -e.deltaY * WHEEL_ZOOM_FACTOR;
      const oldZoom = zoomRef.current;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom + delta));
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const offset = panOffsetRef.current;
      const canvasX = (mouseX - offset.x) / oldZoom;
      const canvasY = (mouseY - offset.y) / oldZoom;
      const newOffsetX = mouseX - canvasX * newZoom;
      const newOffsetY = mouseY - canvasY * newZoom;
      setZoom(newZoom);
      zoomRef.current = newZoom;
      const newOffset = { x: newOffsetX, y: newOffsetY };
      setPanOffset(newOffset);
      panOffsetRef.current = newOffset;
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [scene]);

  const handleZoomIn = () => applyZoom(zoomRef.current + ZOOM_STEP);
  const handleZoomOut = () => applyZoom(zoomRef.current - ZOOM_STEP);

  // Scene transition:
  // useLayoutEffect fires synchronously before the browser paints, so setIsCovering(true)
  // causes React to immediately re-render with the overlay visible — the browser never paints
  // the new scene content without the overlay covering it.
  useLayoutEffect(() => {
    if (!scene) return;

    if (scene.id === displayedSceneIdRef.current) {
      // Live update on same scene (fog path, character move, etc.) — sync immediately
      setDisplayedScene(scene);
      return;
    }

    if (firstSceneLoad.current) {
      // First load: fit and show, no transition
      firstSceneLoad.current = false;
      displayedSceneIdRef.current = scene.id;
      canvasSizeRef.current = getCanvasSize(scene.gridWidth ?? gridWidth, scene.gridHeight ?? gridHeight);
      setDisplayedScene(scene);
      handleFit();
      return;
    }

    // Scene switch: capture target scene, then cover instantly before paint
    pendingSceneRef.current = scene;
    setIsCovering(true);
  }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once overlay is covering, wait then swap scene + fit + reveal
  useEffect(() => {
    if (!isCovering) return;
    const timer = setTimeout(() => {
      const sc = pendingSceneRef.current;
      displayedSceneIdRef.current = sc.id;
      canvasSizeRef.current = getCanvasSize(sc.gridWidth ?? gridWidth, sc.gridHeight ?? gridHeight);
      setDisplayedScene(sc);
      handleFit();
      // Wait for browser to paint the repositioned scene before fading the overlay out
      requestAnimationFrame(() => requestAnimationFrame(() => setIsCovering(false)));
    }, 250);
    return () => clearTimeout(timer);
  }, [isCovering]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pan on drag
  const editingLayerRef = useRef(editingLayer);
  useEffect(() => { editingLayerRef.current = editingLayer; }, [editingLayer]);
  const activeToolRef = useRef(activeTool);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  const isGMRef = useRef(isGM);
  useEffect(() => { isGMRef.current = isGM; }, [isGM]);
  const onEditingLayerChangeRef = useRef(onEditingLayerChange);
  useEffect(() => { onEditingLayerChangeRef.current = onEditingLayerChange; }, [onEditingLayerChange]);

  // Mode-switch feedback. seq forces a remount so two clicks in a row restart
  // the animation instead of continuing the first one.
  const [switchLabel, setSwitchLabel] = useState(null);
  const labelSeqRef = useRef(0);

  const schemeRef = useRef(controlScheme);
  useEffect(() => {
    schemeRef.current = controlScheme;
    if (canvasSizeRef.current) handleFit();
  }, [controlScheme]); // eslint-disable-line react-hooks/exhaustive-deps

  // Right-button drag pans the map on every layer and in both schemes; a right-CLICK still reaches
  // the layer's own menu (image, group, fog polygon, drawing stroke). See useRightDragPan for why
  // the native contextmenu is suppressed and replayed.
  const rightDragPan = useRightDragPan({
    viewportRef, panOffsetRef, schemeRef, setPanOffset, setIsPanning,
  });

  const handleViewportMouseDown = useCallback((e) => {
    // Middle click cycles scene modes. Must run before the control-scheme check
    // below — the shortcut works in both 'modern' and 'classic'.
    if (isModeCycleClick(e, document.activeElement)) {
      e.preventDefault(); // kills the native autoscroll on Chrome/Firefox (Windows/Linux)
      const target = nextMode(editingLayerRef.current, isGMRef.current);
      onEditingLayerChangeRef.current(target);
      setSwitchLabel({
        x: e.clientX,
        y: e.clientY,
        labelKey: modeLabelKey(target),
        seq: ++labelSeqRef.current,
      });
      return;
    }

    // Left button — modern-scheme pan on the grid layer only (existing behaviour).
    // Right-button pan lives in useRightDragPan (pointer events — Chrome on macOS never fires
    // mouseup for the secondary button), so this handler only ever deals with the left button.
    if (schemeRef.current !== 'modern') return;
    // Pan when in the default layer, or when the pan tool is active inside fog/drawing mode.
    if (e.button !== 0 || (editingLayerRef.current !== null && activeToolRef.current !== 'pan')) return;
    if (e.target.closest('.character-wrapper')) return;
    // Pressing a token (character or token-layer image) drags it, never the map.
    if (e.target.closest('.scene-image--token')) return;
    if (e.target.closest('.map-char-token')) return;
    if (!e.target.closest('.scene-viewport__sizer')) return;
    panStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: panOffsetRef.current.x,
      startY: panOffsetRef.current.y,
    };
    setIsPanning(true);
  }, []);

  useEffect(() => {
    const handleMove = (e) => {
      if (!panStartRef.current) return;
      const dx = e.clientX - panStartRef.current.mouseX;
      const dy = e.clientY - panStartRef.current.mouseY;
      const newOffset = { x: panStartRef.current.startX + dx, y: panStartRef.current.startY + dy };
      setPanOffset(newOffset);
      panOffsetRef.current = newOffset;
    };
    const handleUp = () => {
      if (!panStartRef.current) return;
      panStartRef.current = null;
      setIsPanning(false);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  // Pointer ping — hold detection
  const PING_MOVE_THRESHOLD = 5;
  const pingTimerRef = useRef(null);
  const pingOriginRef = useRef(null);
  // Mousedown position, used to tell a plain click (clears the active token) from a pan-drag.
  const clickDownPosRef = useRef(null);

  // --- Distance ruler (measure mode) ----------------------------------------------------
  const contentRef = useRef(null);
  const [isMeasuring, setIsMeasuring] = useState(false);

  // Token centers the ruler magnetizes to — characters + tokens-layer images, minus everything
  // players cannot see (see buildRulerSnapTargets for why that filter is a privacy gate).
  const rulerSnapTargets = useMemo(
    () => buildRulerSnapTargets({ characters: displayedScene?.characters, images: displayedScene?.images }),
    [displayedScene?.characters, displayedScene?.images],
  );

  // Ruler endpoint snapping: a token center wins when close (measure large tokens center-to-center);
  // otherwise, in snap mode, quantize to the cell center so distances are measured grid-cell to
  // grid-cell (matching how tokens are placed). Free mode keeps the continuous cursor point.
  const snapPoint = useCallback((p) => {
    const magnetized = snapPointToTokens(p, rulerSnapTargets);
    if (magnetized !== p) return magnetized; // snapPointToTokens returns p unchanged when no token is near
    if (tokenPlacementMode === 'snap') return { col: Math.floor(p.col) + 0.5, row: Math.floor(p.row) + 0.5 };
    return p;
  }, [rulerSnapTargets, tokenPlacementMode]);

  const ruler = useMapRuler({
    metric: measurementMetric, sendMessage, sceneId: displayedScene?.id,
    userId, userName, snapPoint, aoeEnabled,
    // Grid dimensions feed the off-scene broadcast gates (FEATURE-135).
    gridWidth: dGridWidth,
    gridHeight: dGridHeight,
  });
  const { start: rulerStart, move: rulerMove, end: rulerEnd } = ruler;

  const clientToCell = useCallback((clientX, clientY) => {
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return { col: 0, row: 0 };
    return { col: (clientX - rect.left) / zoom / CELL_SIZE, row: (clientY - rect.top) / zoom / CELL_SIZE };
  }, [zoom]);

  useEffect(() => {
    if (!isMeasuring) return;
    const onMove = (e) => rulerMove(clientToCell(e.clientX, e.clientY));
    const onUp = () => { rulerEnd(); setIsMeasuring(false); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isMeasuring, rulerMove, rulerEnd, clientToCell]);

  // Marquee candidates: tokens on the armed image layer. On the 'tokens' layer, character
  // placements join the token-layer images. Locked images are never selectable.
  // Characters are read from displayedScene.characters (SceneCharacter placements) — the same
  // characterToMapToken(gc) call convention buildRulerSnapTargets uses — NOT placedCharacters,
  // whose items carry col/row from fightZones rather than positionX/positionY and would give
  // characterToMapToken the wrong shape (all candidates collapsing to col:0,row:0).
  const marqueeCandidates = useMemo(() => {
    if (editingLayer !== 'select') return [];
    const imgs = (displayedScene?.images || []).filter(i => i.layer === imageEditLayer && !i.locked);
    const out = imgs.map(i => ({ kind: 'image', id: i.id, rect: imageToMapToken(i) }));
    if (imageEditLayer === 'tokens') {
      (displayedScene?.characters || []).forEach(sc => {
        out.push({ kind: 'char', id: sc.characterId, rect: characterToMapToken(sc) });
      });
    }
    return out;
  }, [editingLayer, imageEditLayer, displayedScene?.images, displayedScene?.characters]);

  // Marquee drag state: { x,y,width,height } in content px for rendering, plus col/row/w/h in
  // cells (added once the drag has moved) for the intersection test on mouseup.
  const [marquee, setMarquee] = useState(null);
  const marqueeStartRef = useRef(null);
  // Latest marquee rect in cells, kept in a ref so mouseup can read it and fire selection from the
  // EVENT handler — never from inside a setState updater (that runs during render and would setState
  // on the parent DndContext mid-render). null until the drag has actually moved.
  const marqueeRectRef = useRef(null);

  const handleContentMouseDown = useCallback((e) => {
    clickDownPosRef.current = { x: e.clientX, y: e.clientY };
    // Select mode: left-drag on empty content draws a marquee. Pressing a token instead starts
    // its own select/drag-move path (MapCharacterToken / SceneImage), so skip those targets.
    if (editingLayer === 'select') {
      if (e.button !== 0) return;
      // A press on an armed-layer, UNLOCKED token is a drag (single or group) — that token's own
      // handler owns it, so don't start a marquee there. Everything else starts a marquee: empty
      // grid, a LOCKED image (can't be dragged), or a non-armed backdrop (e.g. the background map
      // while editing the tokens layer). Lock a full-scene map to marquee tokens over it.
      const imgEl = e.target.closest('.scene-image');
      const charEl = e.target.closest('.map-char-token');
      // A press on a draggable token — an armed unlocked image, or a character (chars live on the
      // tokens layer) — is owned by that token's own single/group drag, so don't marquee there.
      // Marquee starts on empty grid, a LOCKED image, or a non-armed backdrop (e.g. the background
      // map while editing tokens; lock a full-scene map to marquee tokens over it).
      const onArmedDraggableImg = imgEl && imgEl.dataset.sceneLayer === imageEditLayer && !imgEl.classList.contains('scene-image--locked');
      const onChar = charEl && imageEditLayer === 'tokens';
      if (onArmedDraggableImg || onChar) return;
      const rect = contentRef.current.getBoundingClientRect();
      const col = (e.clientX - rect.left) / zoom / CELL_SIZE;
      const row = (e.clientY - rect.top) / zoom / CELL_SIZE;
      marqueeStartRef.current = { col, row, additive: e.shiftKey };
      marqueeRectRef.current = null; // set only once the drag moves, so a no-move click reads null
      setMarquee({ x: col * CELL_SIZE, y: row * CELL_SIZE, width: 0, height: 0 });
      return;
    }
    // Measure mode: left-drag lays out a ruler. Pressing a token is fine — snapPoint magnetizes
    // the origin to its center, so you measure FROM a token without moving it (tokens ignore the
    // press while measuring; see MapCharacterToken).
    if (editingLayer === 'measure') {
      if (e.button === 0) {
        rulerStart(clientToCell(e.clientX, e.clientY));
        setIsMeasuring(true);
      }
      return;
    }
    if (e.button !== 0 || !sendMessage || !displayedScene) return;
    // Pressing a token starts a token drag, not a pointer ping.
    if (e.target.closest('.map-char-token') || e.target.closest('.scene-image--token')) return;
    const contentEl = e.currentTarget;
    const rect = contentEl.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) / zoom;
    const canvasY = (e.clientY - rect.top) / zoom;
    pingOriginRef.current = { x: e.clientX, y: e.clientY };
    pingTimerRef.current = setTimeout(() => {
      sendMessage('POINTER_PING', { x: canvasX, y: canvasY, sceneId: displayedScene.id });
      pingTimerRef.current = null;
    }, PING_HOLD_MS);
  }, [sendMessage, displayedScene, zoom, editingLayer, imageEditLayer, rulerStart, clientToCell]);

  // Tracks the marquee drag: updates the rect on mousemove, computes the intersection on mouseup.
  useEffect(() => {
    if (!marquee) return;
    const onMove = (e) => {
      const s = marqueeStartRef.current;
      const rect = contentRef.current.getBoundingClientRect();
      const col = (e.clientX - rect.left) / zoom / CELL_SIZE;
      const row = (e.clientY - rect.top) / zoom / CELL_SIZE;
      const c0 = Math.min(s.col, col), r0 = Math.min(s.row, row);
      const w = Math.abs(col - s.col), h = Math.abs(row - s.row);
      marqueeRectRef.current = { col: c0, row: r0, w, h };
      setMarquee({ x: c0 * CELL_SIZE, y: r0 * CELL_SIZE, width: w * CELL_SIZE, height: h * CELL_SIZE });
    };
    const onUp = () => {
      const cur = marqueeRectRef.current;
      // Only a real drag (moved past the start point) changes the selection. A no-movement press —
      // including the click/ctrl-click/tap that opens the context menu — must NOT clear it; use
      // Escape or a fresh marquee to deselect. Clearing here wiped the selection out from under the
      // group menu (the press that opened it counted as an empty click).
      if (cur) {
        onMarqueeSelect?.(selectTokensInRect(cur, marqueeCandidates), marqueeStartRef.current?.additive);
      }
      marqueeRectRef.current = null;
      marqueeStartRef.current = null;
      setMarquee(null);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [marquee, zoom, marqueeCandidates, onMarqueeSelect]);

  const clearPingTimer = useCallback(() => {
    if (pingTimerRef.current) {
      clearTimeout(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    pingOriginRef.current = null;
  }, []);

  const handleContentMouseMove = useCallback((e) => {
    if (!pingOriginRef.current || !pingTimerRef.current) return;
    const dx = e.clientX - pingOriginRef.current.x;
    const dy = e.clientY - pingOriginRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > PING_MOVE_THRESHOLD) {
      clearPingTimer();
    }
  }, [clearPingTimer]);

  useEffect(() => clearPingTimer, [clearPingTimer]);

  // Click on the map background (image, empty grid) outside any token → clear the active token.
  // A token's own click stops propagation in FightArea, so it never reaches here. Skip drags
  // (pan) by comparing against the mousedown position, same threshold as the pointer ping.
  const handleBackgroundClick = useCallback((e) => {
    if (!onBackgroundClick) return;
    const down = clickDownPosRef.current;
    if (down) {
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (Math.sqrt(dx * dx + dy * dy) > PING_MOVE_THRESHOLD) return;
    }
    onBackgroundClick(e);
  }, [onBackgroundClick]);

  const isDrawingMode = editingLayer === 'drawing';

  // The hook owns when a label is saved or dropped; the styling of the resulting path is
  // this component's business, so it stays here.
  const handleTextCommit = useCallback(({ coords, text }) => {
    onDrawingPathComplete?.({
      tool: 'text',
      points: [coords],
      brushSize,
      color: drawingColor,
      fontSize: drawingFontSize,
      text,
    });
  }, [brushSize, drawingColor, drawingFontSize, onDrawingPathComplete]);

  const textInput = useDrawingTextInput({ onCommit: handleTextCommit });

  const scenePings = useMemo(
    () => pointerPings.filter(p => p.sceneId === displayedScene?.id),
    [pointerPings, displayedScene?.id]
  );

  // Group-drag controller: one delta (in cells) for the whole multi-selection. Characters are
  // sourced from displayedScene.characters (SceneCharacter: characterId/positionX/positionY) — the
  // same shape marqueeCandidates/rulerSnapTargets use above — NOT placedCharacters, whose fightZones
  // shape ({character,col,row,w,h}) doesn't match what characterToMapToken reads.
  const groupDrag = useGroupDrag({
    selectedTokens,
    images: (displayedScene?.images || []),
    characters: (displayedScene?.characters || []),
    gridWidth: dGridWidth,
    gridHeight: dGridHeight,
    snap: tokenPlacementMode === 'snap',
    zoom,
    onCommit: onCommitGroupMove,
    onMeasureStart: onTokenDragMeasureStart,
    onMeasureMove: onTokenDragMeasureMove,
    onMeasureEnd: onTokenDragMeasureEnd,
  });

  if (!scene) {
    return <div className="scene-viewport">{children}</div>;
  }

  const backgroundImages = (displayedScene?.images || []).filter(img => img.layer === 'background');
  const gmImages = (displayedScene?.images || []).filter(img => img.layer === 'gm');
  const tokenImages = (displayedScene?.images || []).filter(img => img.layer === 'tokens');

  // GM staging area: the grid plus the off-scene margin on every side. Players never render it,
  // and `content` keeps its own size/offset, so coordinates are unaffected. handleFit uses the
  // module-level OFFSCENE_MARGIN constant directly (see there for why); kept as a local alias here
  // since this render path reads it repeatedly (gmAnchor, the sizer's size, the veil's box).
  const offsceneMargin = OFFSCENE_MARGIN;
  // GM-in-classic anchor shift (pre-scale px) applied to `scene-viewport__transform` below, so the
  // grid — and the staging area around it — lands entirely inside the enlarged sizer's positive
  // coordinate space instead of spilling to the left/top where scroll can never reach. 0 for a
  // player or in modern mode, matching the unshifted anchor used before this margin existed.
  const gmAnchor = (controlScheme === 'classic' && isGM) ? offsceneMargin : 0;

  // Rulers are split across two overlays so the fog layer can sit between them (FEATURE-135):
  // other players' rulers render under the fog (a token moved under fog must not leak its path),
  // the local one stays on top (you keep your own line and readout when measuring toward fog).
  const selfRulers = [];
  const remoteRulers = [];
  if (ruler.ruler) {
    // Manual ruler tool → AoE circle when the toggle is on.
    selfRulers.push({ key: 'self', from: ruler.ruler.from, to: ruler.ruler.to, distance: ruler.distance, name: null, color: '#ffe08a', aoe: aoeEnabled });
  }
  // Live readout while dragging a token (local to the dragger) — no AoE circle.
  if (dragRuler) {
    selfRulers.push({
      key: 'drag',
      from: dragRuler.from,
      to: dragRuler.to,
      distance: distanceBetween({ col: dragRuler.from.col, row: dragRuler.from.row, w: 0, h: 0 }, { col: dragRuler.to.col, row: dragRuler.to.row, w: 0, h: 0 }, measurementMetric),
      name: null,
      color: '#ffe08a',
      aoe: false,
    });
  }
  mapRulers.forEach(r => {
    if (r.userId === userId) return; // own echo — already shown locally
    remoteRulers.push({
      key: r.userId,
      from: r.from,
      to: r.to,
      distance: distanceBetween({ col: r.from.col, row: r.from.row, w: 0, h: 0 }, { col: r.to.col, row: r.to.row, w: 0, h: 0 }, measurementMetric),
      name: r.name,
      color: rulerColorFor(r.userId),
      aoe: !!r.aoe, // remote ruler carries its own AoE flag (measurer's toggle)
    });
  });

  return (
    <ZoomContext.Provider value={{ zoom, gridWidth: dGridWidth, gridHeight: dGridHeight }}>
      <div className="scene-viewport-wrapper">
        {/* Overlay — at wrapper level to cover everything including high-z-index tokens.
            isCovering=true: opacity 1 instantly (no transition) to hide scene switch.
            isCovering=false: opacity 0 with CSS transition (fade out reveal). */}
        <div className={`scene-viewport__overlay${isCovering ? ' scene-viewport__overlay--covering' : ''}`} />

        <div className="scene-viewport__zoom-toolbar" ref={zoomDropdownRef}>
          <button className="scene-viewport__zoom-btn" onClick={handleZoomOut} title={t('scenes.zoomOut')}>-</button>
          <div className="scene-viewport__zoom-select">
            <button
              className="scene-viewport__zoom-btn scene-viewport__zoom-btn--level"
              onClick={() => setZoomDropdownOpen(prev => !prev)}
              title={t('scenes.zoomLevel')}
            >
              {Math.round(zoom * 100)}%&nbsp;▾
            </button>
            {zoomDropdownOpen && (
              <ul className="scene-viewport__zoom-dropdown" role="listbox">
                {ZOOM_PRESETS.map(preset => {
                  const isActive = Math.round(zoom * 100) === Math.round(preset * 100);
                  return (
                    <li
                      key={preset}
                      role="option"
                      aria-selected={isActive}
                      className={`scene-viewport__zoom-option${isActive ? ' scene-viewport__zoom-option--active' : ''}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyZoom(preset);
                        setZoomDropdownOpen(false);
                      }}
                    >
                      {Math.round(preset * 100)}%
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <button className="scene-viewport__zoom-btn" onClick={handleZoomIn} title={t('scenes.zoomIn')}>+</button>
          <button
            className="scene-viewport__zoom-btn scene-viewport__zoom-btn--fit"
            onClick={handleFit}
            title={t('scenes.fitToScreen')}
          >
            {t('scenes.fitToScreen')}
          </button>
        </div>

        <div
          ref={viewportRef}
          onMouseDownCapture={handleViewportMouseDown}
          onPointerDownCapture={rightDragPan.onPointerDownCapture}
          onContextMenuCapture={rightDragPan.onContextMenuCapture}
          className={`scene-viewport${controlScheme === 'classic' ? ' scene-viewport--classic' : ''}${isPanning ? ' scene-viewport--grabbing' : (controlScheme === 'modern' && editingLayer === null) ? ' scene-viewport--grab' : ''}`}
        >
          <div
            className="scene-viewport__sizer"
            style={controlScheme === 'classic'
              ? {
                  // GM only: pad the scrollable sizer by the staging margin so classic-mode scroll
                  // can reach it. The CSS scroll model can never reach negative-offset overflow, so
                  // `scene-viewport__transform` below shifts its anchor by the same margin, moving
                  // the grid (and the staging area around it) entirely into positive sizer space.
                  // handleFit's centering math accounts for that shift. Modern mode needs no
                  // equivalent change: panning there is unconstrained already.
                  width: (canvasSize.width + FRAME_SIZE * 2 + (isGM ? offsceneMargin * 2 : 0)) * zoom,
                  height: (canvasSize.height + FRAME_SIZE * 2 + (isGM ? offsceneMargin * 2 : 0)) * zoom,
                }
              : { transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }
            }
          >
            <div
              className="scene-viewport__transform"
              // translate() runs in the transform's own pre-scale coordinate space (applied before
              // scale in the composed matrix), so gmAnchor lines up with the same offsceneMargin
              // used for `content`'s and the veil's positions — everything inside moves as one unit.
              // gmAnchor is 0 for a player/modern, so this is `scale(zoom)` unchanged for them.
              style={{ transform: `scale(${zoom}) translate(${gmAnchor}px, ${gmAnchor}px)`, transformOrigin: '0 0' }}
            >
              <div
                ref={contentRef}
                className="scene-viewport__content"
                style={{
                  position: 'absolute',
                  top: FRAME_SIZE,
                  left: FRAME_SIZE,
                  width: canvasSize.width,
                  height: canvasSize.height,
                }}
                onMouseDownCapture={handleContentMouseDown}
                onMouseMove={handleContentMouseMove}
                onMouseUp={clearPingTimer}
                onMouseLeave={clearPingTimer}
                onClick={handleBackgroundClick}
                onContextMenu={(e) => {
                  // Only a real multi-selection (2+) opens the group menu; a lone token's right-click
                  // falls through to its own single-image menu (SceneImage.handleContextMenu).
                  if (editingLayer === 'select' && selectedTokens.length > 1) {
                    e.preventDefault();
                    setMultiMenu({ x: e.clientX, y: e.clientY });
                  }
                }}
              >
                <SceneLayer
                  images={backgroundImages}
                  layerName="background"
                  isGM={isGM}
                  gameId={gameId}
                  sceneId={displayedScene?.id}
                  editingLayer={editingLayer}
                  imageEditLayer={imageEditLayer}
                  selectedImageId={selectedImageId}
                  onSelectImage={onSelectImage}
                  isTokenSelected={isTokenSelected}
                  onToggleTokenSelected={onToggleTokenSelected}
                  multiSelectActive={selectedTokens.length > 1}
                  groupDragDelta={groupDrag.delta}
                  onGroupDragStart={groupDrag.begin}
                />

                {/* Visible grid as a CSS background (decoupled from drop-target cells). */}
                <div
                  className="map-grid-background"
                  style={{
                    position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
                    backgroundImage: (displayedScene?.gridVisible !== false)
                      ? `linear-gradient(to right, #d4a574 1px, transparent 1px), linear-gradient(to bottom, #d4a574 1px, transparent 1px)`
                      : 'none',
                    backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
                    opacity: 0.4,
                  }}
                />

                {/* Unified tokens layer — character tokens + token-layer images, one z-order. */}
                <MapTokensLayer
                  characters={placedCharacters}
                  images={tokenImages}
                  isGM={isGM}
                  gameId={gameId}
                  sceneId={displayedScene?.id}
                  gameSystem={gameSystem}
                  editingLayer={editingLayer}
                  imageEditLayer={imageEditLayer}
                  activeTool={activeTool}
                  tokenPlacementMode={tokenPlacementMode}
                  selectedImageId={selectedImageId}
                  onSelectImage={onSelectImage}
                  onTokenDragMeasureStart={onTokenDragMeasureStart}
                  onTokenDragMeasureMove={onTokenDragMeasureMove}
                  onTokenDragMeasureEnd={onTokenDragMeasureEnd}
                  isMultiplayer={isMultiplayer}
                  tokenDisplay={tokenDisplay}
                  token={token}
                  activeTokenId={activeTokenId}
                  onSelectCharacter={onSelectCharacter}
                  onCommitMove={onCommitMove}
                  onCommitResize={onCommitResize}
                  onCommitRotate={onCommitRotate}
                  isTokenSelected={isTokenSelected}
                  onToggleTokenSelected={onToggleTokenSelected}
                  multiSelectActive={selectedTokens.length > 1}
                  groupDragDelta={groupDrag.delta}
                  onGroupDragStart={groupDrag.begin}
                />

                {isGM && (
                  <SceneLayer
                    images={gmImages}
                    layerName="gm"
                    isGM={isGM}
                    gameId={gameId}
                    sceneId={displayedScene?.id}
                    editingLayer={editingLayer}
                    imageEditLayer={imageEditLayer}
                    selectedImageId={selectedImageId}
                    onSelectImage={onSelectImage}
                    isTokenSelected={isTokenSelected}
                    onToggleTokenSelected={onToggleTokenSelected}
                    multiSelectActive={selectedTokens.length > 1}
                    groupDragDelta={groupDrag.delta}
                    onGroupDragStart={groupDrag.begin}
                  />
                )}

                {isGM && (
                  <div
                    className="scene-offscene-veil"
                    style={{
                      // Positioned relative to `content` so its content box lands exactly on the
                      // grid; the border (content-box sizing, see CSS) then extends outward by
                      // offsceneMargin on every side, greying the staging ring around it exactly —
                      // no clip-path needed.
                      left: -offsceneMargin,
                      top: -offsceneMargin,
                      width: canvasSize.width,
                      height: canvasSize.height,
                      borderWidth: offsceneMargin,
                      zIndex: 11, // above every image layer (background 1, tokens 5, gm 10)
                    }}
                  />
                )}

                {scenePings.map(ping => (
                  <PointerPing
                    key={ping.id}
                    x={ping.x}
                    y={ping.y}
                    onComplete={() => onRemovePing?.(ping.id)}
                  />
                ))}

                {displayedScene && (
                  <FogLayer
                    scene={displayedScene}
                    isGM={isGM}
                    editingLayer={editingLayer}
                    brushSize={brushSize}
                    fogGmOpacity={fogGmOpacity}
                    fogTool={activeTool}
                    fogCoverMode={fogCoverMode}
                    onPathComplete={onFogPathComplete}
                    canvasWidth={canvasSize.width}
                    canvasHeight={canvasSize.height}
                  />
                )}

                {displayedScene && (
                  <DrawingLayer
                    scene={displayedScene}
                    isDrawingMode={isDrawingMode}
                    activeTool={activeTool}
                    brushSize={brushSize}
                    color={drawingColor}
                    fontSize={drawingFontSize}
                    onPathComplete={onDrawingPathComplete}
                    onTextPlacement={textInput.placeAt}
                    selectedPathId={selectedPathId}
                    onSelectionChange={onSelectionChange}
                    onDeletePath={onDeletePath}
                    userId={userId}
                    isGM={isGM}
                    canvasWidth={canvasSize.width}
                    canvasHeight={canvasSize.height}
                  />
                )}

                {/* Other players' rulers: below FogLayer (30) — see MapRulerOverlay for why.
                    clip keeps everything they draw inside the canvas rect, so the fog canvas
                    covers all of it — the distance badge near the top edge included. */}
                <MapRulerOverlay
                  rulers={remoteRulers}
                  cellDistance={cellDistance}
                  unit={distanceUnit}
                  canvasWidth={canvasSize.width}
                  canvasHeight={canvasSize.height}
                  zIndex={28}
                  clip
                />

                {/* Own ruler: above the fog, so measuring toward a fogged area stays readable. */}
                <MapRulerOverlay
                  rulers={selfRulers}
                  cellDistance={cellDistance}
                  unit={distanceUnit}
                  canvasWidth={canvasSize.width}
                  canvasHeight={canvasSize.height}
                />

                <MarqueeOverlay rect={marquee} />

                {multiMenu && (
                  <SceneTokenMultiContextMenu
                    x={multiMenu.x} y={multiMenu.y} selection={selectedTokens}
                    onDelete={onGroupDelete} onSetLock={onGroupSetLock}
                    onSetLayer={onGroupSetLayer} onResetRotation={onGroupResetRotation}
                    onClose={() => setMultiMenu(null)}
                  />
                )}

                {textInput.pos && (
                  <input
                    autoFocus
                    type="text"
                    value={textInput.value}
                    onChange={e => textInput.setValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') textInput.commit();
                      if (e.key === 'Escape') textInput.cancel();
                    }}
                    onBlur={textInput.commit}
                    style={{
                      position: 'absolute',
                      left: textInput.pos[0],
                      top: textInput.pos[1],
                      zIndex: 30,
                      background: 'rgba(0,0,0,0.7)',
                      color: drawingColor,
                      border: `1px solid ${drawingColor}`,
                      fontSize: drawingFontSize,
                      fontFamily: 'sans-serif',
                      padding: '2px 4px',
                      outline: 'none',
                      minWidth: 80,
                    }}
                  />
                )}
              </div>

              <div
                className="scene-viewport__frame"
                style={{
                  width: canvasSize.width + FRAME_SIZE * 2,
                  height: canvasSize.height + FRAME_SIZE * 2,
                }}
              />
            </div>
          </div>
        </div>

        {switchLabel && (
          <ModeSwitchLabel
            key={switchLabel.seq}
            x={switchLabel.x}
            y={switchLabel.y}
            labelKey={switchLabel.labelKey}
            onDone={() => setSwitchLabel(null)}
          />
        )}
      </div>
    </ZoomContext.Provider>
  );
};

export default SceneViewport;
