import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImageCropModal from './ImageCropModal';
import { PRESETS } from '../../utils/imageProcessing';

// react-easy-crop needs real layout and image loading, neither of which jsdom
// provides. The stub reports a crop area immediately so the confirm path runs.
// React is required inside the factory: jest.mock factories are hoisted above
// the imports and may not reference out-of-scope variables.
//
// One stub for the whole file. mockReportsArea switches whether it behaves like
// a cropper that has finished layout (reports an area) or one that has not yet.
// Swapping the module per-test instead would reload React into a second
// registry and crash with an "Invalid hook call".
let mockReportsArea = true;

jest.mock('react-easy-crop', () => {
  const ReactInner = require('react');
  return ({ onCropComplete }) => {
    ReactInner.useEffect(() => {
      if (mockReportsArea) {
        onCropComplete({}, { x: 0, y: 0, width: 100, height: 100 });
      }
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
  mockReportsArea = true;
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

  expect(processImage).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'map.png' }),
    PRESETS.libraryImage,
    { x: 0, y: 0, width: 100, height: 100 }
  );
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
  // The state ImageCropModal is in between opening and react-easy-crop
  // finishing layout. Confirming here would hand processImage a null crop
  // area, which bypasses the preset's aspect ratio entirely.
  mockReportsArea = false;

  render(
    <ImageCropModal
      file={sourceFile()}
      preset={PRESETS.avatar}
      onConfirm={jest.fn()}
      onCancel={jest.fn()}
    />
  );

  expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled();
});

test('maps a too-large source to its own message', async () => {
  const { ImageProcessingError } = jest.requireActual('../../utils/imageProcessing');
  processImage.mockRejectedValue(new ImageProcessingError('source-too-large'));
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

  expect(await screen.findByText('imageCrop.sourceTooLarge')).toBeInTheDocument();
  expect(onConfirm).not.toHaveBeenCalled();
});

test('stays busy until an async onConfirm settles', async () => {
  processImage.mockResolvedValue(new File(['y'], 'map.webp', { type: 'image/webp' }));

  let releaseUpload;
  const onConfirm = jest.fn(() => new Promise((resolve) => { releaseUpload = resolve; }));

  render(
    <ImageCropModal
      file={sourceFile()}
      preset={PRESETS.libraryImage}
      onConfirm={onConfirm}
      onCancel={jest.fn()}
    />
  );

  const save = screen.getByRole('button', { name: 'common.save' });
  const cancel = screen.getByRole('button', { name: 'common.cancel' });

  await userEvent.click(save);
  await waitFor(() => expect(onConfirm).toHaveBeenCalled());

  // The upload has not resolved yet. Both buttons must still be locked.
  expect(save).toBeDisabled();
  expect(cancel).toBeDisabled();

  await act(async () => { releaseUpload(); });

  await waitFor(() => expect(save).not.toBeDisabled());
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
