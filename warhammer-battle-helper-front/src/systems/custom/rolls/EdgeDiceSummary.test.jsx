/* eslint-disable testing-library/no-node-access, testing-library/no-container -- the dice chips are asserted by BEM class, as in the sibling roll tests */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../../i18n';
import EdgeDiceSummary from './EdgeDiceSummary';
import CustomRoll from './CustomRoll';

describe('EdgeDiceSummary', () => {
  it('renders nothing for a roll without dice', () => {
    const { container } = render(<EdgeDiceSummary diceMod={0} allRolls={undefined} roll={48} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists every candidate and marks the kept one', () => {
    const { container } = render(<EdgeDiceSummary diceMod={1} allRolls={[47, 27]} roll={27} />);
    const rolls = [...container.querySelectorAll('.custom-edge-dice__roll')].map(n => n.textContent);
    expect(rolls).toEqual(['47', '27']);
    expect(container.querySelector('.custom-edge-dice__roll--kept').textContent).toBe('27');
  });

  it('marks only the first of tied candidates', () => {
    const { container } = render(<EdgeDiceSummary diceMod={-1} allRolls={[30, 30]} roll={30} />);
    expect(container.querySelectorAll('.custom-edge-dice__roll--kept')).toHaveLength(1);
    expect(container.querySelectorAll('.custom-edge-dice__roll')[0]).toHaveClass('custom-edge-dice__roll--kept');
  });

  it('names setback dice', () => {
    render(<EdgeDiceSummary diceMod={-2} allRolls={[10, 80, 40]} roll={80} />);
    expect(screen.getByText(/setback dice|kości utrudnienia/)).toBeInTheDocument();
  });

  it('shows up in a custom roll log entry', () => {
    const { container } = render(
      <CustomRoll data={{ characterName: 'Bohater', skillName: 'Perswazja', roll: 27, target: 55, outcome: 'regular_success', diceType: 100, diceMod: 1, allRolls: [47, 27], modifierTarget: 'edge_dice', formulaBreakdown: 'd100 = 27' }} />
    );
    expect(container.querySelector('.custom-edge-dice')).not.toBeNull();
    expect(container.querySelector('.log-modifier')).toBeNull();
  });
});
