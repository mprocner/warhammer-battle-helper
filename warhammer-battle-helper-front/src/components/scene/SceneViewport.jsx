import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import SceneLayer from './SceneLayer';
import FogLayer from './FogLayer';
import DrawingLayer from './DrawingLayer';
import ZoomContext from './ZoomContext';
import PointerPing from './PointerPing';
import { getCanvasSize, MIN_ZOOM, MAX_ZOOM, GRID_BORDER, GRID_PADDING } from '../../constants/scene';
import './SceneViewport.css';

const FRAME_SIZE = GRID_BORDER + GRID_PADDING; // 26px — outer border + inner frame

const ZOOM_STEP = 0.1;
const WHEEL_ZOOM_FACTOR = 0.001;
const PING_HOLD_MS = 500;
const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0];

const SceneViewport = ({
  scene, isGM, gameId, editingLayer, gridWidth, gridHeight, children,
  onZoomChange, sendMessage, pointerPings = [], onRemovePing,
  brushSize = 10, activeTool = 'freehand', fogCoverMode = false, onFogPathComplete,
  drawingColor = '#ff0000', drawingFontSize = 16, onDrawingPathComplete,
  selectedPathId = null, onSelectionChange, onDeletePath,
  controlScheme = 'modern',
}) => {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(1);
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
  const [textInputPos, setTextInputPos] = useState(null);
  const [textInputValue, setTextInputValue] = useState('');
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

  // canvasSize for rendering — derived from displayedScene so it only updates when the scene swap happens
  const canvasSize = useMemo(
    () => getCanvasSize(
      displayedScene?.gridWidth ?? gridWidth,
      displayedScene?.gridHeight ?? gridHeight
    ),
    [displayedScene, gridWidth, gridHeight]
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
      // Classic: scroll to center after React re-renders sizer with new dimensions
      const scaledW = totalW * fitZoom;
      const scaledH = totalH * fitZoom;
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, (scaledW - el.clientWidth) / 2);
        el.scrollTop = Math.max(0, (scaledH - el.clientHeight) / 2);
      });
    } else {
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

  const schemeRef = useRef(controlScheme);
  useEffect(() => {
    schemeRef.current = controlScheme;
    if (canvasSizeRef.current) handleFit();
  }, [controlScheme]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleViewportMouseDown = useCallback((e) => {
    if (schemeRef.current !== 'modern') return;
    if (e.button !== 0 || editingLayerRef.current !== null) return;
    if (e.target.closest('.character-wrapper')) return;
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

  const handleContentMouseDown = useCallback((e) => {
    if (e.button !== 0 || !sendMessage || !displayedScene) return;
    const contentEl = e.currentTarget;
    const rect = contentEl.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) / zoom;
    const canvasY = (e.clientY - rect.top) / zoom;
    pingOriginRef.current = { x: e.clientX, y: e.clientY };
    pingTimerRef.current = setTimeout(() => {
      sendMessage('POINTER_PING', { x: canvasX, y: canvasY, sceneId: displayedScene.id });
      pingTimerRef.current = null;
    }, PING_HOLD_MS);
  }, [sendMessage, displayedScene, zoom]);

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

  const isDrawingMode = editingLayer === 'drawing';

  const handleTextPlacement = useCallback((coords) => {
    setTextInputPos(coords);
    setTextInputValue('');
  }, []);

  const commitText = useCallback((value) => {
    if (value.trim() && textInputPos && onDrawingPathComplete) {
      onDrawingPathComplete({
        tool: 'text',
        points: [textInputPos],
        brushSize,
        color: drawingColor,
        fontSize: drawingFontSize,
        text: value.trim(),
      });
    }
    setTextInputPos(null);
    setTextInputValue('');
  }, [textInputPos, brushSize, drawingColor, drawingFontSize, onDrawingPathComplete]);

  const scenePings = useMemo(
    () => pointerPings.filter(p => p.sceneId === displayedScene?.id),
    [pointerPings, displayedScene?.id]
  );

  if (!scene) {
    return <div className="scene-viewport">{children}</div>;
  }

  const backgroundImages = (displayedScene?.images || []).filter(img => img.layer === 'background');
  const gmImages = (displayedScene?.images || []).filter(img => img.layer === 'gm');
  const dGridWidth = displayedScene?.gridWidth ?? gridWidth;
  const dGridHeight = displayedScene?.gridHeight ?? gridHeight;

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
          className={`scene-viewport${controlScheme === 'classic' ? ' scene-viewport--classic' : ''}${isPanning ? ' scene-viewport--grabbing' : (controlScheme === 'modern' && editingLayer === null) ? ' scene-viewport--grab' : ''}`}
        >
          <div
            className="scene-viewport__sizer"
            style={controlScheme === 'classic'
              ? { width: (canvasSize.width + FRAME_SIZE * 2) * zoom, height: (canvasSize.height + FRAME_SIZE * 2) * zoom }
              : { transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }
            }
          >
            <div
              className="scene-viewport__transform"
              style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}
            >
              <div
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
              >
                <SceneLayer
                  images={backgroundImages}
                  layerName="background"
                  isGM={isGM}
                  gameId={gameId}
                  sceneId={displayedScene?.id}
                  editingLayer={editingLayer}
                />

                <div
                  className={`scene-viewport__grid-layer${isDrawingMode ? ' scene-viewport__grid-layer--drawing' : ''}`}
                  style={{ pointerEvents: 'none' }}
                >
                  {children}
                </div>

                {isGM && (
                  <SceneLayer
                    images={gmImages}
                    layerName="gm"
                    isGM={isGM}
                    gameId={gameId}
                    sceneId={displayedScene?.id}
                    editingLayer={editingLayer}
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

                {(isGM ? editingLayer === 'fog' : displayedScene?.fogEnabled) && (
                  <FogLayer
                    scene={displayedScene}
                    isGM={isGM}
                    editingLayer={editingLayer}
                    brushSize={brushSize}
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
                    onTextPlacement={handleTextPlacement}
                    selectedPathId={selectedPathId}
                    onSelectionChange={onSelectionChange}
                    onDeletePath={onDeletePath}
                    canvasWidth={canvasSize.width}
                    canvasHeight={canvasSize.height}
                  />
                )}

                {textInputPos && (
                  <input
                    autoFocus
                    type="text"
                    value={textInputValue}
                    onChange={e => setTextInputValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitText(textInputValue);
                      if (e.key === 'Escape') { setTextInputPos(null); setTextInputValue(''); }
                    }}
                    onBlur={() => commitText(textInputValue)}
                    style={{
                      position: 'absolute',
                      left: textInputPos[0],
                      top: textInputPos[1],
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
      </div>
    </ZoomContext.Provider>
  );
};

export default SceneViewport;
