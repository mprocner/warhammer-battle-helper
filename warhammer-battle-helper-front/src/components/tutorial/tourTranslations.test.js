import i18n from '../../i18n';
import { TOUR_STEPS, titleKeyFor, bodyKeyFor } from './tourSteps';
import { TAB_DEFS } from '../panels/tabDefinitions';

const LANGS = ['en', 'pl'];
const ROLES = ['gm', 'player'];
const SCHEMES = ['modern', 'classic'];

// getFixedT() spada przez fallbackLng ('en'), więc klucz brakujący w pl,
// ale obecny w en, wraca jako poprawny angielski tekst i nie zostaje wykryty.
// getResource() czyta bezpośrednio zasób danego języka, bez fallbacku.
const missing = (lng, key) => {
  const value = i18n.getResource(lng, 'translation', key);
  return value === undefined || (typeof value === 'string' && value.trim() === '');
};

describe('tutorial translations', () => {
  it.each(LANGS)('has a title and a body for every step in %s', (lng) => {
    const gaps = [];
    TOUR_STEPS.forEach(step => {
      if (missing(lng, titleKeyFor(step))) gaps.push(titleKeyFor(step));
      ROLES.forEach(role => SCHEMES.forEach(controlScheme => {
        const key = bodyKeyFor(step, { role, controlScheme });
        if (missing(lng, key)) gaps.push(key);
      }));
    });
    expect([...new Set(gaps)]).toEqual([]);
  });

  it.each(LANGS)('describes every right-panel tab in %s', (lng) => {
    const gaps = TAB_DEFS
      .map(def => `tutorial.tabs.${def.id}`)
      .filter(key => missing(lng, key));
    expect(gaps).toEqual([]);
  });

  it.each(LANGS)('has the tour chrome strings in %s', (lng) => {
    const gaps = ['button', 'next', 'back', 'skip', 'done', 'progress', 'tabsIntro']
      .map(name => `tutorial.${name}`)
      .filter(key => missing(lng, key));
    expect(gaps).toEqual([]);
  });

  it.each(LANGS)('renders the progress counter with both numbers in %s', (lng) => {
    const text = i18n.getFixedT(lng)('tutorial.progress', { current: 3, total: 10 });
    expect(text).toContain('3');
    expect(text).toContain('10');
  });
});
