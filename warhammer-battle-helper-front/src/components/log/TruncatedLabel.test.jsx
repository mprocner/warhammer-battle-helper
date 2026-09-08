import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import TruncatedLabel from './TruncatedLabel';

// jsdom nie liczy layoutu — scrollWidth i clientWidth zawsze zwracają 0, więc warunek
// "tekst jest przycięty" nigdy sam z siebie nie zadziała. Podstawiamy obie miary na
// konkretnym węźle, żeby przetestować sam WARUNEK, nie zdolność jsdom do renderowania CSS.
function fakeWidths(el, { scrollWidth, clientWidth }) {
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true });
}

const LONG_LABEL = 'Odporność na działanie magii chaosu';

describe('TruncatedLabel', () => {
  it('keeps the full text in the DOM, because the clipping is visual and not textual', () => {
    const { container } = render(<TruncatedLabel text={LONG_LABEL} />);
    const label = container.querySelector('.log-list-item__character-name');

    expect(label).not.toBeNull();
    expect(label.tagName).toBe('SPAN');
    expect(label.textContent).toBe(LONG_LABEL);
  });

  it('renders a <strong> when as="strong"', () => {
    const { container } = render(<TruncatedLabel as="strong" text={LONG_LABEL} />);

    expect(container.querySelector('.log-list-item__character-name').tagName).toBe('STRONG');
  });

  it('shows the full text in a tooltip when the label is clipped', () => {
    const { container } = render(<TruncatedLabel text={LONG_LABEL} />);
    const label = container.querySelector('.log-list-item__character-name');

    fakeWidths(label, { scrollWidth: 300, clientWidth: 100 });
    fireEvent.mouseEnter(label);

    const tooltip = document.body.querySelector('.portal-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip.textContent).toContain(LONG_LABEL);
  });

  it('shows no tooltip when the label fits, because there is nothing hidden to reveal', () => {
    const { container } = render(<TruncatedLabel text={LONG_LABEL} />);
    const label = container.querySelector('.log-list-item__character-name');

    fakeWidths(label, { scrollWidth: 100, clientWidth: 100 });
    fireEvent.mouseEnter(label);

    expect(document.body.querySelector('.portal-tooltip')).toBeNull();
  });

  it('renders children instead of text, but still tooltips the text', () => {
    // Nagłówki coc7e/dnd5e dopisują "(username)" obok nazwy postaci. Renderujemy więc
    // gotowy JSX, ale w tooltipie ma zostać sama nazwa — inaczej hover powtarzałby to,
    // co i tak widać w linii.
    const { container } = render(
      <TruncatedLabel text="Grimhild">
        Grimhild<span> (player1)</span>
      </TruncatedLabel>
    );
    const label = container.querySelector('.log-list-item__character-name');
    expect(label.textContent).toBe('Grimhild (player1)');

    fakeWidths(label, { scrollWidth: 300, clientWidth: 100 });
    fireEvent.mouseEnter(label);

    expect(document.body.querySelector('.portal-tooltip').textContent).toContain('Grimhild');
  });

  it('hides the tooltip after mouseLeave, once usePortalTooltip\'s debounce timer fires', () => {
    // usePortalTooltip chowa tooltip przez setTimeout 100ms (PortalTooltip.jsx), więc
    // assert potrzebuje deterministycznego zegara zamiast realnego sleepa.
    jest.useFakeTimers();
    try {
      const { container } = render(<TruncatedLabel text={LONG_LABEL} />);
      const label = container.querySelector('.log-list-item__character-name');
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
