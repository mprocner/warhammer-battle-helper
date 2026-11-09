import React, { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../../i18n';
import CombatStrip from './CombatStrip';
import { CombatContext, EMPTY_COMBAT } from '../../../contexts/CombatContext';
import { nextTurn, endTurn } from '../../../api/combat';

jest.mock('../../../api/combat', () => ({ nextTurn: jest.fn(() => Promise.resolve()), endTurn: jest.fn(() => Promise.resolve()) }));

const combat = {
  round: 3, activeId: 'e2', visibleToPlayers: true,
  entries: [
    { id: 'e1', kind: 'character', name: 'Hero', acted: true },
    { id: 'e2', kind: 'character', name: 'Mage', acted: false, canEndTurn: true },
    { id: 'e3', kind: 'manual', name: 'Trap', acted: false },
  ],
};

const mountWith = (value) => {
  const ctx = { ...EMPTY_COMBAT, gameId: 'g', sceneId: 's', run: (fn) => fn(), setWindowOpen: jest.fn(), ...value };
  render(<CombatContext.Provider value={ctx}><CombatStrip boundsRef={createRef()} /></CombatContext.Provider>);
  return ctx;
};

beforeEach(() => { nextTurn.mockClear(); endTurn.mockClear(); });

test('nothing without combat or when collapsed', () => {
  mountWith({ combat: null });
  expect(document.querySelector('.combat-strip')).toBeNull();
  mountWith({ combat, stripCollapsed: true });
  expect(document.querySelector('.combat-strip')).toBeNull();
});

test('GM sees the round, portraits and controls; next names the active entry', () => {
  const ctx = mountWith({ combat, isGM: true });
  expect(screen.getByText('Round 3')).toBeInTheDocument();
  expect(document.querySelectorAll('.combat-strip__item')).toHaveLength(3);
  expect(document.querySelector('.combat-strip__item--active')).not.toBeNull();
  expect(document.querySelector('.combat-strip__item--acted')).not.toBeNull();
  fireEvent.click(screen.getByLabelText('Next turn'));
  expect(nextTurn).toHaveBeenCalledWith('g', 's', 'e2');
  fireEvent.click(screen.getByLabelText('Manage combat'));
  expect(ctx.setWindowOpen).toHaveBeenCalledWith(true);
  expect(screen.queryByText('End turn')).toBeNull();
});

test('a player with access ends the active turn', () => {
  mountWith({ combat, isGM: false });
  expect(screen.queryByLabelText('Next turn')).toBeNull();
  fireEvent.click(screen.getByText('End turn'));
  expect(endTurn).toHaveBeenCalledWith('g', 's', 'e2');
});

test('a player without access has no end-turn button', () => {
  mountWith({ combat: { ...combat, entries: combat.entries.map(e => ({ ...e, canEndTurn: false })) }, isGM: false });
  expect(screen.queryByText('End turn')).toBeNull();
});
