import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../../../i18n';
import FontSizeCombo from './FontSizeCombo';

const input = () => screen.getByRole('textbox', { name: 'Font size' });
const typeAndEnter = (value) => {
  fireEvent.change(input(), { target: { value } });
  fireEvent.keyDown(input(), { key: 'Enter' });
};

describe('FontSizeCombo', () => {
  it('shows the current size, or the base size as placeholder', () => {
    const { rerender } = render(<FontSizeCombo value={18} onApply={() => {}} />);
    expect(input()).toHaveValue('18');

    rerender(<FontSizeCombo value={null} onApply={() => {}} />);
    expect(input()).toHaveValue('');
    expect(input()).toHaveAttribute('placeholder', '13');
  });

  it('applies a typed size on Enter', () => {
    const onApply = jest.fn();
    render(<FontSizeCombo value={null} onApply={onApply} />);
    typeAndEnter('18');
    expect(onApply).toHaveBeenCalledWith(18);
  });

  it('clamps an out-of-range size and shows the clamped value', () => {
    const onApply = jest.fn();
    render(<FontSizeCombo value={null} onApply={onApply} />);
    typeAndEnter('100');
    expect(onApply).toHaveBeenCalledWith(72);
    expect(input()).toHaveValue('72');
  });

  it('ignores a non-number and restores the current size', () => {
    const onApply = jest.fn();
    render(<FontSizeCombo value={16} onApply={onApply} />);
    typeAndEnter('abc');
    expect(onApply).not.toHaveBeenCalled();
    expect(input()).toHaveValue('16');
  });

  it('reverts an unsubmitted draft on blur', () => {
    const onApply = jest.fn();
    render(<FontSizeCombo value={16} onApply={onApply} />);
    fireEvent.change(input(), { target: { value: '30' } });
    fireEvent.blur(input());
    expect(onApply).not.toHaveBeenCalled();
    expect(input()).toHaveValue('16');
  });

  it('applies a preset and closes the list', () => {
    const onApply = jest.fn();
    render(<FontSizeCombo value={null} onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: 'Font size presets' }));
    expect(screen.getAllByRole('option')).toHaveLength(6);

    fireEvent.click(screen.getByRole('option', { name: '24' }));

    expect(onApply).toHaveBeenCalledWith(24);
    expect(screen.queryByRole('option')).toBeNull();
  });
});
