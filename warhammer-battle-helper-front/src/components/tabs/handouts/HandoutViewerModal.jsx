import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiUrl } from '../../../api/axios';
import HandoutTypeIcon from './HandoutTypeIcon';
import './HandoutViewerModal.css';

/**
 * Modal for viewing handout content (draggable, minimizable, no overlay)
 */
const MIN_WIDTH = 300;
const MIN_HEIGHT = 200;

const HandoutViewerModal = ({ isOpen, onClose, handout }) => {
  const { t } = useTranslation();
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
  const popupRef = useRef(null);

  const fetchTextContent = useCallback(async () => {
    if (!handout?.fileUrl) return;

    setIsLoading(true);
    setError('');

    try {
      // Build the full URL for the file
      const url = handout.fileUrl.startsWith('http')
        ? handout.fileUrl
        : `${getApiUrl()}${handout.fileUrl}`;

      const response = await fetch(url);
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
    if (isOpen && handout && (handout.type === 'text' || handout.type === 'letter')) {
      fetchTextContent();
    }
  }, [isOpen, handout, fetchTextContent]);

  // Reset position and size when opening
  useEffect(() => {
    if (isOpen) {
      setPosition({ x: 100, y: 100 });
      setSize({ width: 900, height: 0 });
      setIsMinimized(false);
    }
  }, [isOpen]);

  // Clamp position so the header bar always stays on screen
  const clampPosition = useCallback((x, y) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const el = popupRef.current;
    const elWidth = el ? el.offsetWidth : 300;
    const headerHeight = 46; // approximate header height

    // At least 80px of the window must remain visible horizontally
    const minVisibleX = 80;
    const clampedX = Math.max(-elWidth + minVisibleX, Math.min(x, vw - minVisibleX));
    // Top: cannot go above 0; Bottom: header must stay visible
    const clampedY = Math.max(0, Math.min(y, vh - headerHeight));

    return { x: clampedX, y: clampedY };
  }, []);

  // Drag handlers
  const handleMouseDown = (e) => {
    if (e.target.closest('.handout-viewer__header') && !e.target.closest('.handout-viewer__header-buttons')) {
      setIsDragging(true);
      const rect = popupRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
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
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setResizeDir(null);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, isResizing, resizeDir, resizeStart, clampPosition]);

  if (!isOpen || !handout) return null;

  const getFileUrl = () => {
    if (!handout.fileUrl) return '';
    return handout.fileUrl.startsWith('http')
      ? handout.fileUrl
      : `${getApiUrl()}${handout.fileUrl}`;
  };

  const renderContent = () => {
    const fileUrl = getFileUrl();

    switch (handout.type) {
      case 'image':
      case 'map':
        return (
          <div className="handout-viewer__image-container">
            <img
              src={fileUrl}
              alt={handout.title}
              className="handout-viewer__image"
            />
          </div>
        );

      case 'pdf':
        return (
          <div className="handout-viewer__pdf-container">
            <iframe
              src={fileUrl}
              title={handout.title}
              className="handout-viewer__pdf"
            />
          </div>
        );

      case 'text':
      case 'letter':
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

      default:
        return (
          <div className="handout-viewer__unknown">
            <HandoutTypeIcon type={handout.type} />
            <p>{t('handouts.unsupportedType')}</p>
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="handout-viewer__download-btn"
            >
              {t('handouts.download')}
            </a>
          </div>
        );
    }
  };

  const sizeStyle = isMinimized ? {} : {
    width: `${size.width}px`,
    ...(size.height > 0 ? { height: `${size.height}px` } : {}),
  };

  return (
    <div
      ref={popupRef}
      className={`handout-viewer ${isMinimized ? 'handout-viewer--minimized' : ''} ${isResizing ? 'handout-viewer--resizing' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        ...sizeStyle,
      }}
      onMouseDown={handleMouseDown}
    >
      <div
        className="handout-viewer__header"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div className="handout-viewer__title-section">
          <HandoutTypeIcon type={handout.type} className="handout-viewer__type-icon" />
          <h2 className="handout-viewer__title">{handout.title}</h2>
        </div>
        <div className="handout-viewer__header-buttons">
          <button
            className="handout-viewer__minimize-btn"
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(!isMinimized);
            }}
            title={isMinimized ? t('common.expand') : t('common.minimize')}
          >
            {isMinimized ? '▢' : '─'}
          </button>
          <button
            className="handout-viewer__close"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            ×
          </button>
        </div>
      </div>

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
    </div>
  );
};

export default HandoutViewerModal;
