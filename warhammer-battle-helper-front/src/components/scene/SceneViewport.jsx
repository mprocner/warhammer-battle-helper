import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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


const SceneViewport = ({
  scene, isGM, gameId, editingLayer, gridWidth, gridHeight, children,
  onZoomChange, sendMessage, pointerPings = [], onRemovePing,
  brushSize = 10, activeTool = 'freehand', fogCoverMode = false, onFogPathComplete,
  drawingColor = '#ff0000', drawingFontSize = 16, onDrawingPathComplete,
  selectedPathId = null, onSelectionChange, onDeletePath,
}) => {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef(null);
  const [textInputPos, setTextInputPos] = useState(null);
  const [textInputValue, setTextInputValue] = useState('');
  const viewportRef = useRef(null);

  // Refs so event handlers always see current values without re-registering
  const zoomRef = useRef(zoom);
  const panOffsetRef = useRef(panOffset);

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);

  useEffect(() => {
    onZoomChange?.(zoom);
  }, [zoom, onZoomChange]);

  const canvasSize = useMemo(
    () => getCanvasSize(gridWidth, gridHeight),
    [gridWidth, gridHeight]
  );

  // Reset pan offset when switching scenes
  useEffect(() => {
    setPanOffset({ x: 0, y: 0 });
    panOffsetRef.current = { x: 0, y: 0 };
  }, [scene?.id]);

  // Calculate fit-to-screen zoom
  const calcFitZoom = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return 1;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const totalW = canvasSize.width + FRAME_SIZE * 2;
    const totalH = canvasSize.height + FRAME_SIZE * 2;
    return Math.min(vw / totalW, vh / totalH, MAX_ZOOM);
  }, [canvasSize]);

  // Zoom toward viewport center, clamping pan offset to stay in bounds
  const applyZoom = useCallback((newZoom) => {
    const el = viewportRef.current;
    if (!el) return;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
    const oldZoom = zoomRef.current;
    const offset = panOffsetRef.current;

    // Canvas point currently under the viewport center
    const cx = (el.clientWidth / 2 - offset.x) / oldZoom;
    const cy = (el.clientHeight / 2 - offset.y) / oldZoom;

    // New offset to keep same canvas point under viewport center
    const newOffsetX = el.clientWidth / 2 - cx * clamped;
    const newOffsetY = el.clientHeight / 2 - cy * clamped;

    setZoom(clamped);
    zoomRef.current = clamped;
    const newOffset = { x: newOffsetX, y: newOffsetY };
    setPanOffset(newOffset);
    panOffsetRef.current = newOffset;
  }, []);

  // Scroll wheel zoom (toward mouse position)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !scene) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const delta = -e.deltaY * WHEEL_ZOOM_FACTOR;
      const oldZoom = zoomRef.current;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom + delta));

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const offset = panOffsetRef.current;
      // Canvas point currently under mouse
      const canvasX = (mouseX - offset.x) / oldZoom;
      const canvasY = (mouseY - offset.y) / oldZoom;

      // New offset so same canvas point stays under mouse
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

  const handleFit = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const fitZoom = calcFitZoom();
    const sw = (canvasSize.width + FRAME_SIZE * 2) * fitZoom;
    const sh = (canvasSize.height + FRAME_SIZE * 2) * fitZoom;
    // Center the scene in the viewport after fitting
    const newOffset = { x: (el.clientWidth - sw) / 2, y: (el.clientHeight - sh) / 2 };
    setZoom(fitZoom);
    zoomRef.current = fitZoom;
    setPanOffset(newOffset);
    panOffsetRef.current = newOffset;
  }, [calcFitZoom, canvasSize]);

  // Pan on drag — moves scene via translate, clamped to viewport bounds
  const editingLayerRef = useRef(editingLayer);
  useEffect(() => { editingLayerRef.current = editingLayer; }, [editingLayer]);

  const handleViewportMouseDown = useCallback((e) => {
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
      const el = viewportRef.current;
      if (!el) return;
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
  const pingTimerRef = useRef(null);

  const handleContentMouseDown = useCallback((e) => {
    if (e.button !== 0 || !sendMessage || !scene || (editingLayer !== 'fog' && editingLayer !== 'drawing')) return;

    const contentEl = e.currentTarget;
    const rect = contentEl.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) / zoom;
    const canvasY = (e.clientY - rect.top) / zoom;

    pingTimerRef.current = setTimeout(() => {
      sendMessage('POINTER_PING', { x: canvasX, y: canvasY, sceneId: scene.id });
      pingTimerRef.current = null;
    }, PING_HOLD_MS);
  }, [sendMessage, scene, zoom, editingLayer]);

  const clearPingTimer = useCallback(() => {
    if (pingTimerRef.current) {
      clearTimeout(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

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
    () => pointerPings.filter(p => p.sceneId === scene?.id),
    [pointerPings, scene?.id]
  );

  if (!scene) {
    return <div className="scene-viewport">{children}</div>;
  }

  const backgroundImages = (scene.images || []).filter(img => img.layer === 'background');
  const gmImages = (scene.images || []).filter(img => img.layer === 'gm');

  const zoomContextValue = { zoom, gridWidth, gridHeight };

  return (
    <ZoomContext.Provider value={zoomContextValue}>
      <div className="scene-viewport-wrapper">
        {/* Zoom toolbar — positioned over the viewport */}
        <div className="scene-viewport__zoom-toolbar">
          <button
            className="scene-viewport__zoom-btn"
            onClick={handleZoomOut}
            title={t('scenes.zoomOut')}
          >
            -
          </button>
          <span className="scene-viewport__zoom-level">
            {Math.round(zoom * 100)}%
          </span>
          <button
            className="scene-viewport__zoom-btn"
            onClick={handleZoomIn}
            title={t('scenes.zoomIn')}
          >
            +
          </button>
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
          className={`scene-viewport${isPanning ? ' scene-viewport--grabbing' : editingLayer === null ? ' scene-viewport--grab' : ''}`}
        >
          {/* Sizer — translated to pan the scene; overflow:hidden clips outside bounds */}
          <div
            className="scene-viewport__sizer"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
            }}
          >
            {/* Transform — applies visual scale */}
            <div
              className="scene-viewport__transform"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: '0 0',
              }}
            >
              {/* Content — pure grid area, offset by frame size */}
              <div
                className="scene-viewport__content"
                style={{
                  position: 'absolute',
                  top: FRAME_SIZE,
                  left: FRAME_SIZE,
                  width: canvasSize.width,
                  height: canvasSize.height,
                }}
                onMouseDown={handleContentMouseDown}
                onMouseUp={clearPingTimer}
                onMouseLeave={clearPingTimer}
              >
                {/* Background layer */}
                <SceneLayer
                  images={backgroundImages}
                  layerName="background"
                  isGM={isGM}
                  gameId={gameId}
                  sceneId={scene.id}
                  editingLayer={editingLayer}
                />

                {/* Grid layer */}
                <div
                  className="scene-viewport__grid-layer"
                  style={{ pointerEvents: 'none' }}
                >
                  {children}
                </div>

                {/* GM layer */}
                {isGM && (
                  <SceneLayer
                    images={gmImages}
                    layerName="gm"
                    isGM={isGM}
                    gameId={gameId}
                    sceneId={scene.id}
                    editingLayer={editingLayer}
                  />
                )}

                {/* Pointer pings */}
                {scenePings.map(ping => (
                  <PointerPing
                    key={ping.id}
                    x={ping.x}
                    y={ping.y}
                    onComplete={() => onRemovePing?.(ping.id)}
                  />
                ))}

                {/* Fog of War layer */}
                {(isGM ? editingLayer === 'fog' : scene.fogEnabled) && (
                  <FogLayer
                    scene={scene}
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

                {/* Drawing layer */}
                {scene && (
                  <DrawingLayer
                    scene={scene}
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

                {/* Floating text input for text tool */}
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
              {/* Decorative frame — rendered after content so it appears on top */}
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
