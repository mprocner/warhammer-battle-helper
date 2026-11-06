import React, { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { usePortalTooltip } from '../../components/common/PortalTooltip';
import { edgeDiceButtons, formatModifier } from './modifierConfig';

// Must match .edge-dice-btn height, .edge-dice-popup gap, and .edge-dice-popup padding + border
// in style.css.
const BUTTON_HEIGHT = 36;
const BUTTON_GAP = 2;
const POPUP_INSET = 6;
const VIEWPORT_MARGIN = 8;

// zeroAlignedTop places the column so the 0 button's centre sits on the click, which makes a
// plain roll a second click in the same spot. Every edge button sits above the 0, so the offset
// grows with maxEdge instead of CoC's fixed two.
export function zeroAlignedTop(y, edgeCount) {
  return y - edgeCount * (BUTTON_HEIGHT + BUTTON_GAP) - BUTTON_HEIGHT / 2 - POPUP_INSET;
}

// Edge/setback dice picker in the style of the CoC sheet's column (CoCDiceModOverlay), sized by
// the template's maxima. Portalled to body because it is positioned in viewport coordinates.
function EdgeDiceOverlay({ pos, config, onSelect, onCancel }) {
  const { t } = useTranslation();
  const popupRef = useRef(null);
  const zeroRef = useRef(null);
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip({ placement: 'left' });
  const buttons = edgeDiceButtons(config);
  const edgeCount = buttons.filter(b => b.diceMod > 0).length;
  // No recorded click (e.g. a roll started programmatically) opens the column mid-screen.
  const at = pos || { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  useLayoutEffect(() => {
    const el = popupRef.current;
    if (!el) return;
    // offsetWidth/Height ignore the pop-in animation's transform: scale(), unlike getBoundingClientRect.
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN;
    const maxTop = window.innerHeight - height - VIEWPORT_MARGIN;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(at.x - width / 2, maxLeft));
    const top = Math.max(VIEWPORT_MARGIN, Math.min(zeroAlignedTop(at.y, edgeCount), maxTop));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    // Focus the neutral button so Enter/Space rolls plainly and Escape reaches the popup.
    if (zeroRef.current) zeroRef.current.focus();
  }, [at.x, at.y, edgeCount]);

  const describe = d => {
    if (d > 0) return t('customRoll.edgeDice', { count: d });
    if (d < 0) return t('customRoll.setbackDice', { count: -d });
    return t('combat.roll');
  };

  // Both layers stop propagation: a portal's events still bubble through the React tree, into
  // the card and whatever panel holds it.
  return createPortal(
    <div className="edge-dice-overlay" onClick={e => { e.stopPropagation(); onCancel(); }}>
      <div
        ref={popupRef}
        className="edge-dice-popup"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key !== 'Escape') return;
          e.stopPropagation();
          onCancel();
        }}
      >
        {buttons.map(({ diceMod, type }) => (
          <button
            key={diceMod}
            ref={diceMod === 0 ? zeroRef : undefined}
            type="button"
            className={`edge-dice-btn edge-dice-btn--${type}`}
            aria-label={describe(diceMod)}
            onMouseEnter={e => showTooltip(describe(diceMod), e.currentTarget)}
            onMouseLeave={hideTooltip}
            onClick={() => { hideTooltip(); onSelect(diceMod); }}
          >
            {formatModifier(diceMod)}
          </button>
        ))}
      </div>
      {tooltipNode}
    </div>,
    document.body,
  );
}

export default EdgeDiceOverlay;
