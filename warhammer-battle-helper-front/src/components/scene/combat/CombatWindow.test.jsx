import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '../../../i18n';
import CombatWindow from './CombatWindow';
import { CombatContext, EMPTY_COMBAT } from '../../../contexts/CombatContext';
import { WindowManagerProvider } from '../../../contexts/WindowManagerContext';
import * as api from '../../../api/combat';

jest.mock('../../../api/combat', () => {
  const ok = () => jest.fn(() => Promise.resolve());
  return {
    activateCombatEntry: ok(), updateCombatEntry: ok(), removeCombatEntry: ok(), reorderCombat: ok(),
    nextTurn: ok(), endRound: ok(), endCombat: ok(), setCombatVisibility: ok(), addCombatEntries: ok(),
  };
});

const combat = {
  round: 2, activeId: 'e1', visibleToPlayers: false,
  entries: [
    { id: 'e1', kind: 'gameCharacter', sourceId: 'c1', name: 'Hero', initiative: 15, acted: false },
    { id: 'e2', kind: 'manual', name: 'Trap', initiative: 3, acted: true, hidden: true },
  ],
};
const scene = {
  id: 's',
  characters: [{ id: 'p1', characterId: 'c1', name: 'Hero' }, { id: 'p2', characterId: 'c2', name: 'Mage' }],
  images: [{ id: 'i1', layer: 'tokens', fileName: 'wolf.png' }],
};

const mountWindow = (over = {}) => {
  const ctx = { ...EMPTY_COMBAT, gameId: 'g', sceneId: 's', scene, isGM: true, windowOpen: true, combat, run: (fn) => fn(), setWindowOpen: jest.fn(), ...over };
  const { characters = [] } = over;
  render(
    <WindowManagerProvider>
      <CombatContext.Provider value={ctx}><CombatWindow characters={characters} /></CombatContext.Provider>
    </WindowManagerProvider>,
  );
  return ctx;
};

beforeEach(() => Object.values(api).forEach(fn => typeof fn === 'function' && fn.mockClear()));

test('renders nothing for players or when closed', () => {
  mountWindow({ isGM: false });
  expect(screen.queryByText('Hero')).toBeNull();
});

test('row actions call the API', () => {
  mountWindow();
  fireEvent.click(screen.getByText('Trap'));
  expect(api.activateCombatEntry).toHaveBeenCalledWith('g', 's', 'e2');

  const value = screen.getAllByLabelText('Initiative')[0];
  fireEvent.change(value, { target: { value: '18' } });
  fireEvent.blur(value);
  expect(api.updateCombatEntry).toHaveBeenCalledWith('g', 's', 'e1', { initiative: 18 });

  fireEvent.click(screen.getAllByLabelText('Acted this round')[0]);
  expect(api.updateCombatEntry).toHaveBeenCalledWith('g', 's', 'e1', { acted: true });

  fireEvent.click(screen.getByLabelText('Show to players'));
  expect(api.updateCombatEntry).toHaveBeenCalledWith('g', 's', 'e2', { hidden: false });

  fireEvent.click(screen.getAllByLabelText('Remove from combat')[0]);
  expect(api.removeCombatEntry).toHaveBeenCalledWith('g', 's', 'e1');
});

test('footer actions', () => {
  mountWindow();
  fireEvent.click(screen.getByText('Next turn'));
  expect(api.nextTurn).toHaveBeenCalledWith('g', 's', 'e1');
  fireEvent.click(screen.getByText('End round'));
  expect(api.endRound).toHaveBeenCalledWith('g', 's');
  fireEvent.click(screen.getByText('Show', { selector: '.combat-window__footer button' }));
  expect(api.setCombatVisibility).toHaveBeenCalledWith('g', 's', true);
});

test('end combat asks first', () => {
  mountWindow();
  fireEvent.click(screen.getByText('End combat'));
  expect(api.endCombat).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByText('End combat').pop());
  expect(api.endCombat).toHaveBeenCalledWith('g', 's');
});

test('adding a scene token and a manual entry', () => {
  mountWindow();
  fireEvent.click(screen.getByText('Add'));
  fireEvent.click(screen.getByText('wolf'));
  expect(api.addCombatEntries).toHaveBeenCalledWith('g', 's', [{ kind: 'image', sourceId: 'i1' }]);
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Reinforcements' } });
  fireEvent.click(screen.getByText('Add entry'));
  expect(api.addCombatEntries).toHaveBeenCalledWith('g', 's', [{ kind: 'manual', name: 'Reinforcements', initiative: 0 }]);
});

test('a character with a token on the scene joins as a character', () => {
  mountWindow({ characters: [{ id: 'c1', name: 'Hero' }, { id: 'c2', name: 'Mage' }, { id: 'c9', isNPC: true, name: 'Ogre' }] });
  fireEvent.click(screen.getByText('Add'));
  expect(screen.getAllByText('Hero')).toHaveLength(1); // in combat already: only its row
  fireEvent.click(screen.getByText('Mage'));
  expect(api.addCombatEntries).toHaveBeenCalledWith('g', 's', [{ kind: 'gameCharacter', sourceId: 'c2' }]);
  fireEvent.click(screen.getByText('Ogre'));
  expect(api.addCombatEntries).toHaveBeenCalledWith('g', 's', [{ kind: 'gameCharacter', sourceId: 'c9' }]);
});

test('Escape cancels a rename even when the input blurs as it unmounts', () => {
  mountWindow();
  fireEvent.click(screen.getAllByLabelText('Rename')[0]);
  const input = screen.getByDisplayValue('Trap');
  fireEvent.change(input, { target: { value: 'Pit' } });
  // The browser blurs the focused input while React removes it, i.e. before the Escape update has
  // re-rendered: batching both in one act reproduces that order (blur sees the typed name).
  // eslint-disable-next-line testing-library/no-unnecessary-act -- the act IS the point: it delays the re-render
  act(() => {
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);
  });
  expect(api.updateCombatEntry).not.toHaveBeenCalled();
  expect(screen.getByText('Trap')).toBeTruthy();
});

test('leaving the input commits a rename', () => {
  mountWindow();
  fireEvent.click(screen.getAllByLabelText('Rename')[0]);
  const input = screen.getByDisplayValue('Trap');
  fireEvent.change(input, { target: { value: 'Pit' } });
  fireEvent.blur(input);
  expect(api.updateCombatEntry).toHaveBeenCalledWith('g', 's', 'e2', { name: 'Pit' });
});

test('turn buttons are disabled with no entries', () => {
  mountWindow({ combat: { ...combat, activeId: '', entries: [] } });
  expect(screen.getByRole('button', { name: 'Next turn' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'End round' })).toBeDisabled();
});
