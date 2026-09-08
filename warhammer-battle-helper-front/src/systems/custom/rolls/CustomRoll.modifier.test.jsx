import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../../i18n';
import CustomRoll from './CustomRoll';

const base = {
  characterName: 'Bohater',
  skillName: 'Perswazja',
  roll: 48,
  target: 35,
  outcome: 'failure',
  diceType: 100,
};

describe('CustomRoll modifier visibility', () => {
  // Target "roll" jest już wliczony w breakdown ("d100-20 = 48-20 = 28") — powtórzenie go
  // obok byłoby tą samą liczbą dwa razy.
  it('does not repeat a modifier already baked into the breakdown', () => {
    const { container } = render(
      <CustomRoll data={{ ...base, roll: 28, target: 55, modifier: -20, modifierTarget: 'roll', formulaBreakdown: 'd100-20 = 48-20 = 28' }} />
    );
    expect(container.querySelector('.log-modifier')).toBeNull();
  });

  // Target "threshold" nie rusza breakdownu, więc bez tego modyfikator przepadałby z widoku.
  it('shows a threshold modifier next to the roll', () => {
    render(
      <CustomRoll data={{ ...base, modifier: -20, modifierTarget: 'threshold', formulaBreakdown: 'd100 = 48' }} />
    );
    expect(screen.getByText('(-20)')).toBeInTheDocument();
  });

  it('shows a pool dice-count modifier', () => {
    render(
      <CustomRoll data={{
        ...base, roll: 3, target: 4, outcome: 'regular_success',
        modifier: 2, modifierTarget: 'dice_count',
        poolFormula: [{ kind: 'dice', sides: 6, rolls: [4, 6, 2, 5, 1] }],
        poolSuccesses: 3, poolSuccessCondition: 'gte',
      }} />
    );
    expect(screen.getByText('(+2)')).toBeInTheDocument();
  });

  // Pairs with the dice_count case above: together they're the only thing that discriminates
  // showsModifierSeparately for a pool roll (hasFormula true via poolFormula, not
  // formulaBreakdown) — dice_count shows it, "roll" suppresses it, same as the traditional case.
  it('hides a pool roll modifier targeting "roll"', () => {
    const { container } = render(
      <CustomRoll data={{
        ...base, roll: 3, target: 4, outcome: 'regular_success',
        modifier: 2, modifierTarget: 'roll',
        poolFormula: [{ kind: 'dice', sides: 6, rolls: [4, 6, 2, 5, 1] }],
        poolSuccesses: 3, poolSuccessCondition: 'gte',
      }} />
    );
    expect(container.querySelector('.log-modifier')).toBeNull();
  });

  it('shows nothing when there was no modifier', () => {
    const { container } = render(
      <CustomRoll data={{ ...base, modifier: 0, modifierTarget: '', formulaBreakdown: 'd100 = 48' }} />
    );
    expect(container.querySelector('.log-modifier')).toBeNull();
  });
});
