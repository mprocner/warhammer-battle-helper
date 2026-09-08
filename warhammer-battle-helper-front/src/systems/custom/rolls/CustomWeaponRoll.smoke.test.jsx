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

  it('shows the target even when it is negative (a real, cancelled-out skill total)', () => {
    // FEATURE-162: same guard bug as CustomRoll — a negative attack target used to be
    // hidden by `data.target > 0`, leaving no target to check the roll against.
    const data = {
      outcome: 'failure',
      roll: 3,
      target: -10,
    };
    const { container } = render(<CustomWeaponRoll data={data} timestamp={null} />);

    const description = container.querySelector('.log-list-item__description');
    expect(description.textContent).toContain('vs -10');
  });

  it('hides "vs 0" on a pool roll with no configured success threshold', () => {
    // FEATURE-162 fix wave 3, finding 1: wave 2's finding 7 fixed this on CustomRoll but
    // was never copied here, so a pool-mode weapon attack with no configured
    // PoolSuccessThreshold rendered a meaningless "vs 0" (see roller.go's zero default —
    // "any die counts"; no die can ever roll 0, so the number carries no information).
    const data = {
      outcome: 'regular_success',
      roll: 2,
      target: 0,
      poolFormula: [
        { kind: 'dice', sides: 6, rolls: [4] },
        { kind: 'text', text: '+' },
        { kind: 'dice', sides: 6, rolls: [2] },
      ],
    };
    const { container } = render(<CustomWeaponRoll data={data} timestamp={null} />);

    const description = container.querySelector('.log-list-item__description');
    expect(description.textContent).not.toContain('vs 0');
  });

  // BUG-192 finding 4: this component already builds the label the safe way
  // (`data.weaponName || t('log.weapon')`) — these assertions lock that in so a future
  // migration can't silently regress it into the coc7e/dnd5e template-literal bug.
  it('shows the weapon name in the description label', () => {
    const data = { outcome: 'regular_success', roll: 2, target: 4, weaponName: 'Halabarda' };
    const { container } = render(<CustomWeaponRoll data={data} timestamp={null} />);

    const label = container.querySelector('.log-list-item__description .log-list-item__character-name');
    expect(label.textContent).toBe('⚔ Halabarda');
  });

  it('falls back to the generic weapon label when weaponName is missing', () => {
    const data = { outcome: 'regular_success', roll: 2, target: 4 };
    const { container } = render(<CustomWeaponRoll data={data} timestamp={null} />);

    const label = container.querySelector('.log-list-item__description .log-list-item__character-name');
    expect(label.textContent).not.toContain('undefined');
    expect(label.textContent).toBe('⚔ Weapon');
  });
});
