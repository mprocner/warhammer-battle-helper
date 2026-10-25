import i18n from '../i18n';
import { TEMPLATE_LANGUAGES, isTemplateLanguage } from './templateLanguages';

test('every language has a name in en and pl', () => {
  ['en', 'pl'].forEach(lng => {
    [...TEMPLATE_LANGUAGES, 'unspecified'].forEach(code => {
      expect(typeof i18n.getResource(lng, 'translation', `languages.${code}`)).toBe('string');
    });
  });
});

test('isTemplateLanguage accepts listed codes only', () => {
  expect(isTemplateLanguage('pl')).toBe(true);
  expect(isTemplateLanguage('xx')).toBe(false);
  expect(isTemplateLanguage('')).toBe(false);
});
