import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImageCropModal from './ImageCropModal';
import { PRESETS } from '../../utils/imageProcessing';

// react-image-crop needs real layout, which jsdom does not provide. The stub
// renders its children (so the <img> and its onLoad survive) and exposes a
// button that fires onChange, standing in for the user dragging the frame.
//
// React is required inside the factory: jest.mock factories are hoisted above
// the imports and may not reference out-of-scope variables. Swapping the module
// per-test with jest.resetModules instead would reload React into a second
// registry and crash on an invalid hook call.
jest.mock('react-image-crop', () => {
  const ReactInner = require('react');
  return {
    __esModule: true,
    default: ({ children, onChange }) =>
      ReactInner.createElement(
        'div',
        { 'data-testid': 'cropper' },
        ReactInner.createElement(
          'button',
          {
            type: 'button',
            onClick: () => onChange({}, { unit: '%', x: 10, y: 20, width: 30, height: 40 }),
          },
          'drag-the-frame'
        ),
        children
      ),
    // The real helpers are the library's business; what matters here is that the
    // component routes a fixed-aspect preset through them and sends the result on.
    centerCrop: (crop) => crop,
    makeAspectCrop: () => ({ unit: '%', x: 25, y: 0, width: 50, height: 100 }),
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

// jsdom never loads a blob: URL and reports naturalWidth as 0, so the load event
// and the intrinsic size both have to be supplied by hand.
const loadImage = (width = 1600, height = 900) => {
  const img = document.querySelector('.image-crop-modal__area img');
  Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });
  fireEvent.load(img);
};

const renderModal = (preset, overrides = {}) =>
  render(
    <ImageCropModal
      file={sourceFile()}
      preset={preset}
      onConfirm={jest.fn()}
      onCancel={jest.fn()}
      {...overrides}
    />
  );

test('hands the processed file to onConfirm', async () => {
  const processed = new File(['y'], 'map.webp', { type: 'image/webp' });
  processImage.mockResolvedValue(processed);
  const onConfirm = jest.fn();

  renderModal(PRESETS.libraryImage, { onConfirm });
  loadImage();

  await userEvent.click(screen.getByRole('button', { name: 'common.save' }));

  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(processed));
});

test('an untouched frame on a free-aspect preset sends no crop area', async () => {
  processImage.mockResolvedValue(new File(['y'], 'map.png', { type: 'image/png' }));

  renderModal(PRESETS.libraryImage);
  loadImage();

  await userEvent.click(screen.getByRole('button', { name: 'common.save' }));

  await waitFor(() => expect(processImage).toHaveBeenCalled());
  expect(processImage).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'map.png' }),
    PRESETS.libraryImage,
    null
  );
});

test('an untouched frame on a fixed-aspect preset still sends a rectangle', async () => {
  // The avatar's opening frame is a centred square — already a crop. Extending
  // the "untouched means no crop" rule to it would upload the whole portrait.
  processImage.mockResolvedValue(new File(['y'], 'a.png', { type: 'image/png' }));

  renderModal(PRESETS.avatar);
  loadImage(1600, 900);

  await userEvent.click(screen.getByRole('button', { name: 'common.save' }));

  await waitFor(() => expect(processImage).toHaveBeenCalled());
  expect(processImage).toHaveBeenCalledWith(
    expect.anything(),
    PRESETS.avatar,
    { x: 400, y: 0, width: 800, height: 900 }
  );
});

test('dragging the frame makes even a free-aspect preset send a rectangle', async () => {
  processImage.mockResolvedValue(new File(['y'], 'map.png', { type: 'image/png' }));

  renderModal(PRESETS.libraryImage);
  loadImage(1600, 900);

  await userEvent.click(screen.getByRole('button', { name: 'drag-the-frame' }));
  await userEvent.click(screen.getByRole('button', { name: 'common.save' }));

  await waitFor(() => expect(processImage).toHaveBeenCalled());
  expect(processImage).toHaveBeenCalledWith(
    expect.anything(),
    PRESETS.libraryImage,
    { x: 160, y: 180, width: 480, height: 360 }
  );
});

test('save stays disabled until the image has loaded', () => {
  // Before load there is no intrinsic size, so no percentage can be turned into
  // source pixels. Confirming here would crash or send nonsense.
  renderModal(PRESETS.avatar);

  expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled();
});

test('shows an error and does not confirm when processing fails', async () => {
  const { ImageProcessingError } = jest.requireActual('../../utils/imageProcessing');
  processImage.mockRejectedValue(new ImageProcessingError('encode-failed'));
  const onConfirm = jest.fn();

  renderModal(PRESETS.libraryImage, { onConfirm });
  loadImage();

  await userEvent.click(screen.getByRole('button', { name: 'common.save' }));

  expect(await screen.findByText('imageCrop.processingFailed')).toBeInTheDocument();
  expect(onConfirm).not.toHaveBeenCalled();
});

test('maps a too-large source to its own message', async () => {
  const { ImageProcessingError } = jest.requireActual('../../utils/imageProcessing');
  processImage.mockRejectedValue(new ImageProcessingError('source-too-large'));
  const onConfirm = jest.fn();

  renderModal(PRESETS.libraryImage, { onConfirm });
  loadImage();

  await userEvent.click(screen.getByRole('button', { name: 'common.save' }));

  expect(await screen.findByText('imageCrop.sourceTooLarge')).toBeInTheDocument();
  expect(onConfirm).not.toHaveBeenCalled();
});

test('stays busy until an async onConfirm settles', async () => {
  processImage.mockResolvedValue(new File(['y'], 'map.webp', { type: 'image/webp' }));

  let releaseUpload;
  const onConfirm = jest.fn(() => new Promise((resolve) => { releaseUpload = resolve; }));

  renderModal(PRESETS.libraryImage, { onConfirm });
  loadImage();

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

  renderModal(PRESETS.libraryImage, { onCancel });
  loadImage();

  await userEvent.click(screen.getByRole('button', { name: 'common.cancel' }));

  expect(onCancel).toHaveBeenCalled();
  expect(processImage).not.toHaveBeenCalled();
});
