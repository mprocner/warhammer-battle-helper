import React from 'react';
import { render } from '@testing-library/react';
import '../../../i18n';
import CustomWeaponRoll from './CustomWeaponRoll';

describe('CustomWeaponRoll', () => {
  it('renders the formula line for a pool-mode weapon roll (no formulaBreakdown)', () => {
    // Pool-mode weapon attacks carry their formula as poolFormula only — the backend
    // leaves formulaBreakdown empty in that mode. A component that reads
    // data.formulaBreakdown directly would render nothing here.
    const data = {
      outcome: 'regular_success',
      roll: 2,
      target: 4,
      poolFormula: [
        { kind: 'dice', sides: 6, rolls: [4] },
        { kind: 'text', text: '+' },
        { kind: 'dice', sides: 10, rolls: [7] },
      ],
    };
    const { container } = render(<CustomWeaponRoll data={data} timestamp={null} />);

    const formulaLine = container.querySelector('.log-formula-breakdown');
    expect(formulaLine).not.toBeNull();
    expect(formulaLine.textContent).toBe('D6+D10');
  });

  it('renders the formula line for a traditional-mode weapon roll (no poolFormula)', () => {
    const data = {
      outcome: 'regular_success',
      roll: 5,
      target: 4,
      formulaBreakdown: '2D6+3',
    };
    const { container } = render(<CustomWeaponRoll data={data} timestamp={null} />);

    const formulaLine = container.querySelector('.log-formula-breakdown');
    expect(formulaLine).not.toBeNull();
    expect(formulaLine.textContent).toBe('2D6+3');
  });
});
