import i18n from '../../i18n';
import { sceneDisplayName } from './sceneName';

describe('sceneDisplayName', () => {
  afterEach(() => i18n.changeLanguage('en'));

  it('keeps a name the GM gave', () => {
    expect(sceneDisplayName({ name: 'Tavern' }, i18n.t)).toBe('Tavern');
  });

  it.each([['en', 'Scene 1'], ['pl', 'Scena 1']])('names an unnamed scene in the viewer language (%s)', async (lng, expected) => {
    await i18n.changeLanguage(lng);
    expect(sceneDisplayName({ name: '' }, i18n.t)).toBe(expected);
  });
});
