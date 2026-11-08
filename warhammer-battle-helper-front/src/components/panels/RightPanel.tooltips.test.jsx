import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import { WindowManagerProvider } from '../../contexts/WindowManagerContext';
import RightPanel from './RightPanel';

// The header icons only need their tooltips; the tab bodies are out of scope here.
// Tab modules import axios at load time; the ESM build does not run under CRA's jest.
jest.mock('axios', () => {
  const client = { get: jest.fn(), post: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { ...client, create: () => client } };
});
jest.mock('../LogWindow', () => () => null);
jest.mock('../log/DiceRollControls', () => () => null);
jest.mock('../log/ChatInput', () => () => null);

describe('RightPanel header tooltips', () => {
  it.each([
    ['Help'],
    ["What's new"],
    ['Show the tutorial'],
  ])('shows "%s" on hover without a native title', (label) => {
    render(
      <WindowManagerProvider>
        <RightPanel logs={[]} gameState={{ players: [] }} />
      </WindowManagerProvider>,
    );
    const icon = screen.getByLabelText(label);
    expect(icon).not.toHaveAttribute('title');

    fireEvent.mouseEnter(icon);

    expect(document.body.querySelector('.portal-tooltip')).toHaveTextContent(label);
  });
});
