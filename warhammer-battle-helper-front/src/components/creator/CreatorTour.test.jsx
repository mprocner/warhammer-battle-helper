import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import '../../i18n';
import TemplateBuilder from './TemplateBuilder';

jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const template = {
  id: 't1', name: 'T', settings: { diceButtons: [] },
  sections: [{ id: 's1', title: 'Cechy', columns: 1, fields: [{ key: 'f1', type: 'text_short', label: 'Imię' }] }],
};
const mount = () => render(<TemplateBuilder template={template} token="tok" onClose={() => {}} onTemplateUpdated={() => {}} />);

beforeEach(() => localStorage.clear());

test('opens the General tutorial by itself the first time', async () => {
  await act(async () => { mount(); });
  expect(await screen.findByText('Template name')).toBeInTheDocument();
});

test('Escape ends the running tour without closing the creator', async () => {
  const onClose = jest.fn();
  // handleClose saves through fetch before calling onClose; resolve it at once so a wrongly
  // triggered close would reach onClose within this test.
  const realFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  try {
    await act(async () => {
      render(<TemplateBuilder template={template} token="tok" onClose={onClose} onTemplateUpdated={() => {}} />);
    });
    await screen.findByText('Template name');
    // MUI Dialog reads Escape from a keydown bubbling through its React subtree (focus sits on
    // .MuiDialog-container or the portalled tooltip) and calls onClose('escapeKeyDown').
    const target = document.activeElement && document.activeElement !== document.body
      ? document.activeElement
      : document.querySelector('.MuiDialog-container');
    await act(async () => { fireEvent.keyDown(target, { key: 'Escape', code: 'Escape', keyCode: 27 }); });
    expect(screen.queryByText('Template name', { selector: '.tour-tooltip__title' })).not.toBeInTheDocument();
    expect(localStorage.getItem('tutorialSeen:creator:general')).toBe('1');
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(onClose).not.toHaveBeenCalled();
  } finally {
    global.fetch = realFetch;
  }
});

test('each step scrolls its anchor into view before it shows', async () => {
  // jsdom has no scrollIntoView.
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = jest.fn();
  try {
    await act(async () => { mount(); });
    await screen.findByText('Template name');
    await act(async () => { fireEvent.click(screen.getByText('Next')); });
    // The second step of a non-variant template is the tab navigation.
    const tabNav = document.querySelector('.creator__tab-nav--two-tabs');
    expect(Element.prototype.scrollIntoView.mock.instances).toContain(tabNav);
  } finally {
    Element.prototype.scrollIntoView = original;
  }
});

test('does not auto-start a tab whose tutorial was seen', async () => {
  localStorage.setItem('tutorialSeen:creator:general', '1');
  await act(async () => { mount(); });
  expect(screen.queryByText('Template name')).not.toBeInTheDocument();
});

test('finishing marks the General tutorial seen', async () => {
  await act(async () => { mount(); });
  await screen.findByText('Template name');
  await act(async () => { fireEvent.click(screen.getByText('Skip')); });
  expect(localStorage.getItem('tutorialSeen:creator:general')).toBe('1');
});

test('switching to the Sheet tab mid-tour replaces the General tutorial with the Sheet one', async () => {
  await act(async () => { mount(); });
  // General auto-starts on first open.
  expect(await screen.findByText('Template name', { selector: '.tour-tooltip__title' })).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByText('Sheet')); });
  expect(screen.queryByText('Template name', { selector: '.tour-tooltip__title' })).not.toBeInTheDocument();
  // Scoped to the tooltip: the creator palette has its own "Components" heading.
  expect(await screen.findByText('Components', { selector: '.tour-tooltip__title' })).toBeInTheDocument();
  // The switch unmounts the General tour without finish(), so General is NOT marked seen and
  // will auto-start again on the next visit to that tab.
});

test('the title-bar ? replays the tutorial of the tab on screen', async () => {
  localStorage.setItem('tutorialSeen:creator:general', '1');
  await act(async () => { mount(); });
  await act(async () => { fireEvent.click(document.querySelector('.creator__tour-btn')); });
  expect(await screen.findByText('Template name')).toBeInTheDocument();
});

test('the popup ? explains the field being edited', async () => {
  localStorage.setItem('tutorialSeen:creator:general', '1');
  localStorage.setItem('tutorialSeen:creator:sheet', '1');
  const { baseElement } = await act(async () => mount());
  await act(async () => { fireEvent.click(screen.getByText('Sheet')); });
  // Same lookup as TemplateBuilder.chromeWiring.test.jsx: the field's own editable wrapper.
  const labelEl = [...baseElement.querySelectorAll('.custom-sheet__field-label')].find(el => el.textContent === 'Imię');
  await act(async () => { fireEvent.click(within(labelEl.closest('.custom-sheet__editable')).getByLabelText('Edit')); });
  await act(async () => { fireEvent.click(document.querySelector('.creator__field-tour-btn')); });
  expect(await screen.findByText('A single line of text, e.g. profession or origin.')).toBeInTheDocument();
});

test('the creator dialog stops enforcing focus only while a tour runs', async () => {
  await act(async () => { mount(); });
  await screen.findByText('Template name');
  // The tooltip's own buttons count as inside the dialog even with the trap enforced: joyride
  // portals through React, so MUI sees their focus events in its React subtree. What the tour
  // turns off is the trap itself, observable on a node outside both the dialog DOM and its
  // React tree.
  const outside = document.createElement('button');
  document.body.appendChild(outside);
  try {
    act(() => outside.focus());
    expect(document.activeElement).toBe(outside);

    await act(async () => { fireEvent.click(screen.getByText('Skip')); });
    act(() => outside.focus());
    expect(document.activeElement).not.toBe(outside);
  } finally {
    outside.remove();
  }
});
