import { renderHook, waitFor, act } from '@testing-library/react';
import useSceneCombat from './useSceneCombat';
import { getCombat, getCombatScenes } from '../api/combat';

jest.mock('../api/combat', () => ({ getCombat: jest.fn(), getCombatScenes: jest.fn() }));

beforeEach(() => {
  getCombat.mockReset().mockResolvedValue({ round: 1, entries: [] });
  getCombatScenes.mockReset().mockResolvedValue(['s1']);
});

test('fetches on mount and on scene change', async () => {
  const { result, rerender } = renderHook(({ sceneId }) => useSceneCombat('g1', sceneId, true), { initialProps: { sceneId: 's1' } });
  await waitFor(() => expect(result.current.combat).toEqual({ round: 1, entries: [] }));
  expect(result.current.combatSceneIds).toEqual(['s1']);
  rerender({ sceneId: 's2' });
  await waitFor(() => expect(getCombat).toHaveBeenLastCalledWith('g1', 's2'));
});

test('refetches only for an event about its own scene', async () => {
  const { result } = renderHook(() => useSceneCombat('g1', 's1', false));
  await waitFor(() => expect(getCombat).toHaveBeenCalledTimes(1));
  await act(async () => { result.current.onCombatEvent('other'); });
  expect(getCombat).toHaveBeenCalledTimes(1);
  await act(async () => { result.current.onCombatEvent('s1'); });
  expect(getCombat).toHaveBeenCalledTimes(2);
  expect(getCombatScenes).not.toHaveBeenCalled(); // players never ask for the scene list
});

test('a source change refetches only while a combat is shown', async () => {
  getCombat.mockResolvedValue(null);
  const { result } = renderHook(() => useSceneCombat('g1', 's1', true));
  await waitFor(() => expect(getCombat).toHaveBeenCalledTimes(1));
  await act(async () => { result.current.onSourcesChanged(); });
  expect(getCombat).toHaveBeenCalledTimes(1);
});
