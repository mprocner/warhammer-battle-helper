import { useState, useEffect, useCallback, useRef } from 'react';
import { getCombat, getCombatScenes } from '../api/combat';

// Combat state of the scene this user is looking at. Fetched on mount and scene change, then
// refetched on WS events (GameSession routes them here) — no polling.
export default function useSceneCombat(gameId, sceneId, isGM) {
  const [combat, setCombat] = useState(null);
  const [combatSceneIds, setCombatSceneIds] = useState([]);
  const sceneRef = useRef(sceneId);
  sceneRef.current = sceneId;
  const combatRef = useRef(combat);
  combatRef.current = combat;

  const refresh = useCallback(async () => {
    if (!gameId || !sceneId) {
      setCombat(null);
      return;
    }
    const requested = sceneId;
    try {
      const next = await getCombat(gameId, requested);
      // A late answer for a scene we already left must not overwrite the new scene's state.
      if (sceneRef.current === requested) setCombat(next);
    } catch {
      if (sceneRef.current === requested) setCombat(null);
    }
  }, [gameId, sceneId]);

  const refreshScenes = useCallback(async () => {
    if (!gameId || !isGM) {
      setCombatSceneIds([]);
      return;
    }
    try {
      setCombatSceneIds(await getCombatScenes(gameId));
    } catch {
      // keep the last known list
    }
  }, [gameId, isGM]);

  useEffect(() => {
    setCombat(null);
    refresh();
  }, [refresh]);

  useEffect(() => {
    refreshScenes();
  }, [refreshScenes]);

  const onCombatEvent = useCallback((eventSceneId) => {
    if (eventSceneId === sceneRef.current) refresh();
    refreshScenes();
  }, [refresh, refreshScenes]);

  // A token, image or character changed or vanished. Entries are resolved and pruned server-side,
  // so only a refetch shows it — and only matters while a combat is on screen.
  const onSourcesChanged = useCallback(() => {
    if (combatRef.current) refresh();
  }, [refresh]);

  return { combat, combatSceneIds, refresh, onCombatEvent, onSourcesChanged };
}
