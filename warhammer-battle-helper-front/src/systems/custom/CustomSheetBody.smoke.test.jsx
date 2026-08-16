import React from 'react';
import { render, fireEvent } from '@testing-library/react';
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

const sections = [{
  id: 'sec1',
  title: 'Atrybuty',
  columns: 3,
  fields: [{ key: 'fld_long', type: 'number', label: LONG_LABEL }],
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
});
