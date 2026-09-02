import { useState, useEffect, useRef, useCallback } from 'react';
import { getSettings, updateSettings } from '../api/settings';

// Matches the constant FogLayer used to hardcode — a user with no saved preference sees
// the fog exactly as before this change.
const DEFAULT_FOG_GM_OPACITY = 0.5;

// A drag on the <input type="range"> fires onChange on every `input` event — up to ~19
// requests for a single drag at step="0.05". Debounce the persisted write so only the
// value the GM settles on is sent.
const SAVE_DELAY = 300;

export function useFogGmOpacity() {
  const [opacity, setOpacityState] = useState(DEFAULT_FOG_GM_OPACITY);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    getSettings().then(s => {
      if (s.fogGmOpacity) setOpacityState(s.fogGmOpacity);
    }).catch(() => {});
  }, []);

  // Clear the pending save on unmount so it doesn't fire after the component is gone.
  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  const setOpacity = useCallback((val) => {
    setOpacityState(val);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateSettings({ fogGmOpacity: val }).catch(() => {});
    }, SAVE_DELAY);
  }, []);

  return [opacity, setOpacity];
}
