import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImageCropModal from './ImageCropModal';
import { PRESETS } from '../../utils/imageProcessing';

// react-easy-crop needs real layout and image loading, neither of which jsdom
// provides. The stub reports a crop area immediately so the confirm path runs.
// React is required inside the factory: jest.mock factories are hoisted above
// the imports and may not reference out-of-scope variables.
jest.mock('react-easy-crop', () => {
  const ReactInner = require('react');
  return ({ onCropComplete }) => {
    ReactInner.useEffect(() => {
      onCropComplete({}, { x: 0, y: 0, width: 100, height: 100 });
    }, [onCropComplete]);
    return ReactInner.createElement('div', { 'data-testid': 'cropper' });
  };
});

jest.mock('../../utils/imageProcessing', () => ({
  ...jest.requireActual('../../utils/imageProcessing'),
  processImage: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

const { processImage } = require('../../utils/imageProcessing');

beforeEach(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:stub');
  global.URL.revokeObjectURL = jest.fn();
  processImage.mockReset();
});

const sourceFile = () => new File(['x'], 'map.png', { type: 'image/png' });

test('hands the processed file to onConfirm', async () => {
  const processed = new File(['y'], 'map.webp', { type: 'image/webp' });
  processImage.mockResolvedValue(processed);
  const onConfirm = jest.fn();

  render(
    <ImageCropModal
      file={sourceFile()}
      preset={PRESETS.libraryImage}
      onConfirm={onConfirm}
      onCancel={jest.fn()}
    />
  );

  await userEvent.click(screen.getByRole('button', { name: 'common.save' }));

  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(processed));
});

test('shows an error and does not confirm when processing fails', async () => {
  const { ImageProcessingError } = jest.requireActual('../../utils/imageProcessing');
  processImage.mockRejectedValue(new ImageProcessingError('encode-failed'));
  const onConfirm = jest.fn();

  render(
    <ImageCropModal
      file={sourceFile()}
      preset={PRESETS.libraryImage}
      onConfirm={onConfirm}
      onCancel={jest.fn()}
    />
  );

  await userEvent.click(screen.getByRole('button', { name: 'common.save' }));

  expect(await screen.findByText('imageCrop.processingFailed')).toBeInTheDocument();
  expect(onConfirm).not.toHaveBeenCalled();
});

test('save stays disabled until a crop area is reported', () => {
  // The module-level stub reports an area on mount, so this test needs a
  // cropper that never does — the state ImageCropModal is in between opening
  // and react-easy-crop finishing layout. Confirming there would hand
  // processImage a null crop area, which bypasses the preset's aspect ratio.
  jest.resetModules();
  jest.doMock('react-easy-crop', () => {
    const ReactInner = require('react');
    return () => ReactInner.createElement('div', { 'data-testid': 'cropper' });
  });
  const SilentModal = require('./ImageCropModal').default;

  render(
    <SilentModal
      file={sourceFile()}
      preset={PRESETS.avatar}
      onConfirm={jest.fn()}
      onCancel={jest.fn()}
    />
  );

  expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled();
});

test('cancel closes without processing', async () => {
  const onCancel = jest.fn();

  render(
    <ImageCropModal
      file={sourceFile()}
      preset={PRESETS.libraryImage}
      onConfirm={jest.fn()}
      onCancel={onCancel}
    />
  );

  await userEvent.click(screen.getByRole('button', { name: 'common.cancel' }));

  expect(onCancel).toHaveBeenCalled();
  expect(processImage).not.toHaveBeenCalled();
});
