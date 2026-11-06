import i18n from '../../i18n';

// i18next v21+ resolves plurals by Intl.PluralRules suffixes (_one/_few/_many/_other); a legacy
// "_plural" key is never read, so every count fell back to the singular form.
describe('CoC bonus/penalty dice labels', () => {
  it.each([
    ['en', 'coc.bonusDice', 1, '+1 bonus die'],
    ['en', 'coc.bonusDice', 2, '+2 bonus dice'],
    ['en', 'coc.penaltyDice', 2, '-2 penalty dice'],
    ['pl', 'coc.bonusDice', 1, '+1 kość bonusowa'],
    ['pl', 'coc.bonusDice', 2, '+2 kości bonusowe'],
    ['pl', 'coc.penaltyDice', 1, '-1 kość karna'],
    ['pl', 'coc.penaltyDice', 2, '-2 kości karne'],
  ])('%s %s with count %i', (lng, key, count, expected) => {
    expect(i18n.t(key, { count, lng })).toBe(expected);
  });
});
