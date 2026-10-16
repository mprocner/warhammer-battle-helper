/* eslint-disable testing-library/no-node-access */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import TemplateBuilder from './TemplateBuilder';

// Same axios mock as the other TemplateBuilder render tests: the registry imports axios (ESM).
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

// These tests are about the creator, not its tutorial: mark both tab tours seen so none auto-starts.
beforeEach(() => {
  localStorage.setItem('tutorialSeen:creator:general', '1');
  localStorage.setItem('tutorialSeen:creator:sheet', '1');
});

const base = { id: 't1', name: 'T', settings: { diceButtons: [] } };
// The palette lives on the Sheet tab; the creator opens on General.
const mount = (template) => {
  render(<TemplateBuilder template={template} token="tok" onClose={() => {}} onTemplateUpdated={() => {}} />);
  fireEvent.click(screen.getByText('Sheet'));
};
const WARNING = 'The sheet has no Character name field, so a game cannot use it yet';

// The palette is a narrow side column the GM's eye skips; the warning has to sit with the sheet.
test('without a char_name field the sheet area warns and the card stays usable', () => {
  mount({ ...base, sections: [] });
  const warning = screen.getByText(WARNING);
  expect(warning.closest('.creator__sheet-area')).not.toBeNull();
  expect(warning.closest('.creator__palette')).toBeNull();
  expect(screen.getByText('Character name').closest('button')).toHaveAttribute('aria-disabled', 'false');
});

test('the warning also shows above a non-empty sheet', () => {
  mount({ ...base, sections: [{ id: 's', title: 'S', fields: [{ key: 't', type: 'text_short', label: 'Origin' }] }] });
  expect(screen.getByText(WARNING).closest('.creator__sheet-area')).not.toBeNull();
});

test('with a char_name field the card is disabled and the warning is gone', () => {
  mount({ ...base, sections: [{ id: 's', title: 'S', fields: [{ key: 'nm', type: 'char_name', label: 'Name' }] }] });
  expect(screen.queryByText(WARNING)).toBeNull();
  expect(screen.getByText('Character name').closest('button')).toHaveAttribute('aria-disabled', 'true');
});
