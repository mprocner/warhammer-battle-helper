import React from 'react';
import { render, screen } from '@testing-library/react';
import ImageTokenOverlay from './ImageTokenOverlay';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock('../../api/scenes', () => ({}));
// The registry imports every system's sheet (and through it axios ESM); bars need none.
jest.mock('../../systems/registry', () => ({ getSystem: () => null }));

const bar = { id: 'hp', label: 'HP', current: 5, max: 10 };
const image = (width, height, rotation = 0) => ({ id: 'i1', width, height, rotation, tokenOverlay: { enabled: true, hpBars: [bar], slots: [] } });
const stackTransform = () => screen.getByText('5 / 10').closest('.img-token-hp-stack').style.transform; // eslint-disable-line testing-library/no-node-access

// At rest the bars sit right on the image's top edge (PLAYRPG-357): the offset from the centre is
// the rotated image's half height, not the ring radius (which follows the LONGER side and left a
// wide image's bars floating far above it).
describe('image token bar stack', () => {
  test('at rest it touches the top edge of a wide image', () => {
    render(<ImageTokenOverlay image={image(100, 50)} selected={false} canEdit={false} />);
    expect(stackTransform()).toBe('translate(-50%, calc(-100% - 25px))');
  });

  test('at rest it follows the rotated image, not its unrotated box', () => {
    render(<ImageTokenOverlay image={image(100, 50, 90)} selected={false} canEdit={false} />);
    expect(stackTransform()).toBe('translate(-50%, calc(-100% - 50px))');
  });

  test('selected, it still clears a pushed-out ring slot', () => {
    // ringRadius = 50 + 17, HP_CLEAR = 16 + 14 + 4 → 101px above the centre.
    render(<ImageTokenOverlay image={image(100, 50)} selected canEdit={false} />);
    expect(stackTransform()).toBe('translate(-50%, calc(-100% - 101px))');
  });
});
