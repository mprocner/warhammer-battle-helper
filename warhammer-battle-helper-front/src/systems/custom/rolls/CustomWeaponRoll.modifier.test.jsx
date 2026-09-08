import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../../i18n';
import CustomWeaponRoll from './CustomWeaponRoll';

const base = {
  characterName: 'Bohater',
  weaponName: 'Miecz',
  roll: 48,
  target: 35,
  outcome: 'failure',
  diceType: 100,
};

describe('CustomWeaponRoll modifier visibility', () => {
  // Target "roll" is already inside the breakdown ("d100-20 = 48-20 = 28") — printing it
  // alongside would show the same number twice.
  it('does not repeat a modifier already baked into the breakdown', () => {
    const { container } = render(
      <CustomWeaponRoll data={{ ...base, roll: 28, target: 55, modifier: -20, modifierTarget: 'roll', formulaBreakdown: 'd100-20 = 48-20 = 28' }} />
    );
    expect(container.querySelector('.log-modifier')).toBeNull();
  });

  // Same modifier, different target: the breakdown is untouched, so without this the player
  // would see no modifier anywhere. This is the case that makes the pair discriminate.
  it('shows a threshold modifier next to the roll', () => {
    render(
      <CustomWeaponRoll data={{ ...base, modifier: -20, modifierTarget: 'threshold', formulaBreakdown: 'd100 = 48' }} />
    );
    expect(screen.getByText('(-20)')).toBeInTheDocument();
  });
});
