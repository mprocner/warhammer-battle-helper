import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

// Group context menu. Action set = intersection valid for the whole selection:
//  images-only → full set (lock/unlock, move-to-layer, reset rotation, remove); any selection with
//  characters (chars-only or mixed) → reset rotation + remove only. Lock/unlock and move-to-layer
//  stay image-only concepts; reset rotation applies to both token kinds since FEATURE-152.
const SceneTokenMultiContextMenu = ({ x, y, selection, onDelete, onSetLock, onSetLayer, onResetRotation, onClose }) => {
  const { t } = useTranslation();
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    // mousedown only — see the note in SceneImageContextMenu: a `contextmenu` listener here closed
    // the menu on Windows, where the trusted event trails pointerup (FEATURE-142).
    document.addEventListener('mousedown', h, true);
    return () => {
      document.removeEventListener('mousedown', h, true);
    };
  }, [onClose]);

  const hasImages = selection.some(s => s.kind === 'image');
  const hasChars = selection.some(s => s.kind === 'char');
  const imagesOnly = hasImages && !hasChars;
  const layers = [
    { key: 'background', label: t('scenes.layerBackground') },
    { key: 'tokens', label: t('scenes.layerTokens') },
    { key: 'gm', label: t('scenes.layerGm') },
  ];

  // Act on the LEFT mouseDOWN, not click: the menu lives in a portal above the scene, whose tree
  // re-renders on scene/WS activity. A re-render between a click's mousedown and mouseup re-creates
  // the button node, so the two land on different nodes and the click never fires (the menu looked
  // frozen — presses registered, nothing happened). mousedown fires at press time, before any such
  // re-render, so the action is reliable.
  const act = (fn) => (e) => { if (e.button === 0) { e.preventDefault(); fn(); onClose(); } };

  return createPortal(
    <div ref={ref} className="scene-context-menu" style={{ position: 'fixed', left: x, top: y, zIndex: 10000 }}>
      {imagesOnly && (
        <>
          <button className="scene-context-menu__item" onMouseDown={act(() => onSetLock(true))}>🔒 {t('scenes.lockAll')}</button>
          <button className="scene-context-menu__item" onMouseDown={act(() => onSetLock(false))}>🔓 {t('scenes.unlockAll')}</button>
          <div className="scene-context-menu__divider" />
          <div className="scene-context-menu__label">{t('scenes.moveToLayer')}</div>
          {layers.map(l => (
            <button key={l.key} className="scene-context-menu__item" onMouseDown={act(() => onSetLayer(l.key))}>{l.label}</button>
          ))}
          <div className="scene-context-menu__divider" />
        </>
      )}
      <button className="scene-context-menu__item" onMouseDown={act(() => onResetRotation())}>{t('scenes.resetRotationAll')}</button>
      <div className="scene-context-menu__divider" />
      <button className="scene-context-menu__item scene-context-menu__item--danger" onMouseDown={act(() => onDelete())}>
        {imagesOnly ? t('scenes.deleteAll') : t('scenes.removeFromScene')}
      </button>
    </div>,
    document.body
  );
};

export default SceneTokenMultiContextMenu;
