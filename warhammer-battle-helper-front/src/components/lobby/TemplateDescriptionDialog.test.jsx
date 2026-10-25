/* eslint-disable testing-library/no-node-access */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import TemplateDescriptionDialog from './TemplateDescriptionDialog';

test('shows name, language and formatted description', () => {
  render(<TemplateDescriptionDialog onClose={() => {}}
    template={{ name: 'Krypta', language: 'pl', description: '<p>Ala <strong>ma</strong></p>' }} />);
  expect(screen.getByText('Krypta')).toBeInTheDocument();
  expect(screen.getByText('Polish')).toBeInTheDocument();
  expect(document.querySelector('.tiptap strong').textContent).toBe('ma');
});

test('no language chip for an unspecified template; close calls onClose', () => {
  const onClose = jest.fn();
  render(<TemplateDescriptionDialog onClose={onClose} template={{ name: 'K', language: '', description: '<p>x</p>' }} />);
  expect(screen.queryByText('Unspecified')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalled();
});

test('renders nothing without a template', () => {
  render(<TemplateDescriptionDialog onClose={() => {}} template={null} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
