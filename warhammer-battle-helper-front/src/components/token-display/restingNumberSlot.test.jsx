import React from 'react';
import { render } from '@testing-library/react';
import TokenOverlay from './TokenOverlay';
import ImageTokenOverlay from './ImageTokenOverlay';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock('../../api/axios', () => ({ getApiUrl: () => 'http://api.test', getApiHeaders: () => ({}) }));
jest.mock('../../api/scenes', () => ({}));
// The registry imports every system's sheet (and through it axios ESM); a number slot needs none.
jest.mock('../../systems/registry', () => ({ getSystem: () => null }));

// A number slot must show on a resting (unselected) token even when its value is 0 or was never
// set — the selected token's input shows 0 in that case, so the ring must not lose the chip.
const restingValues = (container) =>
  [...container.querySelectorAll('.token-slot--num .token-slot__val')].map(n => n.textContent);

const numberSlot = { id: 'ammo', type: 'number', numberLabel: 'AMMO' };

describe('resting number slot', () => {
  test('character token (GM / card-holder): an unset number shows as 0', () => {
    const config = { enabled: true, slots: [numberSlot], hpBars: [], squares: [] };
    const { container } = render(
      <TokenOverlay character={{ id: 'c1', states: [] }} config={config} selected={false} canEdit />
    );
    expect(restingValues(container)).toEqual(['0']);
  });

  test('character token (card-less view): a number slot without a value shows as 0', () => {
    const tokenView = { slots: [{ slot: numberSlot }] };
    const { container } = render(
      <TokenOverlay character={{ id: 'c1' }} tokenView={tokenView} selected={false} canEdit={false} />
    );
    expect(restingValues(container)).toEqual(['0']);
  });

  test('image token: a zero number (omitted by the server) still shows', () => {
    const image = { id: 'i1', width: 50, height: 50, tokenOverlay: { enabled: true, slots: [numberSlot], hpBars: [] } };
    const { container } = render(<ImageTokenOverlay image={image} selected={false} canEdit={false} />);
    expect(restingValues(container)).toEqual(['0']);
  });
});
