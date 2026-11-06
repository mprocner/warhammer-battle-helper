import en from '../locales/en/changelog.json';
import pl from '../locales/pl/changelog.json';
import { RELEASES, LATEST_VERSION, releaseKey } from './releases';

const SEMVER = /^\d+\.\d+\.\d+$/;
const parts = (version) => version.split('.').map(Number);
const isNewer = (a, b) => {
  const [pa, pb] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i];
  }
  return false;
};

describe('RELEASES', () => {
  it('lists unique semver versions, newest first', () => {
    RELEASES.forEach(({ version }) => expect(version).toMatch(SEMVER));
    for (let i = 1; i < RELEASES.length; i += 1) {
      expect(isNewer(RELEASES[i - 1].version, RELEASES[i].version)).toBe(true);
    }
    expect(LATEST_VERSION).toBe(RELEASES[0].version);
  });

  it('dates every release with a valid ISO day', () => {
    RELEASES.forEach(({ date }) => {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(date).getTime())).toBe(false);
    });
  });

  it('has an en and pl text for every section and item', () => {
    RELEASES.forEach(({ version, sections }) => {
      sections.forEach(({ id, items }) => {
        [en, pl].forEach(locale => {
          expect(locale.sections[id]).toEqual(expect.any(String));
          items.forEach(item => {
            expect(locale.releases[releaseKey(version)]?.[id]?.[item]).toEqual(expect.any(String));
          });
        });
      });
    });
  });

  it('keeps en and pl release texts in step', () => {
    expect(Object.keys(pl.releases).sort()).toEqual(Object.keys(en.releases).sort());
    expect(Object.keys(pl.sections).sort()).toEqual(Object.keys(en.sections).sort());
  });

  it('turns dots into underscores for i18n keys', () => {
    expect(releaseKey('1.10.2')).toBe('1_10_2');
  });
});
