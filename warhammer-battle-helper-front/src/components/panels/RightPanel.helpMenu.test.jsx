import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '../../i18n';
import { WindowManagerProvider } from '../../contexts/WindowManagerContext';
import RightPanel from './RightPanel';

// Only the header's help menu is under test; the tab bodies are out of scope.
// Tab modules import axios at load time; the ESM build does not run under CRA's jest.
jest.mock('axios', () => {
  const client = { get: jest.fn(), post: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { ...client, create: () => client } };
});
jest.mock('../LogWindow', () => () => null);
jest.mock('../log/DiceRollControls', () => () => null);
jest.mock('../log/ChatInput', () => () => null);

const renderPanel = (props = {}) => render(
  <WindowManagerProvider>
    <RightPanel logs={[]} gameState={{ players: [] }} {...props} />
  </WindowManagerProvider>,
);

const openMenu = () => fireEvent.click(screen.getByLabelText('Help and shortcuts'));

describe('RightPanel header help menu', () => {
  test('the header holds one help button, with a portal tooltip and no native title', () => {
    renderPanel();
    const button = screen.getByLabelText('Help and shortcuts');
    expect(button).not.toHaveAttribute('title');
    fireEvent.mouseEnter(button);
    expect(screen.getByText('Help and shortcuts')).toBeInTheDocument(); // the portal tooltip
    expect(screen.queryByLabelText("What's new")).toBeNull();
  });

  test('the guide and the changelog open in a new tab, so the game stays open', () => {
    renderPanel();
    openMenu();
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Help' })).toHaveAttribute('href', '/help');
    expect(within(menu).getByRole('menuitem', { name: 'Help' })).toHaveAttribute('target', '_blank');
    expect(within(menu).getByRole('menuitem', { name: "What's new" })).toHaveAttribute('href', '/changelog');
    expect(within(menu).getByRole('menuitem', { name: "What's new" })).toHaveAttribute('target', '_blank');
  });

  test('keyboard shortcuts open the cheat sheet', () => {
    renderPanel();
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Keyboard shortcuts (?)' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Keyboard shortcuts');
  });

  test('the tutorial item replays the tutorial', () => {
    const onStartTutorial = jest.fn();
    renderPanel({ onStartTutorial });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show the tutorial' }));
    expect(onStartTutorial).toHaveBeenCalledTimes(1);
  });
});
