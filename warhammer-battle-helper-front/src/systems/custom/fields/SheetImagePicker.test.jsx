import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../../i18n';
import SheetImagePicker from './SheetImagePicker';
import { PRESETS } from '../../../utils/imageProcessing';

const renderPicker = (props) => render(
  <SheetImagePicker url="" preset={PRESETS.sheetImage} variant="free" upload={null} onChange={null} {...props} />
);

test('static picker shows a disabled upload button and no actions', () => {
  renderPicker();
  expect(screen.getByRole('button', { name: 'Upload image' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull();
});

test('interactive empty picker enables the upload button', () => {
  renderPicker({ upload: jest.fn(), onChange: jest.fn() });
  expect(screen.getByRole('button', { name: 'Upload image' })).toBeEnabled();
});

test('filled picker shows the resolved image', () => {
  const { container } = renderPicker({ url: '/avatars/crest.webp' });
  // The image is decorative (alt=""), so it has no 'img' role to query by.
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  expect(container.querySelector('img').getAttribute('src')).toMatch(/\/avatars\/crest\.webp$/);
});

test('remove clears the value', () => {
  const onChange = jest.fn();
  renderPicker({ url: '/avatars/crest.webp', upload: jest.fn(), onChange });
  fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
  expect(onChange).toHaveBeenCalledWith('');
});

test('a filled static picker has no change/remove actions', () => {
  renderPicker({ url: '/avatars/crest.webp' });
  expect(screen.queryByRole('button', { name: 'Change image' })).toBeNull();
});

test('avatar variant carries its modifier class', () => {
  const { container } = renderPicker({ variant: 'avatar', preset: PRESETS.avatar });
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  expect(container.querySelector('.custom-sheet__image--avatar')).not.toBeNull();
});

test('an unsupported file type shows the type message, not the upload-failed one', () => {
  const { container } = renderPicker({ upload: jest.fn(), onChange: jest.fn() });
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  const input = container.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } });
  expect(screen.getByText('Unsupported file type — use JPG, PNG or WebP')).toBeInTheDocument();
  expect(screen.queryByText('Image upload failed')).toBeNull();
});
