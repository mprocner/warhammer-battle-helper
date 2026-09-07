import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

// jsdom nie liczy layoutu — scrollWidth i clientWidth zawsze zwracają 0, więc warunek
// "tekst jest przycięty" nigdy sam z siebie nie zadziała. Podstawiamy obie miary na
// konkretnym węźle, żeby przetestować sam WARUNEK, nie zdolność jsdom do renderowania CSS.
function fakeWidths(el, { scrollWidth, clientWidth }) {
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true });
}

const LONG_LABEL = 'Odporność na wpływy chaosu i korupcję';
const ATTR_LABEL = 'Zwinność bojowa w starciu z bronią dwuręczną';

// Dwa różne typy pól: 'number' (etykieta samodzielnie w kolumnie) i 'attr' (etykieta w
// .custom-sheet__attr-header, obok przycisku rzutu kostką — to ten flex-row, który
// wymusił min-width:0 / flex-shrink:0 w FEATURE-161). Jedno pole pokrywało tylko
// renderFieldLabel wywołane raz na siedem miejsc — reszta mogła wrócić do gołego
// <label> i CI by tego nie zauważyło.
const sections = [{
  id: 'sec1',
  title: 'Atrybuty',
  columns: 3,
  fields: [
    { key: 'fld_long', type: 'number', label: LONG_LABEL },
    { key: 'fld_attr', type: 'attr', label: ATTR_LABEL },
  ],
}];

describe('CustomSheetBody field labels', () => {
  it('shows the full name in a tooltip when the label is clipped', () => {
    const { container } = render(<CustomSheetBody sections={sections} />);
    const label = container.querySelector('.custom-sheet__field-label');
    expect(label).not.toBeNull();

    fakeWidths(label, { scrollWidth: 300, clientWidth: 100 });
    fireEvent.mouseEnter(label);

    const tooltip = document.body.querySelector('.portal-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip.textContent).toContain(LONG_LABEL);
  });

  it('shows no tooltip when the label fits, because there is nothing hidden to reveal', () => {
    const { container } = render(<CustomSheetBody sections={sections} />);
    const label = container.querySelector('.custom-sheet__field-label');

    fakeWidths(label, { scrollWidth: 100, clientWidth: 100 });
    fireEvent.mouseEnter(label);

    expect(document.body.querySelector('.portal-tooltip')).toBeNull();
  });

  // Catches a renderFieldLabel(field.label) call site reverted to a bare
  // <label className="custom-sheet__field-label">{field.label}</label>: a reverted site
  // still emits the class (so the two tests above keep passing) but the fixture would
  // render fewer *behaviour-wired* labels than fields — this counts every field, so
  // dropping a single call site is invisible only if the count assertion is skipped too.
  it('renders exactly one field-label element per field in the fixture', () => {
    const { container } = render(<CustomSheetBody sections={sections} />);
    const labels = container.querySelectorAll('.custom-sheet__field-label');

    expect(labels.length).toBe(sections[0].fields.length);
  });

  it('shows the full name in a tooltip when an attr field label is clipped', () => {
    const { container } = render(<CustomSheetBody sections={sections} />);
    const attrLabel = container.querySelector('.custom-sheet__attr-header .custom-sheet__field-label');
    expect(attrLabel).not.toBeNull();

    fakeWidths(attrLabel, { scrollWidth: 300, clientWidth: 100 });
    fireEvent.mouseEnter(attrLabel);

    const tooltip = document.body.querySelector('.portal-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip.textContent).toContain(ATTR_LABEL);
  });

  it('hides the tooltip after mouseLeave, once usePortalTooltip\'s debounce timer fires', () => {
    // usePortalTooltip hides via a 100ms setTimeout (see PortalTooltip.jsx), so the
    // assertion needs a deterministic clock instead of a real sleep. Scoped to this
    // test only, restored in finally so it can't leak into the other tests here.
    jest.useFakeTimers();
    try {
      const { container } = render(<CustomSheetBody sections={sections} />);
      const label = container.querySelector('.custom-sheet__field-label');
      fakeWidths(label, { scrollWidth: 300, clientWidth: 100 });

      fireEvent.mouseEnter(label);
      expect(document.body.querySelector('.portal-tooltip')).not.toBeNull();

      fireEvent.mouseLeave(label);
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(document.body.querySelector('.portal-tooltip')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

// FEATURE-157: skok pola. Snapowanie do siatki robi przeglądarka na podstawie atrybutu
// `step` — jsdom go nie wykonuje, więc testujemy jedyną rzecz, za którą odpowiada nasz kod:
// czy poprawna wartość trafia na wszystkie cztery inputy i czy fallback łapie oba źródła
// braku (undefined ze starego szablonu, 0 ze stanu kreatora przed clampem w onBlur).
describe('CustomSheetBody field step', () => {
  const stepSections = (fields) => [{ id: 'sec1', title: 'Statystyki', columns: 3, fields }];

  it('puts the configured step on both inputs of an attr field with advances', () => {
    const { container } = render(<CustomSheetBody sections={stepSections([
      { key: 'fld_attr', type: 'attr', label: 'Zdolność Walki', hasAdvances: true, step: 5 },
    ])} />);

    const inputs = container.querySelectorAll('.custom-sheet__attr-input');
    expect(inputs.length).toBe(2);
    inputs.forEach(input => expect(input.getAttribute('step')).toBe('5'));
  });

  it('puts the configured step on a simple attr field', () => {
    const { container } = render(<CustomSheetBody sections={stepSections([
      { key: 'fld_attr', type: 'attr', label: 'Siła', step: 10 },
    ])} />);

    expect(container.querySelector('.custom-sheet__attr-input').getAttribute('step')).toBe('10');
  });

  it('puts the configured step on a number field', () => {
    const { container } = render(<CustomSheetBody sections={stepSections([
      { key: 'fld_num', type: 'number', label: 'Punkty Przeznaczenia', step: 5 },
    ])} />);

    expect(container.querySelector('.custom-sheet__number-input').getAttribute('step')).toBe('5');
  });

  it('falls back to 1 when the template predates the feature and has no step', () => {
    const { container } = render(<CustomSheetBody sections={stepSections([
      { key: 'fld_num', type: 'number', label: 'Punkty Przeznaczenia' },
    ])} />);

    expect(container.querySelector('.custom-sheet__number-input').getAttribute('step')).toBe('1');
  });

  // Zero nie przychodzi z Go — omitempty wycina je i z JSON-a, i z BSON-a. Przychodzi ze stanu
  // Reacta w kreatorze: TemplateBuilder renderuje ten komponent jako live preview nad
  // edytowanymi sekcjami, więc wpisane 0 dociera tu, zanim onBlur podniesie je do 1.
  // Dlatego fallback musi być `|| 1`, nie `?? 1`.
  it('falls back to 1 for a step of 0 coming from the creator preview state', () => {
    const { container } = render(<CustomSheetBody sections={stepSections([
      { key: 'fld_num', type: 'number', label: 'Punkty Przeznaczenia', step: 0 },
    ])} />);

    expect(container.querySelector('.custom-sheet__number-input').getAttribute('step')).toBe('1');
  });

  // Fallback dla step: 0 na obu inputach atrybutu z awansami — łapie zarówno undefined
  // (szablon sprzed cechy), jak i 0 (stan kreatora przed clampem w onBlur). Testujemy
  // obydwa inputy, bo każdy ma swój `step` — mutacja jednego nie zabiłaby testu, gdyby
  // sprawdzał tylko drugi.
  it('falls back to 1 on both inputs of an attr field with advances when step is 0', () => {
    const { container } = render(<CustomSheetBody sections={stepSections([
      { key: 'fld_attr', type: 'attr', label: 'Zdolność Walki', hasAdvances: true, step: 0 },
    ])} />);

    const inputs = container.querySelectorAll('.custom-sheet__attr-input');
    expect(inputs.length).toBe(2);
    inputs.forEach(input => expect(input.getAttribute('step')).toBe('1'));
  });

  it('falls back to 1 on a simple attr field when step is 0', () => {
    const { container } = render(<CustomSheetBody sections={stepSections([
      { key: 'fld_attr', type: 'attr', label: 'Siła', step: 0 },
    ])} />);

    expect(container.querySelector('.custom-sheet__attr-input').getAttribute('step')).toBe('1');
  });

  // Decyzja projektowa ze spec-a (sekcja Zakres): `progress` jest poza zakresem tej cechy —
  // current/max zostają ze skokiem przeglądarki 1, niezależnie od tego, co GM wpisze w Skok.
  // Sprawdzamy samą obietnicę tej decyzji — pole progress w ogóle nie niesie skonfigurowanego
  // skoku na żaden ze swoich dwóch inputów — a nie tylko brak konkretnego stringa atrybutu,
  // bo `step="1"` (wartość domyślna przeglądarki) też przeszłoby test sprawdzający samą wartość.
  it('never carries a configured step on a progress field — progress is out of scope for the step feature', () => {
    const { container } = render(<CustomSheetBody sections={stepSections([
      { key: 'fld_prog', type: 'progress', label: 'Punkty Życia', step: 5 },
    ])} />);

    const inputs = container.querySelectorAll('.custom-sheet__progress-input');
    expect(inputs.length).toBe(2);
    inputs.forEach(input => expect(input.hasAttribute('step')).toBe(false));
  });
});
