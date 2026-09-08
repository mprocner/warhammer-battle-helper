import React from 'react';
import { render } from '@testing-library/react';
import '../../../i18n';
import WeaponRoll from './WeaponRoll';

// BUG-192 finding 1: `⚔ ${data.weaponName}` stringifies an absent weaponName as the literal
// text "undefined" (React drops it silently only as a JSX child, not inside a template
// literal). These assertions lock the composed label TEXT, which the tooltip-only test
// added earlier for TruncatedLabel would never have caught.
describe('DnD5e WeaponRoll', () => {
  it('shows the weapon name in the description label', () => {
    const data = { outcome: 'hit', roll: 15, d20Roll: 12, target: 14, weaponName: 'Halabarda' };
    const { container } = render(<WeaponRoll data={data} timestamp={null} />);

    const label = container.querySelector('.log-list-item__description .log-list-item__character-name');
    expect(label.textContent).toBe('⚔ Halabarda');
  });

  it('falls back to the generic weapon label when weaponName is missing', () => {
    const data = { outcome: 'hit', roll: 15, d20Roll: 12, target: 14 };
    const { container } = render(<WeaponRoll data={data} timestamp={null} />);

    const label = container.querySelector('.log-list-item__description .log-list-item__character-name');
    expect(label.textContent).not.toContain('undefined');
    expect(label.textContent).toBe('⚔ Weapon');
  });
});
