import i18n from '../../i18n';
import { getTour, TOUR_IDS } from './tours';
import { titleKeyFor, bodyKeyFor } from './engine/stepResolution';
import { TAB_DEFS } from '../panels/tabDefinitions';

const LANGS = ['en', 'pl'];
const ROLES = ['gm', 'player'];
const SCHEMES = ['modern', 'classic'];
const TARGET_INDEXES = [0, 1];

// getFixedT() spada przez fallbackLng ('en'), więc klucz brakujący w pl,
// ale obecny w en, wraca jako poprawny angielski tekst i nie zostaje wykryty.
// getResource() czyta bezpośrednio zasób danego języka, bez fallbacku.
const missing = (lng, key) => {
  const value = i18n.getResource(lng, 'translation', key);
  return typeof value !== 'string' || value.trim() === '';
};

const keysFor = (tourId, step) => {
  const keys = [titleKeyFor(step, tourId)];
  ROLES.forEach(role => SCHEMES.forEach(controlScheme => TARGET_INDEXES.forEach(targetIndex => {
    keys.push(bodyKeyFor(step, tourId, { role, controlScheme, targetIndex }));
  })));
  return keys;
};

describe('tutorial translations', () => {
  it.each(LANGS)('has every key each registered tour can request in %s', (lng) => {
    const gaps = new Set();
    TOUR_IDS.forEach(tourId => {
      getTour(tourId).steps.forEach(step => {
        // byTarget wariantuje tylko tam, gdzie krok ma tyle kotwic ile wariantów.
        // Pozycję jego przyrostka w kluczu wyznaczamy z deklaracji kroku, nie
        // zakładamy że byTarget jest zawsze pierwszą osią (patrz stepResolution.test.js:
        // ['byRole', 'byTarget'] jest równie poprawne jak ['byTarget', 'byRole']).
        const targetCount = Array.isArray(step.target) ? step.target.length : 1;
        const variants = step.variants || [];
        const targetPos = variants.indexOf('byTarget');
        keysFor(tourId, step).forEach(key => {
          const suffix = key.split('.body.')[1];
          const suffixParts = suffix ? suffix.split('.') : [];
          const targetSuffix = targetPos === -1 ? undefined : suffixParts[targetPos];
          if (targetSuffix !== undefined && Number(targetSuffix) >= targetCount) return;
          if (missing(lng, key)) gaps.add(key);
        });
      });
    });
    expect([...gaps]).toEqual([]);
  });

  it.each(LANGS)('describes every right-panel tab in %s', (lng) => {
    const gaps = TAB_DEFS.map(def => `tutorial.tabs.${def.id}`).filter(key => missing(lng, key));
    expect(gaps).toEqual([]);
  });

  it.each(LANGS)('has the tour chrome strings in %s', (lng) => {
    const gaps = ['button', 'next', 'back', 'skip', 'done', 'progress', 'tabsIntro']
      .map(name => `tutorial.${name}`).filter(key => missing(lng, key));
    expect(gaps).toEqual([]);
  });

  it.each(LANGS)('renders the progress counter with both numbers in %s', (lng) => {
    const text = i18n.getFixedT(lng)('tutorial.progress', { current: 3, total: 10 });
    expect(text).toContain('3');
    expect(text).toContain('10');
  });
});
