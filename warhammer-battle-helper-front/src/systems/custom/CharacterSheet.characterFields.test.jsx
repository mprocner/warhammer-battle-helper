/* eslint-disable testing-library/no-node-access, testing-library/no-container, testing-library/no-unnecessary-act, import/first */
import React from 'react';
import { render, fireEvent, act, screen } from '@testing-library/react';
import '../../i18n';

jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: {},
  getApiUrl: () => 'http://test',
  getApiHeaders: (h = {}) => h,
}));

import CustomCharacterSheet from './CharacterSheet';

const template = {
  name: 'Mój system',
  sections: [{ id: 's', fields: [
    { key: 'nm', type: 'char_name', label: 'Imię' },
    { key: 'crest', type: 'image', label: 'Herb' },
    { key: 'notes', type: 'text_short', label: 'Notatki' },
  ] }],
};

const renderSheet = (character) => render(
  <CustomCharacterSheet
    character={character}
    onClose={() => {}}
    onCharacterUpdate={() => {}}
    gameId="g1"
    token="t"
    game={{ customSystemTemplate: template }}
    isStandalone
  />
);

beforeEach(() => {
  jest.useFakeTimers();
  global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
});
afterEach(() => jest.useRealTimers());

const lastBody = () => JSON.parse(global.fetch.mock.calls[global.fetch.mock.calls.length - 1][1].body);

test('the old name header is gone', () => {
  const { container } = renderSheet({ id: 'c1', name: 'Bohater', stats: {} });
  expect(container.querySelector('.custom-sheet__char-header')).toBeNull();
});

test('typing in the name field saves character.name, keeping the avatar', async () => {
  const { container } = renderSheet({ id: 'c1', name: 'Bohater', avatar: '/avatars/a.webp', stats: {} });
  fireEvent.change(container.querySelector('.custom-sheet__text-input'), { target: { value: 'Bohaterka' } });
  await act(async () => { jest.advanceTimersByTime(800); });
  expect(lastBody()).toMatchObject({ name: 'Bohaterka', avatar: '/avatars/a.webp' });
});

test('removing an image saves immediately and drops the key from stats.images', async () => {
  renderSheet({ id: 'c1', name: 'B', stats: { images: { crest: '/avatars/c.webp' } } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove image' })); });
  expect(lastBody().stats.images).toEqual({});
});

// The upload handlers run after an async upload, so the autosave timer scheduled by an earlier
// keystroke is still pending. The immediate save must carry that keystroke and cancel the timer.
test('removing an image within the debounce keeps typed text and is not undone by the old timer', async () => {
  const { container } = renderSheet({ id: 'c1', name: 'B', stats: { images: { crest: '/avatars/c.webp' } } });
  const notes = container.querySelectorAll('.custom-sheet__text-input')[1];
  fireEvent.change(notes, { target: { value: 'wpisane' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove image' })); });
  await act(async () => { jest.advanceTimersByTime(1000); });

  expect(global.fetch).toHaveBeenCalledTimes(1);
  const body = lastBody();
  expect(body.stats.texts).toEqual({ notes: 'wpisane' });
  expect(body.stats.images).toEqual({});
});

test('an image change after a typed name carries the typed name', async () => {
  const { container } = renderSheet({ id: 'c1', name: 'B', stats: { images: { crest: '/avatars/c.webp' } } });
  fireEvent.change(container.querySelector('.custom-sheet__text-input'), { target: { value: 'Nowe' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove image' })); });
  expect(lastBody()).toMatchObject({ name: 'Nowe' });
});
