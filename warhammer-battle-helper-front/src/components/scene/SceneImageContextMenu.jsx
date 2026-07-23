import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const SceneImageContextMenu = ({ x, y, image, onZIndexChange, onLayerChange, onResizeToGrid, onResetRotation, onLockToggle, onDuplicate, onDelete, onClose }) => {
  const { t } = useTranslation();
  const [zIndex, setZIndex] = useState(image.zIndex || 0);
  const [dupCount, setDupCount] = useState(1);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    // Capture phase: fires on document before any element's onMouseDown, so it works even over
    // images / drawing / fog layers whose handlers call stopPropagation (which would otherwise
    // keep a bubble-phase listener from ever seeing the click). Also catch right-clicks/pans.
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('contextmenu', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('contextmenu', handleClickOutside, true);
    };
  }, [onClose]);

  const layers = [
    { key: 'background', label: t('scenes.layerBackground') },
    { key: 'tokens', label: t('scenes.layerTokens') },
    { key: 'gm', label: t('scenes.layerGm') },
  ];

  return createPortal(
    <div
      ref={menuRef}
      className="scene-context-menu"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 10000,
      }}
    >
      {/* Z-Index control */}
      <div className="scene-context-menu__item scene-context-menu__item--zindex">
        <label>{t('scenes.zIndex')}</label>
        <div className="scene-context-menu__zindex-row">
          <input
            type="number"
            value={zIndex}
            onChange={(e) => setZIndex(parseInt(e.target.value) || 0)}
            className="scene-context-menu__input"
          />
          <button
            className="scene-context-menu__ok-btn"
            onClick={() => onZIndexChange(zIndex)}
          >
            OK
          </button>
        </div>
      </div>

      <div className="scene-context-menu__divider" />

      {/* Layer selection */}
      <div className="scene-context-menu__label">{t('scenes.layer')}</div>
      {layers.map(l => (
        <button
          key={l.key}
          className={`scene-context-menu__item${image.layer === l.key ? ' scene-context-menu__item--active' : ''}`}
          onClick={() => onLayerChange(l.key)}
        >
          {image.layer === l.key ? '✓ ' : '   '}{l.label}
        </button>
      ))}

      <div className="scene-context-menu__divider" />

      {/* Duplicate N× — the whole row triggers it except the number input. */}
      <div
        className="scene-context-menu__item scene-context-menu__item--duplicate"
        onClick={() => onDuplicate(Math.max(1, parseInt(dupCount, 10) || 1))}
      >
        <span>{t('scenes.duplicate')}</span>
        <input
          type="number"
          min="1"
          value={dupCount}
          onChange={(e) => setDupCount(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              onDuplicate(Math.max(1, parseInt(dupCount, 10) || 1));
            }
          }}
          className="scene-context-menu__dup-input"
        />
        <span>{t('scenes.times')}</span>
      </div>

      <div className="scene-context-menu__divider" />

      {/* Resize to Grid + Reset rotation — hidden when image is locked */}
      {!image.locked && (
        <>
          <button
            className="scene-context-menu__item"
            onClick={onResizeToGrid}
          >
            {t('scenes.resizeToGrid')}
          </button>
          <button
            className="scene-context-menu__item"
            onClick={onResetRotation}
          >
            {t('scenes.resetRotation')}
          </button>
          <div className="scene-context-menu__divider" />
        </>
      )}

      {/* Lock / Unlock */}
      <button
        className="scene-context-menu__item"
        onClick={onLockToggle}
      >
        {image.locked ? `🔒 ${t('scenes.unlockImage')}` : `🔓 ${t('scenes.lockImage')}`}
      </button>

      <div className="scene-context-menu__divider" />

      {/* Delete */}
      <button
        className="scene-context-menu__item scene-context-menu__item--danger"
        onClick={onDelete}
      >
        {t('scenes.deleteImage')}
      </button>
    </div>,
    document.body
  );
};

export default SceneImageContextMenu;
