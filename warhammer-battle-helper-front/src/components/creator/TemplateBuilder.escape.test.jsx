import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import '../../i18n';
import TemplateBuilder from './TemplateBuilder';

jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

// PLAYRPG-285: Escape used to reach the creator's own MUI Dialog as onClose('escapeKeyDown') and
// send the GM back to the lobby. It must close the topmost popup instead, and do nothing at all
// when no popup is open.

const template = {
  id: 't1', name: 'T', settings: { diceButtons: [] },
  sections: [{ id: 's1', title: 'Cechy', columns: 1, fields: [{ key: 'f1', type: 'text_short', label: 'Alpha' }] }],
};

let realFetch;
beforeEach(() => {
  localStorage.setItem('tutorialSeen:creator:general', '1');
  localStorage.setItem('tutorialSeen:creator:sheet', '1');
  // handleClose saves through fetch before calling onClose; resolve it at once so a wrongly
  // triggered close would reach onClose within the test.
  realFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
});
afterEach(() => { global.fetch = realFetch; });

const mount = (onClose) => render(
  <TemplateBuilder template={template} token="tok" onClose={onClose} onTemplateUpdated={() => {}} />,
);

// The keydown has to start inside the Dialog's React subtree, like a real one from a focused
// element in the creator; a keydown on body never reaches MUI's handler at all.
const pressEscape = async (target = document.querySelector('.MuiDialog-container')) => {
  await act(async () => { fireEvent.keyDown(target, { key: 'Escape', code: 'Escape', keyCode: 27 }); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
};

const editAlpha = () => {
  fireEvent.click(screen.getByText('Sheet'));
  const label = [...document.querySelectorAll('.custom-sheet__field-label')].find(el => el.textContent === 'Alpha');
  fireEvent.click(within(label.closest('.custom-sheet__editable')).getByLabelText('Edit'));
};

const propsPopup = () => document.querySelector('.creator__props-popup');

test('Escape with no popup open does not close the creator', async () => {
  const onClose = jest.fn();
  mount(onClose);
  await pressEscape();
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByText('Sheet')).toBeInTheDocument();
});

test('Escape closes the properties popup and leaves the creator open', async () => {
  const onClose = jest.fn();
  mount(onClose);
  editAlpha();
  expect(propsPopup()).toBeInTheDocument();

  await pressEscape(propsPopup());
  expect(propsPopup()).not.toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
});

test('Escape closes only the delete confirmation, not the properties popup behind it', async () => {
  const onClose = jest.fn();
  mount(onClose);
  editAlpha();
  fireEvent.click(within(propsPopup()).getByRole('button', { name: /delete/i }));
  expect(document.querySelector('.confirm-modal')).toBeInTheDocument();

  await pressEscape();
  expect(document.querySelector('.confirm-modal')).not.toBeInTheDocument();
  expect(propsPopup()).toBeInTheDocument();
  expect(screen.getByText('Alpha', { selector: '.custom-sheet__field-label' })).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
});
