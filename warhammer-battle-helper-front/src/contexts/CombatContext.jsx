import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';

export const CombatContext = createContext(null);

const noop = () => {};

// Without a provider (isolated component tests, the template creator) nothing is in combat.
export const EMPTY_COMBAT = {
  combat: null, combatSceneIds: [], gameId: null, sceneId: null, scene: null, isGM: false,
  run: noop, windowOpen: false, setWindowOpen: noop, stripCollapsed: false, setStripCollapsed: noop,
};

export function useCombat() {
  return useContext(CombatContext) || EMPTY_COMBAT;
}

export function CombatProvider({ gameId, scene, isGM, combatState, children }) {
  const [windowOpen, setWindowOpen] = useState(false);
  const [stripCollapsed, setStripCollapsed] = useState(false);
  const { combat, combatSceneIds, refresh } = combatState;
  const sceneId = scene?.id || null;

  // Ending the combat (here or by another GM tab) closes the management window.
  useEffect(() => {
    if (!combat) setWindowOpen(false);
  }, [combat]);

  // Every write goes through run. Success needs nothing: the WS event refetches. A failure — a 409
  // from a stale click included — refetches so the screen shows what actually happened.
  const run = useCallback(async (fn) => {
    try {
      await fn();
    } catch (err) {
      if (err?.response?.status !== 409) console.error('Combat action failed', err);
      refresh();
    }
  }, [refresh]);

  const value = useMemo(() => ({
    combat, combatSceneIds, gameId, sceneId, scene, isGM, run,
    windowOpen, setWindowOpen, stripCollapsed, setStripCollapsed,
  }), [combat, combatSceneIds, gameId, sceneId, scene, isGM, run, windowOpen, stripCollapsed]);

  return <CombatContext.Provider value={value}>{children}</CombatContext.Provider>;
}
