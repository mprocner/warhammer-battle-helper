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

describe('GameSettings', () => {
  beforeEach(() => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
    updateSettings.mockResolvedValue({});
  });

  it('shows the saved choice and saves a change', async () => {
    getSettings.mockResolvedValue({ diceAnimation: false });
    render(<GameSettings />);
    const toggle = screen.getByRole('switch');
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(updateSettings).toHaveBeenCalledWith({ diceAnimation: true });
  });

  it('cannot be flipped before the saved choice has loaded', () => {
    getSettings.mockReturnValue(new Promise(() => {}));
    render(<GameSettings />);
    expect(screen.getByRole('switch')).toBeDisabled();
  });
});
