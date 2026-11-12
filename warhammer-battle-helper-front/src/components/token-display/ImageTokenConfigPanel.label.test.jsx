import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../i18n';
import ImageTokenConfigPanel from './ImageTokenConfigPanel';
import { updateSceneImage } from '../../api/scenes';

jest.mock('../../api/scenes', () => ({ updateSceneImage: jest.fn(() => Promise.resolve()), applyImageTokenSlot: jest.fn() }));
// The registry imports every system's sheet (and through it axios ESM); the panel only reads states.
jest.mock('../../systems/registry', () => ({ getSystem: () => null }));

const image = { id: 'img1', width: 50, height: 50, label: 'Goblin', tokenOverlay: { enabled: true, slots: [], hpBars: [] } };

test('the label field starts from the saved label and is saved together with the overlay', async () => {
  render(<ImageTokenConfigPanel image={image} gameId="g1" sceneId="s1" onClose={() => {}} />);
  const field = screen.getByLabelText('Label');
  expect(field.value).toBe('Goblin');

  fireEvent.change(field, { target: { value: 'Orc chief' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(updateSceneImage).toHaveBeenCalled());
  const [, , , payload] = updateSceneImage.mock.calls[0];
  expect(payload.label).toBe('Orc chief');
  expect(payload.tokenOverlay).toBeDefined();
});
