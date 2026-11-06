import { storePendingInvite, hasPendingInvite, takePendingInvite, PENDING_INVITE_KEY } from './pendingInvite';

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

describe('pendingInvite', () => {
  it('stores a token and hands it out exactly once', () => {
    storePendingInvite('tok');
    expect(hasPendingInvite()).toBe(true);
    expect(takePendingInvite()).toBe('tok');
    expect(takePendingInvite()).toBeNull();
    expect(hasPendingInvite()).toBe(false);
    expect(localStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
  });

  it('returns null when nothing is stored', () => {
    expect(takePendingInvite()).toBeNull();
  });

  it('does not throw when storage is unavailable', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => storePendingInvite('tok')).not.toThrow();
    expect(hasPendingInvite()).toBe(false);
    expect(takePendingInvite()).toBeNull();
  });
});
