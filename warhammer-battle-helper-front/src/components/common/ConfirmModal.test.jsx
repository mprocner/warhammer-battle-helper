import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import ConfirmModal from './ConfirmModal';

const mount = (onCancel = jest.fn(), onConfirm = jest.fn()) => {
  render(<ConfirmModal isOpen message="Sure?" onConfirm={onConfirm} onCancel={onCancel} />);
  return { onCancel, onConfirm };
};

test('focuses Cancel on open, so Escape reaches the modal and Enter is the safe choice', () => {
  mount();
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
});

test('Escape cancels without confirming', () => {
  const { onCancel, onConfirm } = mount();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Escape' });
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

test('Escape does not travel on to whatever the modal sits in', () => {
  const outer = jest.fn();
  render(
    <div onKeyDown={outer}>
      <ConfirmModal isOpen message="Sure?" onConfirm={() => {}} onCancel={() => {}} />
    </div>,
  );
  fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Escape' });
  expect(outer).not.toHaveBeenCalled();
});
