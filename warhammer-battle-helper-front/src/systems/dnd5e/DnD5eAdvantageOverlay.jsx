import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const BUTTONS = [
  { diceMod:  1, labelKey: 'dnd.rollAdvantage',    type: 'adv'     },
  { diceMod:  0, labelKey: 'dnd.rollNormal',        type: 'normal'  },
  { diceMod: -1, labelKey: 'dnd.rollDisadvantage',  type: 'disadv'  },
];

const BUTTON_HEIGHT = 36;

function DnD5eAdvantageModal({ pos, onSelect, onCancel }) {
  const { t } = useTranslation();
  const popupRef = useRef(null);

  useEffect(() => {
    const el = popupRef.current;
    if (!el || !pos) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Align so the Normal button center is at pos.y
    let top = pos.y - BUTTON_HEIGHT - BUTTON_HEIGHT / 2;
    let left = pos.x - rect.width / 2;

    if (left + rect.width > vw - 8) left = vw - rect.width - 8;
    if (left < 8) left = 8;
    if (top + rect.height > vh - 8) top = vh - rect.height - 8;
    if (top < 8) top = 8;

    el.style.top  = `${top}px`;
    el.style.left = `${left}px`;
  }, [pos]);

  return (
    <div className="dnd-advantage-overlay" onClick={onCancel}>
      <div
        ref={popupRef}
        className="dnd-advantage-popup"
        style={{ top: pos.y, left: pos.x }}
        onClick={e => e.stopPropagation()}
      >
        {BUTTONS.map(({ diceMod, labelKey, type }) => (
          <button
            key={diceMod}
            className={`dnd-advantage-btn dnd-advantage-btn--${type}`}
            onClick={() => onSelect(diceMod)}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Intercepts clicks on children and shows Advantage / Normal / Disadvantage picker.
 * Props:
 *   onAdvRoll(diceMod) — called with 1, 0, or -1
 *   children           — wrapped element
 *   disabled           — skip interception
 */
function DnD5eAdvantageOverlay({ onAdvRoll, children, disabled }) {
  const [modalPos, setModalPos] = useState(null);

  const handleClickCapture = (e) => {
    if (disabled) return;
    if (modalPos !== null) return;
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    e.stopPropagation();
    setModalPos({ x: e.clientX, y: e.clientY });
  };

  const handleSelect = (diceMod) => {
    setModalPos(null);
    onAdvRoll(diceMod);
  };

  return (
    <span style={{ display: 'contents' }} onClickCapture={handleClickCapture}>
      {children}
      {modalPos && createPortal(
        <DnD5eAdvantageModal
          pos={modalPos}
          onSelect={handleSelect}
          onCancel={() => setModalPos(null)}
        />,
        document.body
      )}
    </span>
  );
}

export default DnD5eAdvantageOverlay;
