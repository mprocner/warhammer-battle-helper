import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '../../i18n';
import TemplateBuilder from './TemplateBuilder';

// TemplateBuilder pulls in api/axios AND, through the system registry, axios itself —
// the ESM import jest cannot parse. Mocking the instance is enough to mount the creator.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

// What the chrome components do with a callback is already covered by FieldChrome.test.jsx.
// What is NOT covered anywhere is what TemplateBuilder BINDS to those callbacks — the direction
// of an arrow, the path it targets, and what happens to the open properties popup afterwards.
// Four separate mutations of exactly that wiring once passed the whole suite untouched.
const template = {
  id: 't1',
  name: 'T',
  settings: { diceButtons: [] },
  sections: [
    { id: 'sec_a', title: 'Cechy', columns: 1, fields: [
      { key: 'f_a', type: 'text_short', label: 'Alpha' },
      { key: 'f_b', type: 'text_short', label: 'Beta' },
      { key: 'f_c', type: 'text_short', label: 'Gamma' },
    ] },
  ],
};

// TemplateBuilder renders inside a MUI Dialog, which portals its content to document.body —
// render()'s own `container` (the empty root div) never receives it, so every query below goes
// through `baseElement` (render()'s default query root, which IS document.body) instead.
const mount = () => render(
  <TemplateBuilder template={template} token="tok" onClose={() => {}} onTemplateUpdated={() => {}} />,
);

// The creator opens on the General tab; the sheet lives behind the second one.
const openSheetTab = () => fireEvent.click(screen.getByText('Sheet'));

// Field labels in DOM order — the observable consequence of a reorder.
const fieldOrder = (root) =>
  [...root.querySelectorAll('.custom-sheet__field-label')].map(el => el.textContent);

// The chrome of the node whose sheet content carries `label`. Field nodes nest their own
// `.custom-sheet__editable` wrapper inside the section's, so `closest` from the label always
// resolves to the innermost (field-level) one.
const chromeFor = (root, label) => {
  const labelEl = [...root.querySelectorAll('.custom-sheet__field-label')]
    .find(el => el.textContent === label);
  return labelEl.closest('.custom-sheet__editable');
};

// The popup's own heading, from ModalHeader's `.modal-header__title` — distinct from
// PropertyPanel's internal "Field properties" caption, which renders the same t() string
// inside the popup body, so a plain screen.getByText('Field properties') matches both.
const popupTitle = () => document.querySelector('.modal-header__title');

// FEATURE-214: a weapons_table field's preset editor used to live behind a button that opened
// a separate MUI Dialog nested inside the (already floating) properties popup. It is now
// inlined into the Content group alongside the weapon columns editor.
const weaponsTemplate = {
  id: 't2',
  name: 'T2',
  settings: { diceButtons: [] },
  sections: [
    { id: 'sec_gear', title: 'Ekwipunek', columns: 1, fields: [
      { key: 'f_wpn', type: 'weapons_table', label: 'Bronie',
        columns: [{ key: 'name', label: 'Nazwa', type: 'text' }], rows: [] },
    ] },
  ],
};

const mountWeapons = () => render(
  <TemplateBuilder template={weaponsTemplate} token="tok" onClose={() => {}} onTemplateUpdated={() => {}} />,
);

// weapons_table renders a `.custom-sheet__section-title`, not the `.custom-sheet__field-label`
// chromeFor looks for, so its chrome is located the same way but keyed off that title instead.
const weaponsChromeFor = (root, label) => {
  const titleEl = [...root.querySelectorAll('.custom-sheet__section-title')]
    .find(el => el.textContent === label);
  return titleEl.closest('.custom-sheet__editable');
};

describe('TemplateBuilder chrome wiring', () => {
  test('the up arrow moves a field towards the start, not the end', () => {
    const { baseElement } = mount();
    openSheetTab();
    expect(fieldOrder(baseElement)).toEqual(['Alpha', 'Beta', 'Gamma']);

    fireEvent.click(within(chromeFor(baseElement, 'Beta')).getByLabelText('Move up'));
    expect(fieldOrder(baseElement)).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  test('the down arrow moves a field towards the end', () => {
    const { baseElement } = mount();
    openSheetTab();
    fireEvent.click(within(chromeFor(baseElement, 'Beta')).getByLabelText('Move down'));
    expect(fieldOrder(baseElement)).toEqual(['Alpha', 'Gamma', 'Beta']);
  });

  test('the arrows are disabled at the ends of the list', () => {
    const { baseElement } = mount();
    openSheetTab();
    expect(within(chromeFor(baseElement, 'Alpha')).getByLabelText('Move up')).toBeDisabled();
    expect(within(chromeFor(baseElement, 'Gamma')).getByLabelText('Move down')).toBeDisabled();
  });

  test('duplicating a field adds a copy and does not open the properties popup', () => {
    const { baseElement } = mount();
    openSheetTab();
    fireEvent.click(within(chromeFor(baseElement, 'Alpha')).getByLabelText('Duplicate field'));
    expect(fieldOrder(baseElement)).toHaveLength(4);
    // A click — or a duplicate — only selects. Only the edit button opens properties.
    expect(screen.queryByText('Field properties')).toBeNull();
  });

  test('the edit button opens the properties popup for the node it belongs to', () => {
    const { baseElement } = mount();
    openSheetTab();
    fireEvent.click(within(chromeFor(baseElement, 'Gamma')).getByLabelText('Edit'));
    expect(popupTitle()).toHaveTextContent('Field properties');
    expect(screen.getByDisplayValue('Gamma')).toBeInTheDocument();
  });

  test('duplicating an earlier field does not switch the open popup to a different node', () => {
    // The Critical bug: an insert shifts every path after it, but editingPath was left behind,
    // so the popup silently began editing whichever node slid into the old index.
    const { baseElement } = mount();
    openSheetTab();
    fireEvent.click(within(chromeFor(baseElement, 'Gamma')).getByLabelText('Edit'));
    expect(screen.getByDisplayValue('Gamma')).toBeInTheDocument();

    fireEvent.click(within(chromeFor(baseElement, 'Alpha')).getByLabelText('Duplicate field'));
    expect(screen.getByDisplayValue('Gamma')).toBeInTheDocument();
  });

  test('moving the edited field keeps the popup on that field', () => {
    // Guards the fix the previous wave made and left untested.
    const { baseElement } = mount();
    openSheetTab();
    fireEvent.click(within(chromeFor(baseElement, 'Beta')).getByLabelText('Edit'));
    fireEvent.click(within(chromeFor(baseElement, 'Beta')).getByLabelText('Move up'));
    expect(screen.getByDisplayValue('Beta')).toBeInTheDocument();
  });

  test('the pill delete button removes that field and leaves the others in order', () => {
    const { baseElement } = mount();
    openSheetTab();
    fireEvent.click(within(chromeFor(baseElement, 'Beta')).getByLabelText('Delete field'));
    expect(fieldOrder(baseElement)).toEqual(['Alpha', 'Gamma']);
  });

  test('deleting an earlier field keeps the popup on the field it was editing', () => {
    // The same class of bug the duplicate/move cases above guard: a removal shifts every later
    // sibling's path, so a stale editingPath would silently start editing whichever field slid
    // into the freed index.
    const { baseElement } = mount();
    openSheetTab();
    fireEvent.click(within(chromeFor(baseElement, 'Gamma')).getByLabelText('Edit'));
    expect(screen.getByDisplayValue('Gamma')).toBeInTheDocument();

    fireEvent.click(within(chromeFor(baseElement, 'Alpha')).getByLabelText('Delete field'));
    expect(screen.getByDisplayValue('Gamma')).toBeInTheDocument();
  });

  test('deleting the field the popup is editing closes the popup', () => {
    const { baseElement } = mount();
    openSheetTab();
    fireEvent.click(within(chromeFor(baseElement, 'Beta')).getByLabelText('Edit'));
    expect(screen.getByDisplayValue('Beta')).toBeInTheDocument();

    fireEvent.click(within(chromeFor(baseElement, 'Beta')).getByLabelText('Delete field'));
    expect(screen.queryByText('Field properties')).toBeNull();
  });

  test('a weapons_table field with a column shows the preset editor inline, with no separate dialog', () => {
    const { baseElement } = mountWeapons();
    openSheetTab();
    fireEvent.click(within(weaponsChromeFor(baseElement, 'Bronie')).getByLabelText('Edit'));
    expect(popupTitle()).toHaveTextContent('Field properties');

    // The preset list and its add button render inline in the popup body...
    expect(screen.getByRole('button', { name: 'Add preset weapon' })).toBeInTheDocument();

    // ...and TemplateBuilder's own fullScreen Dialog is the only MUI dialog on the page — no
    // second one opened for the presets.
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});
