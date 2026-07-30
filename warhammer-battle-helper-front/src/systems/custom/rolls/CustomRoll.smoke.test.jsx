import React from 'react';
import { render } from '@testing-library/react';
import '../../../i18n';
import CustomRoll from './CustomRoll';

describe('CustomRoll', () => {
  it('renders dice tokens and the formula line under them for a pool roll with dice', () => {
    const data = {
      outcome: 'regular_success',
      roll: 2,
      target: 4,
      poolSuccesses: 2,
      poolSuccessCondition: 'gte',
      poolFormula: [
        { kind: 'dice', sides: 6, rolls: [4] },
        { kind: 'text', text: '+' },
        { kind: 'dice', sides: 10, rolls: [7] },
        { kind: 'text', text: '+' },
        { kind: 'dice', sides: 10, rolls: [2] },
      ],
    };
    const { container } = render(<CustomRoll data={data} timestamp={null} />);

    const dice = container.querySelectorAll('.custom-pool-die');
    expect(dice).toHaveLength(3);

    const formulaLine = container.querySelector('.log-formula-breakdown');
    expect(formulaLine).not.toBeNull();
    expect(formulaLine.textContent).toBe('D6+D10+D10');

    // formula line must come after the dice row in DOM order
    const content = container.querySelector('.log-list-item__content');
    const children = Array.from(content.children);
    expect(children.indexOf(container.querySelector('.custom-pool-dice')))
      .toBeLessThan(children.indexOf(formulaLine));
  });

  it('renders the formula line for a pool roll whose formula has only text parts (no dice)', () => {
    // e.g. attribute STR + op "+" + const 2 — a formula the builder permits with no die block.
    const data = {
      outcome: 'regular_success',
      roll: 2,
      target: 0,
      poolFormula: [
        { kind: 'text', text: 'STR' },
        { kind: 'text', text: '+' },
        { kind: 'text', text: '2' },
      ],
    };
    const { container } = render(<CustomRoll data={data} timestamp={null} />);

    expect(container.querySelectorAll('.custom-pool-die')).toHaveLength(0);

    const formulaLine = container.querySelector('.log-formula-breakdown');
    expect(formulaLine).not.toBeNull();
    expect(formulaLine.textContent).toBe('STR+2');
  });
});
