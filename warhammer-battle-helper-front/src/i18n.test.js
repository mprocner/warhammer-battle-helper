import i18n from './i18n';

afterAll(() => i18n.changeLanguage('en'));

describe('i18n', () => {
  it('keeps <html lang> in step with the interface language', async () => {
    await i18n.changeLanguage('pl');
    expect(document.documentElement.lang).toBe('pl');

    await i18n.changeLanguage('en');
    expect(document.documentElement.lang).toBe('en');
  });
});
