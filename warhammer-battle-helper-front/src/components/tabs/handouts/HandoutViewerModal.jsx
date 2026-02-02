import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiUrl } from '../../../api/axios';
import HandoutTypeIcon from './HandoutTypeIcon';
import './HandoutViewerModal.css';

/**
 * Modal for viewing handout content (draggable, minimizable, no overlay)
 */
const HandoutViewerModal = ({ isOpen, onClose, handout }) => {
  const { t } = useTranslation();
  const [textContent, setTextContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
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

  // Reset position when opening
  useEffect(() => {
    if (isOpen) {
      setPosition({ x: 100, y: 100 });
      setIsMinimized(false);
    }
  }, [isOpen]);

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

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

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

  return (
    <div
      ref={popupRef}
      className={`handout-viewer ${isMinimized ? 'handout-viewer--minimized' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
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
        </>
      )}
    </div>
  );
};

export default HandoutViewerModal;
