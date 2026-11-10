import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../i18n';
import GameSettings from './GameSettings';
import { getSettings, updateSettings } from '../../api/settings';

// Factory mock: the real module pulls in axios (ESM), which CRA's jest transform rejects.
jest.mock('../../api/settings', () => ({
  getSettings: jest.fn(),
  updateSettings: jest.fn(),
}));

const diceSwitch = () => screen.getByRole('switch', { name: /3D|kości|rzutów/i });
const themeSwitch = () => screen.getByRole('switch', { name: /parchment|pergamin/i });

describe('GameSettings', () => {
  beforeEach(() => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
    updateSettings.mockResolvedValue({});
  });

  it('shows the saved dice choice and saves a change', async () => {
    getSettings.mockResolvedValue({ diceAnimation: false });
    render(<GameSettings />);
    await waitFor(() => expect(diceSwitch()).not.toBeDisabled());
    expect(diceSwitch()).not.toBeChecked();

    fireEvent.click(diceSwitch());
    expect(diceSwitch()).toBeChecked();
    expect(updateSettings).toHaveBeenCalledWith({ diceAnimation: true });
  });

  it('cannot be flipped before the saved choices have loaded', () => {
    getSettings.mockReturnValue(new Promise(() => {}));
    render(<GameSettings />);
    expect(diceSwitch()).toBeDisabled();
    expect(themeSwitch()).toBeDisabled();
  });

  it('follows the game theme until the player opts out', async () => {
    getSettings.mockResolvedValue({});
    render(<GameSettings />);
    await waitFor(() => expect(themeSwitch()).not.toBeDisabled());
    expect(themeSwitch()).not.toBeChecked();

    fireEvent.click(themeSwitch());
    expect(themeSwitch()).toBeChecked();
    expect(updateSettings).toHaveBeenCalledWith({ ignoreGameTheme: true });
  });
});
