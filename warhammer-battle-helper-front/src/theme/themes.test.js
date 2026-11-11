import { THEMES, DEFAULT_THEME, resolveTheme } from './themes';
import en from '../locales/en/translation.json';
import pl from '../locales/pl/translation.json';

describe('theme registry', () => {
  it('starts with the default theme', () => {
    expect(THEMES[0].id).toBe(DEFAULT_THEME);
  });

  it('lists exactly the ids the backend accepts (models.GameThemes)', () => {
    expect(THEMES.map(t => t.id)).toEqual(['default', 'scifi', 'twenties', 'darkfantasy']);
  });

  it('names every theme in both languages', () => {
    THEMES.forEach(({ id }) => {
      expect(en.theme.names[id]).toEqual(expect.any(String));
      expect(pl.theme.names[id]).toEqual(expect.any(String));
    });
  });
});

describe('resolveTheme', () => {
  it('uses the game theme', () => {
    expect(resolveTheme('scifi', false)).toBe('scifi');
  });

  it('falls back to default for a game that never set one', () => {
    expect(resolveTheme('', false)).toBe('default');
    expect(resolveTheme(undefined, false)).toBe('default');
  });

  it('falls back to default for an id this client does not know', () => {
    expect(resolveTheme('cyberpunk', false)).toBe('default');
  });

  it('shows default to a player who opted out', () => {
    expect(resolveTheme('scifi', true)).toBe('default');
  });
});
