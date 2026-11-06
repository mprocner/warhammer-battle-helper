/* eslint-disable testing-library/no-node-access */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import TemplateSheetPreview from './TemplateSheetPreview';

const template = {
  id: 't1',
  name: 'Moja Kampania',
  settings: { sheetWidth: 700 },
  sections: [{ id: 'sec1', title: 'Atrybuty', columns: 2, fields: [{ key: 'fld_str', type: 'number', label: 'Siła' }] }],
};

test('renders nothing without a template', () => {
  render(<TemplateSheetPreview template={null} onClose={() => {}} />);
  expect(document.querySelector('.character-sheet-popup')).toBeNull();
});

test('shows the sheet in the real custom-sheet wrapper, titled with the template name', () => {
  render(<TemplateSheetPreview template={template} onClose={() => {}} />);
  const popup = document.querySelector('.character-sheet-popup');
  expect(popup.querySelector('.modal-header__title')).toHaveTextContent('Moja Kampania');
  const sheet = popup.querySelector('.custom-sheet');
  expect(sheet).toHaveStyle({ maxWidth: '700px' });
  expect(screen.getByText('Atrybuty')).toBeInTheDocument();
  expect(screen.getByText('Siła')).toBeInTheDocument();
});

test('the header X closes it', () => {
  const onClose = jest.fn();
  render(<TemplateSheetPreview template={template} onClose={onClose} />);
  fireEvent.click(document.querySelector('.modal-header__btn--close'));
  expect(onClose).toHaveBeenCalled();
});

test('previewing another template remounts the popup so it takes that template\'s width', () => {
  const { rerender } = render(<TemplateSheetPreview template={template} onClose={() => {}} />);
  expect(document.querySelector('.character-sheet-popup')).toHaveStyle({ width: '700px' });
  const other = { ...template, id: 'b', settings: { sheetWidth: 1000 } };
  rerender(<TemplateSheetPreview template={other} onClose={() => {}} />);
  expect(document.querySelector('.character-sheet-popup')).toHaveStyle({ width: '1000px' });
});
