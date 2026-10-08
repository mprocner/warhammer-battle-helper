/* eslint-disable testing-library/no-node-access -- the sheet labels, chrome wrappers and ConfirmModal are located by their BEM classes, as in TemplateBuilder.chromeWiring.test.jsx */
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

const template = {
  id: 't1',
  name: 'T',
  settings: { diceButtons: [] },
  sections: [
    { id: 'sec_a', title: 'Cechy', columns: 1, fields: [
      { key: 'f_a', type: 'text_short', label: 'Alpha' },
      { key: 'f_b', type: 'text_short', label: 'Beta' },
    ] },
  ],
};

const mount = () => render(
  <TemplateBuilder template={template} token="tok" onClose={() => {}} onTemplateUpdated={() => {}} />,
);
const openSheetTab = () => fireEvent.click(screen.getByText('Sheet'));

// The creator renders inside a MUI Dialog portalled to body, and ConfirmModal portals there too.
const fieldOrder = () =>
  [...document.body.querySelectorAll('.custom-sheet__field-label')].map(el => el.textContent);
const chromeFor = (label) =>
  [...document.body.querySelectorAll('.custom-sheet__field-label')]
    .find(el => el.textContent === label)
    .closest('.custom-sheet__editable');
const modal = () => document.body.querySelector('.confirm-modal');
const confirmButton = () => within(modal()).getByRole('button', { name: 'Delete' });
const cancelButton = () => within(modal()).getByRole('button', { name: 'Cancel' });

describe('deleting a node asks for confirmation first', () => {
  test('the field toolbar delete removes nothing until the GM confirms', () => {
    mount();
    openSheetTab();
    fireEvent.click(within(chromeFor('Beta')).getByLabelText('Delete field'));

    expect(fieldOrder()).toEqual(['Alpha', 'Beta']);
    expect(modal()).toHaveTextContent('Beta');

    fireEvent.click(confirmButton());
    expect(fieldOrder()).toEqual(['Alpha']);
    expect(modal()).toBeNull();
  });

  test('cancelling keeps the field', () => {
    mount();
    openSheetTab();
    fireEvent.click(within(chromeFor('Beta')).getByLabelText('Delete field'));
    fireEvent.click(cancelButton());

    expect(fieldOrder()).toEqual(['Alpha', 'Beta']);
    expect(modal()).toBeNull();
  });

  test('the delete button in the field properties popup asks too', () => {
    mount();
    openSheetTab();
    fireEvent.click(within(chromeFor('Alpha')).getByLabelText('Edit'));
    fireEvent.click(document.body.querySelector('.creator__delete-field-btn'));

    expect(fieldOrder()).toEqual(['Alpha', 'Beta']);
    expect(modal()).toHaveTextContent('Alpha');

    fireEvent.click(confirmButton());
    expect(fieldOrder()).toEqual(['Beta']);
  });

  test('the section toolbar delete names the section and removes it only after confirming', () => {
    mount();
    openSheetTab();
    fireEvent.click(screen.getAllByLabelText('Delete section')[0]);

    expect(fieldOrder()).toEqual(['Alpha', 'Beta']);
    expect(modal()).toHaveTextContent('Cechy');

    fireEvent.click(confirmButton());
    expect(fieldOrder()).toEqual([]);
  });

  test('a field without a label still gets a readable question', () => {
    render(
      <TemplateBuilder
        template={{ ...template, sections: [{ ...template.sections[0], fields: [{ key: 'f_x', type: 'number', label: '' }] }] }}
        token="tok" onClose={() => {}} onTemplateUpdated={() => {}}
      />,
    );
    openSheetTab();
    fireEvent.click(screen.getByLabelText('Delete field'));
    expect(modal().textContent).not.toContain('""');
    expect(modal().textContent).not.toContain('„”');
  });
});
