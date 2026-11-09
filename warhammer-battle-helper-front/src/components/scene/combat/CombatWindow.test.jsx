import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
    { id: 'e1', kind: 'character', sourceId: 'p1', name: 'Hero', initiative: 15, acted: false },
    { id: 'e2', kind: 'manual', name: 'Trap', initiative: 3, acted: true, hidden: true },
  ],
};
const scene = { id: 's', characters: [{ id: 'p1', name: 'Hero' }, { id: 'p2', name: 'Mage' }], images: [] };

const mountWindow = (over = {}) => {
  const ctx = { ...EMPTY_COMBAT, gameId: 'g', sceneId: 's', scene, isGM: true, windowOpen: true, combat, run: (fn) => fn(), setWindowOpen: jest.fn(), ...over };
  render(
    <WindowManagerProvider>
      <CombatContext.Provider value={ctx}><CombatWindow /></CombatContext.Provider>
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
  // "Show to players" exists twice: the hidden row's aria-label and the footer button's text.
  fireEvent.click(screen.getByText('Show to players', { selector: '.combat-window__footer button' }));
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
  fireEvent.click(screen.getByText('Mage'));
  expect(api.addCombatEntries).toHaveBeenCalledWith('g', 's', [{ kind: 'character', sourceId: 'p2' }]);
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Reinforcements' } });
  fireEvent.click(screen.getByText('Add entry'));
  expect(api.addCombatEntries).toHaveBeenCalledWith('g', 's', [{ kind: 'manual', name: 'Reinforcements', initiative: 0 }]);
});
