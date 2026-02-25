import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const SceneImageContextMenu = ({ x, y, image, onZIndexChange, onLayerChange, onResizeToGrid, onLockToggle, onDelete, onClose }) => {
  const { t } = useTranslation();
  const [zIndex, setZIndex] = useState(image.zIndex || 0);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const targetLayer = image.layer === 'background' ? 'gm' : 'background';

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

      {/* Layer toggle */}
      <button
        className="scene-context-menu__item"
        onClick={() => onLayerChange(targetLayer)}
      >
        {image.layer === 'background'
          ? t('scenes.moveToGmLayer')
          : t('scenes.moveToBackground')
        }
      </button>

      <div className="scene-context-menu__divider" />

      {/* Resize to Grid */}
      <button
        className="scene-context-menu__item"
        onClick={onResizeToGrid}
        disabled={image.locked}
      >
        {t('scenes.resizeToGrid')}
      </button>

      <div className="scene-context-menu__divider" />

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
