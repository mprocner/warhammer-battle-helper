import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../../i18n';
import CombatToolbarButton from './CombatToolbarButton';
import { CombatContext, EMPTY_COMBAT } from '../../../contexts/CombatContext';
import { startCombat } from '../../../api/combat';

jest.mock('../../../api/combat', () => ({ startCombat: jest.fn(() => Promise.resolve()) }));

const live = { round: 2, activeId: 'e1', visibleToPlayers: true, entries: [{ id: 'e1', kind: 'character', name: 'Hero', acted: false, canEndTurn: true }] };

const mountWith = (value) => {
  const ctx = { ...EMPTY_COMBAT, gameId: 'g', sceneId: 's', run: (fn) => fn(), setWindowOpen: jest.fn(), setStripCollapsed: jest.fn(), ...value };
  render(<CombatContext.Provider value={ctx}><CombatToolbarButton /></CombatContext.Provider>);
  return ctx;
};

test('a player with no combat gets no button', () => {
  mountWith({ isGM: false, combat: null });
  expect(screen.queryByRole('button')).toBeNull();
});

test('GM without combat starts a hidden combat and opens the window', () => {
  const ctx = mountWith({ isGM: true, combat: null });
  fireEvent.click(screen.getByRole('button'));
  expect(startCombat).toHaveBeenCalledWith('g', 's');
  expect(ctx.setWindowOpen).toHaveBeenCalledWith(true);
});

test('hidden combat shows the hidden state to the GM', () => {
  mountWith({ isGM: true, combat: { ...live, visibleToPlayers: false } });
  expect(screen.getByRole('button')).toHaveClass('combat-toolbar-button--hidden');
});

test('live combat shows the round and collapses the strip on click', () => {
  const ctx = mountWith({ isGM: true, combat: live });
  expect(screen.getByText('R2')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button'));
  expect(ctx.setStripCollapsed).toHaveBeenCalled();
});

test("a player whose character acts sees 'my turn'", () => {
  mountWith({ isGM: false, combat: live });
  expect(screen.getByRole('button')).toHaveClass('combat-toolbar-button--myTurn');
});
