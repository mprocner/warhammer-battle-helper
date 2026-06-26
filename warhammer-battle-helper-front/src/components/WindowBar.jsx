import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import CloseIcon from '@mui/icons-material/Close';
import { useWindowManager } from '../contexts/WindowManagerContext';
import './WindowBar.css';

const KIND_ICONS = {
  handout: ArticleOutlinedIcon,
  note: StickyNote2OutlinedIcon,
  characterSheet: PersonOutlineIcon,
};

function KindIcon({ kind }) {
  const Icon = KIND_ICONS[kind] || ArticleOutlinedIcon;
  return <Icon style={{ fontSize: 16 }} />;
}

/**
 * Górna listwa wszystkich otwartych okien (handouty / notatki / karty postaci).
 * Kolejność = kolejność otwierania; użytkownik może ją zmienić drag & drop.
 * Wyróżnienie okna na wierzchu bierzemy z osobnej kolejności z-index (stackOrder).
 */
const WindowBar = ({ collapsed = false }) => {
  const { t } = useTranslation();
  const { windows, stackOrder, focusWindow, closeWindow, reorderWindows } = useWindowManager();
  const [tooltip, setTooltip] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const tooltipTimeout = useRef(null);
  const draggedIdRef = useRef(null);

  const showTooltip = useCallback((text, el) => {
    clearTimeout(tooltipTimeout.current);
    tooltipTimeout.current = setTimeout(() => {
      const rect = el.getBoundingClientRect();
      setTooltip({ text, top: rect.bottom + 6, left: rect.left + rect.width / 2 });
    }, 400);
  }, []);

  const hideTooltip = useCallback(() => {
    clearTimeout(tooltipTimeout.current);
    setTooltip(null);
  }, []);

  const handleDragStart = (e, id) => {
    draggedIdRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== dragOverId) setDragOverId(id);
  };

  const handleDrop = (e, id) => {
    e.preventDefault();
    if (draggedIdRef.current && draggedIdRef.current !== id) {
      reorderWindows(draggedIdRef.current, id);
    }
    draggedIdRef.current = null;
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    draggedIdRef.current = null;
    setDragOverId(null);
  };

  if (windows.length === 0) return null;

  // Okno na wierzchu = ostatnie w kolejności z-index i niezminimalizowane
  const topStackId = stackOrder[stackOrder.length - 1] || null;
  const topWin = windows.find(w => w.id === topStackId);
  const topId = topWin && !topWin.hidden ? topStackId : null;

  return (
    <div className={`window-bar${collapsed ? ' window-bar--collapsed' : ''}`}>
      {windows.map((w) => (
        <div
          key={w.id}
          className={[
            'window-bar__item',
            w.hidden ? 'window-bar__item--hidden' : '',
            w.id === topId ? 'window-bar__item--active' : '',
            w.id === dragOverId ? 'window-bar__item--dragover' : '',
          ].filter(Boolean).join(' ')}
          draggable
          onDragStart={(e) => handleDragStart(e, w.id)}
          onDragOver={(e) => handleDragOver(e, w.id)}
          onDrop={(e) => handleDrop(e, w.id)}
          onDragEnd={handleDragEnd}
        >
          <button
            className="window-bar__open"
            onClick={() => focusWindow(w.id)}
            onMouseEnter={(e) => showTooltip(w.title, e.currentTarget)}
            onMouseLeave={hideTooltip}
          >
            <span className="window-bar__icon"><KindIcon kind={w.kind} /></span>
            <span className="window-bar__title">{w.title || t('windowBar.untitled')}</span>
          </button>
          <button
            className="window-bar__close"
            onClick={() => closeWindow(w.id)}
            onMouseEnter={(e) => showTooltip(t('windowBar.close'), e.currentTarget)}
            onMouseLeave={hideTooltip}
            title={t('windowBar.close')}
          >
            <CloseIcon style={{ fontSize: 14 }} />
          </button>
        </div>
      ))}

      {tooltip && createPortal(
        <div
          className="portal-tooltip"
          style={{ top: tooltip.top, left: tooltip.left, transform: 'translateX(-50%)' }}
        >
          {tooltip.text}
        </div>,
        document.body
      )}
    </div>
  );
};

export default WindowBar;
