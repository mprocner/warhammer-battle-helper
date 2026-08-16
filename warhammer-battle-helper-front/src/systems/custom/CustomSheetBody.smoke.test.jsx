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
