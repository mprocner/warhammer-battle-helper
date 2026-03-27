import { useState, useEffect, useCallback } from 'react';
import { getSettings, updateSettings } from '../api/settings';

export function useControlScheme() {
  const [scheme, setSchemeState] = useState('modern');

  useEffect(() => {
    getSettings().then(s => {
      if (s.sceneControlScheme) setSchemeState(s.sceneControlScheme);
    }).catch(() => {});
  }, []);

  const setScheme = useCallback((val) => {
    setSchemeState(val);
    updateSettings({ sceneControlScheme: val }).catch(() => {});
  }, []);

  return [scheme, setScheme];
}
