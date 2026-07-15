import { getAvatarUrl } from './Avatar';

jest.mock('../api/axios', () => ({ getApiUrl: () => 'http://api.test' }));

describe('getAvatarUrl', () => {
  // The null (not '') contract is load-bearing: callers use `if (url)` to fall
  // through to the MuiAvatar fallback.
  it('returns null for empty input', () => {
    expect(getAvatarUrl('')).toBeNull();
    expect(getAvatarUrl(null)).toBeNull();
    expect(getAvatarUrl(undefined)).toBeNull();
  });

  it('resolves every backend prefix, not just /avatars/', () => {
    // The original bug: /user-files/ fell through unresolved.
    expect(getAvatarUrl('/user-files/game.jpg')).toBe('http://api.test/user-files/game.jpg');
    expect(getAvatarUrl('/avatars/a.png')).toBe('http://api.test/avatars/a.png');
  });
});
