/* eslint-disable testing-library/no-node-access, testing-library/no-container */
import React from 'react';
import { render } from '@testing-library/react';
import '../i18n';
import LogWindow from './LogWindow';
import { FALLBACK_PARTICIPANT_COLOR } from '../utils/participants';

// The real registry pulls every system's sheet and, through it, axios (ESM, unparseable in jest).
jest.mock('../systems/registry', () => ({ getSystem: () => ({ supportedRollTypes: [] }) }));

const chat = (id, userId) => ({ id, message: `msg ${id}`, type: 'info', data: userId ? { userId, username: 'x' } : undefined });

describe('LogWindow author colour', () => {
  it('bars an authored message in its author colour, falls back for an author who left, leaves system messages alone', () => {
    const { container } = render(
      <LogWindow
        logs={[chat('1', 'anna'), chat('2', 'gone'), chat('3', null)]}
        participants={[{ userId: 'anna', color: '#e6194b' }]}
        autoScroll={false}
      />
    );
    const items = container.querySelectorAll('.log-simple-message');
    expect(items[0]).toHaveClass('log-simple-message--authored');
    expect(items[0].style.getPropertyValue('--author-color')).toBe('#e6194b');
    expect(items[1].style.getPropertyValue('--author-color')).toBe(FALLBACK_PARTICIPANT_COLOR);
    expect(items[2]).not.toHaveClass('log-simple-message--authored');
  });
});
