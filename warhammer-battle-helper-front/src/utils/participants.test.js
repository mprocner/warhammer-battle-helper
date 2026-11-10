import { participantColor, FALLBACK_PARTICIPANT_COLOR } from './participants';

describe('participantColor', () => {
  const participants = [{ userId: 'a', color: '#e6194b' }, { userId: 'b' }];

  it('returns the stored colour', () => {
    expect(participantColor(participants, 'a')).toBe('#e6194b');
  });

  it('falls back for a participant without colour, an author who left, or no list', () => {
    expect(participantColor(participants, 'b')).toBe(FALLBACK_PARTICIPANT_COLOR);
    expect(participantColor(participants, 'gone')).toBe(FALLBACK_PARTICIPANT_COLOR);
    expect(participantColor(undefined, 'a')).toBe(FALLBACK_PARTICIPANT_COLOR);
  });
});
