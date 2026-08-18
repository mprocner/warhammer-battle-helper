import { sessionEndReasonForStatus } from './sessionAccess';

describe('sessionEndReasonForStatus', () => {
  it('reads 403 as revoked access', () => {
    expect(sessionEndReasonForStatus(403)).toBe('accessRevoked');
  });

  it('reads 404 as a game that no longer exists', () => {
    expect(sessionEndReasonForStatus(404)).toBe('gameNotFound');
  });

  it('returns null for a successful response', () => {
    expect(sessionEndReasonForStatus(200)).toBeNull();
  });

  it('returns null for other failures so they keep the existing error path', () => {
    expect(sessionEndReasonForStatus(500)).toBeNull();
    expect(sessionEndReasonForStatus(401)).toBeNull();
  });
});
