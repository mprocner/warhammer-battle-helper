import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../i18n';
import { CombatProvider, useCombat } from './CombatContext';
import { WindowManagerProvider } from './WindowManagerContext';
import CombatWindow from '../components/scene/combat/CombatWindow';

jest.mock('../api/combat', () => ({}));

function Gear() {
  const { openWindow } = useCombat();
  return <button type="button" onClick={openWindow}>gear</button>;
}

test('openWindow brings back a window minimised to the window bar', () => {
  const combatState = { combat: { round: 1, activeId: '', visibleToPlayers: false, entries: [] }, combatSceneIds: [], refresh: jest.fn() };
  render(
    <WindowManagerProvider>
      <CombatProvider gameId="g" scene={{ id: 's' }} isGM combatState={combatState}>
        <Gear />
        <CombatWindow />
      </CombatProvider>
    </WindowManagerProvider>,
  );
  fireEvent.click(screen.getByText('gear'));
  expect(screen.getByText('Combat · Round 1')).toBeTruthy();
  fireEvent.click(screen.getByTitle('Minimize'));
  expect(screen.queryByText('Combat · Round 1')).toBeNull();
  fireEvent.click(screen.getByText('gear'));
  expect(screen.getByText('Combat · Round 1')).toBeTruthy();
});
