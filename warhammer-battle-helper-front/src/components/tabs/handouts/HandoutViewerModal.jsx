import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getApiUrl } from '../../../api/axios';
import { resolveFileUrl } from '../../../utils/fileUrl';
import HandoutTypeIcon from './HandoutTypeIcon';
import ModalHeader from '../../common/ModalHeader';
import { useManagedWindow, useWindowManager } from '../../../contexts/WindowManagerContext';
import './HandoutViewerModal.css';

/**
 * Modal for viewing handout content (draggable, minimizable, no overlay)
 */
const MIN_WIDTH = 300;
const MIN_HEIGHT = 200;

const HandoutViewerModal = ({ isOpen, onClose, handout, index = 0 }) => {
  const { t } = useTranslation();
  const { toggleHidden } = useWindowManager();
  const windowId = handout ? `handout:${handout.id}` : null;
  const { hidden, zIndex, focus } = useManagedWindow({ id: windowId, kind: 'handout', title: handout?.title, onClose });
  const [textContent, setTextContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [size, setSize] = useState({ width: 900, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDir, setResizeDir] = useState(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [isImagePanning, setIsImagePanning] = useState(false);
  const popupRef = useRef(null);
  const imageContainerRef = useRef(null);
  const imageRef = useRef(null);
  const imageZoomRef = useRef(1);
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });

  const fetchTextContent = useCallback(async () => {
    if (!handout?.fileUrl) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(resolveFileUrl(handout.fileUrl));
      if (!response.ok) throw new Error('Failed to fetch text content');

      const text = await response.text();
      setTextContent(text);
    } catch (err) {
      console.error('Failed to fetch text content:', err);
      setError(t('handouts.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [handout?.fileUrl, t]);

  useEffect(() => {
    if (isOpen && handout) {
      const lower = (handout.fileUrl || '').toLowerCase().split('?')[0];
      const isTextFile = !lower.match(/\.(jpg|jpeg|png|gif|webp|pdf)$/);
      if (isTextFile) {
        fetchTextContent();
      }
    }
  }, [isOpen, handout, fetchTextContent]);

  // Reset position, size and zoom when opening or switching handout
  useEffect(() => {
    if (isOpen) {
      setPosition({ x: 100 + index * 30, y: 100 + index * 30 });
      setSize({ width: 900, height: 0 });
      setIsMinimized(false);
      setImageZoom(1);
      setImagePan({ x: 0, y: 0 });
    }
  }, [isOpen, handout?.id, index]);

  // Wheel zoom for images (passive: false required to preventDefault)
  useEffect(() => {
    const el = imageContainerRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.2, Math.min(5, imageZoomRef.current * factor));
      setImageZoom(newZoom);
      setImagePan(prev => clampImagePan(prev.x, prev.y, newZoom));
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handout?.fileUrl, isMinimized, hidden]);

  useEffect(() => { imageZoomRef.current = imageZoom; }, [imageZoom]);

  const clampImagePan = useCallback((panX, panY, zoom) => {
    const container = imageContainerRef.current;
    const img = imageRef.current;
    if (!container || !img) return { x: panX, y: panY };

    const scaledW = img.offsetWidth * zoom;
    const scaledH = img.offsetHeight * zoom;
    const maxPanX = Math.max(0, (scaledW - container.clientWidth) / 2);
    const maxPanY = Math.max(0, (scaledH - container.clientHeight) / 2);

    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, panX)),
      y: Math.max(-maxPanY, Math.min(maxPanY, panY)),
    };
  }, []);

  const resetImageView = useCallback(() => {
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
  }, []);

  // Clamp position so the header bar always stays on screen
  const clampPosition = useCallback((x, y) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const el = popupRef.current;
    const elWidth = el ? el.offsetWidth : 300;
    const headerHeight = 46;

    const minVisibleX = 80;
    const clampedX = Math.max(-elWidth + minVisibleX, Math.min(x, vw - minVisibleX));
    const clampedY = Math.max(0, Math.min(y, vh - headerHeight));

    return { x: clampedX, y: clampedY };
  }, []);

  // Modal drag handlers
  const handleMouseDown = (e) => {
    focus();
    if (e.target.closest('.modal-header') && !e.target.closest('.modal-header__buttons')) {
      setIsDragging(true);
      const rect = popupRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  // Image pan handlers
  const handleImageMouseDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setIsImagePanning(true);
    panStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: imagePan.x,
      panY: imagePan.y,
    };
  };

  // Resize handlers
  const handleResizeMouseDown = (e, direction) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    setResizeDir(direction);
    const rect = popupRef.current.getBoundingClientRect();
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
      posX: position.x,
      posY: position.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging) {
        const clamped = clampPosition(e.clientX - dragOffset.x, e.clientY - dragOffset.y);
        setPosition(clamped);
      }
      if (isResizing && resizeDir) {
        const dx = e.clientX - resizeStart.x;
        const dy = e.clientY - resizeStart.y;
        const dir = resizeDir;

        let newWidth = resizeStart.width;
        let newHeight = resizeStart.height;
        let newX = resizeStart.posX;
        let newY = resizeStart.posY;

        if (dir.includes('e')) newWidth = Math.max(MIN_WIDTH, resizeStart.width + dx);
        if (dir.includes('s')) newHeight = Math.max(MIN_HEIGHT, resizeStart.height + dy);
        if (dir.includes('w')) {
          newWidth = Math.max(MIN_WIDTH, resizeStart.width - dx);
          if (newWidth > MIN_WIDTH) newX = resizeStart.posX + dx;
        }
        if (dir.includes('n')) {
          newHeight = Math.max(MIN_HEIGHT, resizeStart.height - dy);
          if (newHeight > MIN_HEIGHT) newY = resizeStart.posY + dy;
        }

        setSize({ width: newWidth, height: newHeight });
        const clamped = clampPosition(newX, newY);
        setPosition(clamped);
      }
      if (isImagePanning) {
        const dx = e.clientX - panStartRef.current.mouseX;
        const dy = e.clientY - panStartRef.current.mouseY;
        setImagePan(clampImagePan(
          panStartRef.current.panX + dx,
          panStartRef.current.panY + dy,
          imageZoomRef.current,
        ));
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setResizeDir(null);
      setIsImagePanning(false);
    };

    if (isDragging || isResizing || isImagePanning) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, isResizing, resizeDir, resizeStart, isImagePanning, clampPosition, clampImagePan]);

  if (!isOpen || !handout || hidden) return null;

  // Dedicated guard for the iframe sink — resolveFileUrl() resolves, it does not
  // sanitize. handout.fileUrl is unvalidated by the backend and settable by any
  // participant. The trailing slash matters: startsWith(getApiUrl()) alone would
  // also accept http://localhost:8080.evil.com/x.pdf.
  const isSafeIframeUrl = (url) => url.startsWith(`${getApiUrl()}/`);

  const getFileTypeFromUrl = (url) => {
    if (!url) return 'text';
    const lower = url.toLowerCase().split('?')[0];
    if (lower.match(/\.(jpg|jpeg|png|gif|webp)$/)) return 'image';
    if (lower.match(/\.pdf$/)) return 'pdf';
    return 'text';
  };

  const renderContent = () => {
    const fileUrl = resolveFileUrl(handout.fileUrl);
    const fileType = getFileTypeFromUrl(handout.fileUrl);

    if (fileType === 'image') {
      const isZoomed = imageZoom !== 1 || imagePan.x !== 0 || imagePan.y !== 0;
      return (
        <div className="handout-viewer__image-wrapper">
          <div
            ref={imageContainerRef}
            className="handout-viewer__image-container"
            style={{ cursor: isImagePanning ? 'grabbing' : (imageZoom > 1 ? 'grab' : 'default') }}
            onMouseDown={handleImageMouseDown}
          >
            <img
              ref={imageRef}
              src={fileUrl}
              alt={handout.title}
              className="handout-viewer__image"
              style={{
                transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom})`,
                transformOrigin: 'center center',
              }}
              onDoubleClick={resetImageView}
              draggable={false}
            />
          </div>
          <div className="handout-viewer__image-controls">
            <button
              className="handout-viewer__zoom-btn"
              onClick={() => {
                const newZoom = Math.max(0.2, imageZoom * 0.9);
                setImageZoom(newZoom);
                setImagePan(prev => clampImagePan(prev.x, prev.y, newZoom));
              }}
              title="Zoom out"
            >−</button>
            <button
              className={`handout-viewer__zoom-btn handout-viewer__zoom-btn--label ${isZoomed ? 'handout-viewer__zoom-btn--active' : ''}`}
              onClick={resetImageView}
              title="Reset view"
            >
              {Math.round(imageZoom * 100)}%
            </button>
            <button
              className="handout-viewer__zoom-btn"
              onClick={() => {
                const newZoom = Math.min(5, imageZoom * 1.1);
                setImageZoom(newZoom);
                setImagePan(prev => clampImagePan(prev.x, prev.y, newZoom));
              }}
              title="Zoom in"
            >+</button>
          </div>
        </div>
      );
    }

    if (fileType === 'pdf') {
      if (!isSafeIframeUrl(fileUrl)) {
        return <div className="handout-viewer__error">{t('handouts.unsupportedFile')}</div>;
      }
      return (
        <div className="handout-viewer__pdf-container">
          <iframe
            src={fileUrl}
            title={handout.title}
            className="handout-viewer__pdf"
          />
        </div>
      );
    }

    // text file
    if (isLoading) {
      return (
        <div className="handout-viewer__loading">
          <div className="loading-spinner" />
          <span>{t('common.loading')}</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="handout-viewer__error">
          {error}
        </div>
      );
    }

    return (
      <div className={`handout-viewer__text-container ${handout.type === 'letter' ? 'handout-viewer__text-container--letter' : ''}`}>
        <pre className="handout-viewer__text">{textContent}</pre>
      </div>
    );
  };

  const sizeStyle = isMinimized ? {} : {
    width: `${size.width}px`,
    ...(size.height > 0 ? { height: `${size.height}px` } : {}),
  };

  return createPortal(
    <div
      ref={popupRef}
      className={`handout-viewer ${isMinimized ? 'handout-viewer--minimized' : ''} ${isResizing ? 'handout-viewer--resizing' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex,
        ...sizeStyle,
      }}
      onMouseDown={handleMouseDown}
    >
      <ModalHeader
        title={handout.title}
        onClose={onClose}
        isMinimized={isMinimized}
        onToggleMinimize={() => toggleHidden(windowId)}
        icon={<HandoutTypeIcon type={handout.type} className="handout-viewer__type-icon" />}
        isDragging={isDragging}
        draggable
        minimizeTitle={t('common.minimize')}
        expandTitle={t('common.expand')}
      />

      {!isMinimized && (
        <>
          {handout.description && (
            <div className="handout-viewer__description">
              {handout.description}
            </div>
          )}

          <div className="handout-viewer__content">
            {renderContent()}
          </div>

          {/* Resize handles */}
          <div className="handout-viewer__resize handout-viewer__resize--n" onMouseDown={(e) => handleResizeMouseDown(e, 'n')} />
          <div className="handout-viewer__resize handout-viewer__resize--s" onMouseDown={(e) => handleResizeMouseDown(e, 's')} />
          <div className="handout-viewer__resize handout-viewer__resize--e" onMouseDown={(e) => handleResizeMouseDown(e, 'e')} />
          <div className="handout-viewer__resize handout-viewer__resize--w" onMouseDown={(e) => handleResizeMouseDown(e, 'w')} />
          <div className="handout-viewer__resize handout-viewer__resize--ne" onMouseDown={(e) => handleResizeMouseDown(e, 'ne')} />
          <div className="handout-viewer__resize handout-viewer__resize--nw" onMouseDown={(e) => handleResizeMouseDown(e, 'nw')} />
          <div className="handout-viewer__resize handout-viewer__resize--se" onMouseDown={(e) => handleResizeMouseDown(e, 'se')} />
          <div className="handout-viewer__resize handout-viewer__resize--sw" onMouseDown={(e) => handleResizeMouseDown(e, 'sw')} />
        </>
      )}
    </div>,
    document.body
  );
};

export default HandoutViewerModal;
