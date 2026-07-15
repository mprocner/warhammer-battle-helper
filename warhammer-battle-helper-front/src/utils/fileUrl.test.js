import { resolveFileUrl } from './fileUrl';

jest.mock('../api/axios', () => ({ getApiUrl: () => 'http://api.test' }));

describe('resolveFileUrl', () => {
  it('returns an empty string for falsy input', () => {
    expect(resolveFileUrl(null)).toBe('');
    expect(resolveFileUrl(undefined)).toBe('');
    expect(resolveFileUrl('')).toBe('');
  });

  it('prepends the API origin to every backend prefix', () => {
    expect(resolveFileUrl('/user-files/abc.png')).toBe('http://api.test/user-files/abc.png');
    expect(resolveFileUrl('/avatars/a.png')).toBe('http://api.test/avatars/a.png');
    expect(resolveFileUrl('/music-files/x.mp3')).toBe('http://api.test/music-files/x.mp3');
  });

  it('returns absolute http(s) URLs unchanged', () => {
    expect(resolveFileUrl('https://cdn.example.com/x.png')).toBe('https://cdn.example.com/x.png');
    expect(resolveFileUrl('http://other.test/y.mp3')).toBe('http://other.test/y.mp3');
  });

  it('is idempotent — MusicState.trackUrl is persisted already resolved', () => {
    const once = resolveFileUrl('/music-files/x.mp3');
    expect(resolveFileUrl(once)).toBe(once);
  });

  it('does not treat a non-http scheme as absolute', () => {
    expect(resolveFileUrl('data:text/html,<script>alert(1)</script>')).toBe(
      'http://api.testdata:text/html,<script>alert(1)</script>'
    );
    expect(resolveFileUrl('httpfoo:/x')).toBe('http://api.testhttpfoo:/x');
  });
});
