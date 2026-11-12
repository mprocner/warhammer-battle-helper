import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { usePortalTooltip } from '../common/PortalTooltip';

// How long the picker must sit still before the colour is saved.
export const GRID_COLOR_SAVE_DELAY_MS = 400;

// The picker needs a concrete colour even when the scene has none; start it from the theme's
// default grid colour so the first pick is a nudge from what the GM already sees.
function themeGridColor() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--c-border-light').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#000000';
}

// Scene grid colour: a native colour picker plus a "back to default" button.
// React's onChange on a colour input fires on every `input` event while the picker is open, and
// every save refetches the game for each player (SCENE_UPDATED). So each move only previews
// (onPreview patches the GM's local game state — the map follows the picker live), and the save
// waits until the picker has been still for GRID_COLOR_SAVE_DELAY_MS. Closing the picker (native
// `change`) or unmounting the field saves the pending colour at once, so it is never lost.
export default function GridColorField({ value, disabled = false, onPreview, onCommit }) {
  const { t } = useTranslation();
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();
  const id = useId();
  const inputRef = useRef(null);
  const [draft, setDraft] = useState(() => value || themeGridColor());

  useEffect(() => { setDraft(value || themeGridColor()); }, [value]);

  // Read through refs so the listeners and the unmount flush never call a stale callback.
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const pendingRef = useRef(null); // { color, timer } | null

  const flush = () => {
    const pending = pendingRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingRef.current = null;
    commitRef.current(pending.color);
  };

  const schedule = (color) => {
    if (pendingRef.current) clearTimeout(pendingRef.current.timer);
    pendingRef.current = { color, timer: setTimeout(flush, GRID_COLOR_SAVE_DELAY_MS) };
  };

  useEffect(() => {
    const el = inputRef.current;
    const onClose = (e) => {
      if (pendingRef.current) clearTimeout(pendingRef.current.timer);
      pendingRef.current = null;
      commitRef.current(e.target.value);
    };
    el.addEventListener('change', onClose);
    return () => {
      el.removeEventListener('change', onClose);
      flush();
    };
    // flush only reads refs, so attaching once is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInput = (e) => {
    const color = e.target.value;
    setDraft(color);
    onPreview(color);
    schedule(color);
  };

  const reset = () => {
    if (pendingRef.current) clearTimeout(pendingRef.current.timer);
    pendingRef.current = null;
    onPreview('');
    onCommit('');
  };

  return (
    <div className="scenes-tab__field scenes-tab__field--grid-color">
      <label htmlFor={id}>{t('scenes.gridColor')}</label>
      <div className="scenes-tab__grid-color-row">
        <input ref={inputRef} id={id} type="color" value={draft} disabled={disabled}
          onChange={handleInput} />
        {value && (
          <button type="button" className="scenes-tab__grid-color-reset" disabled={disabled}
            aria-label={t('scenes.gridColorReset')}
            onClick={reset}
            onMouseEnter={(e) => showTooltip(t('scenes.gridColorReset'), e.currentTarget)}
            onMouseLeave={hideTooltip}>
            <RestartAltIcon fontSize="small" />
          </button>
        )}
      </div>
      {tooltipNode}
    </div>
  );
}
