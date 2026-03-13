import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const BUTTONS = [
  { diceMod:  2, label: '+2', type: 'bonus'   },
  { diceMod:  1, label: '+1', type: 'bonus'   },
  { diceMod:  0, label:  '0', type: 'neutral' },
  { diceMod: -1, label: '-1', type: 'penalty' },
  { diceMod: -2, label: '-2', type: 'penalty' },
];

// 0 button is index 2 — its center must align with the click Y position.
// BUTTON_HEIGHT must match the CSS height (36px).
const BUTTON_HEIGHT = 36;

function CoCDiceModModal({ pos, onSelect, onCancel }) {
  const { t } = useTranslation();
  const popupRef = useRef(null);

  useEffect(() => {
    const el = popupRef.current;
    if (!el || !pos) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Align so the 0 button center is at pos.y
    let top = pos.y - 2 * BUTTON_HEIGHT - BUTTON_HEIGHT / 2;
    // Center horizontally at cursor
    let left = pos.x - rect.width / 2;

    if (left + rect.width > vw - 8) left = vw - rect.width - 8;
    if (left < 8) left = 8;
    if (top + rect.height > vh - 8) top = vh - rect.height - 8;
    if (top < 8) top = 8;

    el.style.top  = `${top}px`;
    el.style.left = `${left}px`;
  }, [pos]);

  return (
    <div className="coc-dice-mod-overlay" onClick={onCancel}>
      <div
        ref={popupRef}
        className="coc-dice-mod-popup"
        style={{ top: pos.y, left: pos.x }} // initial placement — corrected by useEffect
        onClick={e => e.stopPropagation()}
      >
        {BUTTONS.map(({ diceMod, label, type }) => (
          <button
            key={diceMod}
            className={`coc-dice-mod-btn coc-dice-mod-btn--${type}`}
            title={
              type === 'bonus'
                ? t('coc.bonusDice', { count: diceMod })
                : type === 'penalty'
                  ? t('coc.penaltyDice', { count: Math.abs(diceMod) })
                  : undefined
            }
            onClick={() => onSelect(diceMod)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Intercepts clicks on children (capture phase) and shows a +2/+1/0/-1/-2 picker.
 * Inputs/selects/textareas are excluded — they receive clicks normally.
 *
 * Props:
 *   onDiceModRoll(diceMod) — called with chosen dice modifier
 *   children               — the wrapped element
 *   disabled               — skip interception (no game session, no value, etc.)
 */
function CoCDiceModOverlay({ onDiceModRoll, children, disabled }) {
  const [modalPos, setModalPos] = useState(null);

  const handleClickCapture = (e) => {
    if (disabled) return;
    if (modalPos !== null) return; // modal open — let button clicks through
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    e.stopPropagation();
    setModalPos({ x: e.clientX, y: e.clientY });
  };

  const handleSelect = (diceMod) => {
    setModalPos(null);
    onDiceModRoll(diceMod);
  };

  return (
    <span style={{ display: 'contents' }} onClickCapture={handleClickCapture}>
      {children}
      {modalPos && createPortal(
        <CoCDiceModModal
          pos={modalPos}
          onSelect={handleSelect}
          onCancel={() => setModalPos(null)}
        />,
        document.body
      )}
    </span>
  );
}

export default CoCDiceModOverlay;
