import React, { useRef } from 'react';
import usePopoverDismiss from './usePopoverDismiss';

// Toolbar controls must not take focus from the editor on mousedown, otherwise the caret
// blinks out and back. Commands still call chain().focus(), which restores the selection.
export const preventFocusLoss = (e) => e.preventDefault();

export const ToolbarButton = ({ icon, label, onClick, active = false, onShowTooltip, onHideTooltip }) => (
  <button
    type="button"
    className={`note-toolbar__btn ${active ? 'note-toolbar__btn--active' : ''}`}
    aria-label={label}
    aria-pressed={active}
    onMouseDown={preventFocusLoss}
    onClick={onClick}
    onMouseEnter={(e) => onShowTooltip?.(label, e.currentTarget)}
    onMouseLeave={onHideTooltip}
  >
    {icon}
  </button>
);

export const ToolbarPopoverButton = ({
  icon,
  label,
  isOpen,
  onToggle,
  onClose,
  active = false,
  indicatorColor,
  onShowTooltip,
  onHideTooltip,
  children,
}) => {
  const anchorRef = useRef(null);
  usePopoverDismiss(anchorRef, isOpen, onClose);

  return (
    <div className="note-toolbar__anchor" ref={anchorRef}>
      <button
        type="button"
        className={`note-toolbar__btn ${active || isOpen ? 'note-toolbar__btn--active' : ''}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onMouseDown={preventFocusLoss}
        onClick={onToggle}
        onMouseEnter={(e) => { if (!isOpen) onShowTooltip?.(label, e.currentTarget); }}
        onMouseLeave={onHideTooltip}
      >
        {icon}
        {indicatorColor && <span className="note-toolbar__indicator" style={{ backgroundColor: indicatorColor }} />}
      </button>
      {isOpen && children}
    </div>
  );
};
