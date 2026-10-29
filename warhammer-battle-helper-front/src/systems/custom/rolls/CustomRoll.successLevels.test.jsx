import React from 'react';
import { render, screen } from '@testing-library/react';
import i18n from '../../../i18n';
import CustomRoll from './CustomRoll';
import CustomWeaponRoll from './CustomWeaponRoll';

const base = { characterName: 'Hero', skillName: 'Charm', roll: 12, target: 60, diceType: 100 };

describe('custom roll success levels', () => {
  it('shows the tier name in the tier colour', () => {
    const { container } = render(
      <CustomRoll data={{ ...base, outcome: 'regular_success', tierLabel: 'Extreme', tierColor: '#b8941f' }} />
    );
    expect(screen.getByText('Extreme')).toHaveStyle({ color: '#b8941f' });
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelector('.wax-seal-token')).toHaveStyle({ background: '#b8941f' });
  });

  it('appends the signed level to the outcome label', () => {
    render(<CustomRoll data={{ ...base, roll: 38, target: 45, outcome: 'failure', hasSuccessLevel: true, successLevel: 0 }} />);
    const abbr = i18n.t('customRoll.slAbbr');
    expect(screen.getByText(`${i18n.t('customRoll.failure')} · −0 ${abbr}`)).toBeInTheDocument();
  });

  it('leaves a roll without success data as it was', () => {
    render(<CustomRoll data={{ ...base, outcome: 'regular_success' }} />);
    expect(screen.getByText(i18n.t('customRoll.regular_success'))).toBeInTheDocument();
  });

  it('shows the tier on a weapon attack', () => {
    render(<CustomWeaponRoll data={{ ...base, weaponName: 'Axe', outcome: 'regular_success', tierLabel: 'Hard', tierColor: '#5a7a4a' }} />);
    expect(screen.getByText('Hard')).toHaveStyle({ color: '#5a7a4a' });
  });
});
