import React from 'react';
import { render, screen } from '@testing-library/react';
import { hpStackLayout } from './TokenRingChrome';
import TokenOverlay from './TokenOverlay';
import ImageTokenOverlay from './ImageTokenOverlay';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock('../../api/axios', () => ({ getApiUrl: () => 'http://api.test', getApiHeaders: () => ({}) }));
jest.mock('../../api/scenes', () => ({}));
// The registry imports every system's sheet (and through it axios ESM); bars need none.
jest.mock('../../systems/registry', () => ({ getSystem: () => null }));

describe('hpStackLayout', () => {
  test('up to two bars stay one per row at rest', () => {
    expect(hpStackLayout(2, false)).toEqual({ grid: false, compact: false });
  });
  test('more than two bars at rest go two per row, with short values', () => {
    expect(hpStackLayout(3, false)).toEqual({ grid: true, compact: true });
    expect(hpStackLayout(4, false)).toEqual({ grid: true, compact: true });
  });
  test('a selected token keeps full rows whatever the count', () => {
    expect(hpStackLayout(4, true)).toEqual({ grid: false, compact: false });
  });
});

const bars = (n) => Array.from({ length: n }, (_, i) => ({ id: `b${i}`, label: `B${i}`, current: 5, max: 10 }));
const stackOf = (text) => screen.getAllByText(text)[0].closest('.token-hp-stack, .img-token-hp-stack'); // eslint-disable-line testing-library/no-node-access

describe('resting stacks with more than two bars', () => {
  test('character token (card-less view)', () => {
    render(<TokenOverlay character={{ id: 'c1' }} tokenView={{ bars: bars(4) }} selected={false} canEdit={false} />);
    expect(stackOf('5')).toHaveClass('token-hp-stack--grid');
  });

  test('image token', () => {
    const image = { id: 'i1', width: 50, height: 50, tokenOverlay: { enabled: true, hpBars: bars(3), slots: [] } };
    render(<ImageTokenOverlay image={image} selected={false} canEdit={false} />);
    expect(stackOf('5')).toHaveClass('img-token-hp-stack--grid');
  });

  test('two bars keep the full "current / max" text and one bar per row', () => {
    const image = { id: 'i1', width: 50, height: 50, tokenOverlay: { enabled: true, hpBars: bars(2), slots: [] } };
    render(<ImageTokenOverlay image={image} selected={false} canEdit={false} />);
    expect(stackOf('5 / 10')).not.toHaveClass('img-token-hp-stack--grid');
  });
});
