import { useState, useEffect, useCallback } from 'react';
import { getSettings, updateSettings } from '../api/settings';

/**
 * One boolean account preference from UserSettings (PATCH /settings writes only this key).
 * The value is `undefined` until the user has chosen; callers pick their own default.
 *
 * `loaded` stays false until the saved value has arrived (or the request failed), so a
 * caller can hold back work that a saved "off" would forbid.
 * @param {string} key UserSettings JSON key, e.g. 'diceAnimation'
 * @returns {[boolean|undefined, (value: boolean) => void, boolean]} [saved, setSaved, loaded]
 */
export function useAccountBooleanSetting(key) {
  const [saved, setSaved] = useState(undefined);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    getSettings()
      .then(s => { if (alive && typeof s?.[key] === 'boolean') setSaved(s[key]); })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [key]);

  const save = useCallback((value) => {
    setSaved(value);
    updateSettings({ [key]: value }).catch(() => {});
  }, [key]);

  return [saved, save, loaded];
}
