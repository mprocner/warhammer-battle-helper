const fs = require('fs');
const path = require('path');

// Renderowanie tego komponentu wymagałoby mockowania axios + i18n + routera dla
// jednego atrybutu JSX — nieproporcjonalny koszt. Zamiast tego czytamy źródło
// i pilnujemy literalnie, że linia z <Box component="form" ...> ma action=.
// To kruchy test (złapie tylko usunięcie/zmianę tej linii), ale właśnie tego
// pilnujemy: żeby nikt nie skasował action jako "niepotrzebnego", bo bez niego
// HTMLFormElement.action wraca do URL dokumentu razem z ?token=..., a GA4
// enhanced measurement wysyła to jako form_destination przy form_start.
describe('ResetPassword — action formularza', () => {
  it('linia component="form" niesie jawny, czysty atrybut action', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'ResetPassword.jsx'),
      'utf8'
    );

    const formLine = source
      .split('\n')
      .find((line) => line.includes('component="form"'));

    expect(formLine).toBeDefined();
    expect(formLine).toMatch(/action="\/reset-password"/);
  });
});
