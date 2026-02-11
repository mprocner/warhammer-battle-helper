import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import SceneLayer from './SceneLayer';
import ZoomContext from './ZoomContext';
import { getCanvasSize, MIN_ZOOM, MAX_ZOOM } from '../../constants/scene';
import './SceneViewport.css';

const ZOOM_STEP = 0.1;
const WHEEL_ZOOM_FACTOR = 0.001;

const SceneViewport = ({ scene, isGM, gameId, editingLayer, gridWidth, gridHeight, children, onZoomChange }) => {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(1);
  const viewportRef = useRef(null);
  const prevSceneKeyRef = useRef(null);

  useEffect(() => {
    onZoomChange?.(zoom);
  }, [zoom, onZoomChange]);

  const canvasSize = useMemo(
    () => getCanvasSize(gridWidth, gridHeight),
    [gridWidth, gridHeight]
  );

  // Calculate fit-to-screen zoom
  const calcFitZoom = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return 1;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    return Math.min(vw / canvasSize.width, vh / canvasSize.height, MAX_ZOOM);
  }, [canvasSize]);

  // Auto-fit on mount and when scene/grid changes
  useEffect(() => {
    const sceneKey = `${scene?.id}-${gridWidth}-${gridHeight}`;
    if (prevSceneKeyRef.current !== sceneKey) {
      prevSceneKeyRef.current = sceneKey;
      // Delay to let the DOM settle
      requestAnimationFrame(() => {
        setZoom(calcFitZoom());
      });
    }
  }, [scene?.id, gridWidth, gridHeight, calcFitZoom]);

  // Center-preserving zoom helper
  const applyZoom = useCallback((newZoom) => {
    const el = viewportRef.current;
    if (!el) return;

    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
    const oldZoom = zoom;

    // Center of viewport in canvas coords
    const cx = (el.scrollLeft + el.clientWidth / 2) / oldZoom;
    const cy = (el.scrollTop + el.clientHeight / 2) / oldZoom;

    setZoom(clamped);

    requestAnimationFrame(() => {
      el.scrollLeft = cx * clamped - el.clientWidth / 2;
      el.scrollTop = cy * clamped - el.clientHeight / 2;
    });
  }, [zoom]);

  // Ctrl+Scroll wheel zoom
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !scene) return;

    const handleWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      const delta = -e.deltaY * WHEEL_ZOOM_FACTOR;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + delta));

      // Zoom toward mouse position
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const canvasX = (el.scrollLeft + mouseX) / zoom;
      const canvasY = (el.scrollTop + mouseY) / zoom;

      setZoom(newZoom);

      requestAnimationFrame(() => {
        el.scrollLeft = canvasX * newZoom - mouseX;
        el.scrollTop = canvasY * newZoom - mouseY;
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [scene, zoom]);

  const handleZoomIn = () => applyZoom(zoom + ZOOM_STEP);
  const handleZoomOut = () => applyZoom(zoom - ZOOM_STEP);
  const handleFit = () => applyZoom(calcFitZoom());

  // No scene — keep current responsive behavior (no zoom wrapper)
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
            Fit
          </button>
        </div>

        <div className="scene-viewport" ref={viewportRef}>
          {/* Sizer — sets scroll extent */}
          <div
            className="scene-viewport__sizer"
            style={{
              width: canvasSize.width * zoom,
              height: canvasSize.height * zoom,
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
              {/* Content — fixed canvas size */}
              <div
                className="scene-viewport__content"
                style={{
                  width: canvasSize.width,
                  height: canvasSize.height,
                }}
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
                <div className="scene-viewport__grid-layer">
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </ZoomContext.Provider>
  );
};

export default SceneViewport;
