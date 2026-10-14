// registry.js imports every system, and some of them import the ESM-only 'axios' package
// directly — CRA's jest cannot parse it, so both entry points are stubbed (same as
// standaloneRender.test.jsx). Nothing here makes a request.
jest.mock('../api/axios', () => ({
  __esModule: true,
  default: {},
  getApiUrl: () => 'http://test',
  getApiHeaders: (h = {}) => h,
}));
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: () => Promise.resolve({ data: {} }), post: () => Promise.resolve({ data: {} }) },
}));

/* eslint-disable import/first */
import en from '../locales/en/translation.json';
import pl from '../locales/pl/translation.json';
import { listSystems, getSystem } from './registry';
/* eslint-enable import/first */

// A system's display name lives only in i18n — a missing key would show the raw
// "gameSystems.xyz" in the lobby instead of failing anywhere.
describe.each(listSystems().map(s => [s.value]))('system %s', (key) => {
  it('has a display name in en and pl', () => {
    expect(typeof en.gameSystems[key]).toBe('string');
    expect(typeof pl.gameSystems[key]).toBe('string');
  });

  it('does not carry its own label', () => {
    expect(getSystem(key).label).toBeUndefined();
  });
});
