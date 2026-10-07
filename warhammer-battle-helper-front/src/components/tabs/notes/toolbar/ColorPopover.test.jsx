import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../../../i18n';
import ColorPopover from './ColorPopover';
import { TEXT_COLORS, HIGHLIGHT_COLORS } from '../noteFormatting';

const renderPopover = (props = {}) => {
  const handlers = { onSelect: jest.fn(), onCustom: jest.fn(), ...props };
  render(<ColorPopover colors={TEXT_COLORS} customLabel="Custom color" {...handlers} />);
  return handlers;
};

describe('ColorPopover', () => {
  it('renders one labelled swatch per palette entry', () => {
    renderPopover();
    expect(document.querySelectorAll('.note-toolbar__swatch')).toHaveLength(TEXT_COLORS.length);
    expect(screen.getByRole('button', { name: 'Red' })).toBeInTheDocument();
  });

  it('reports a swatch click with its hex', () => {
    const { onSelect } = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Red' }));
    expect(onSelect).toHaveBeenCalledWith('#a8322d');
  });

  it('marks the active colour, case-insensitively', () => {
    renderPopover({ activeHex: '#A8322D' });
    expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the native picker value through onCustom', () => {
    const { onCustom, onSelect } = renderPopover();
    fireEvent.change(screen.getByLabelText('Custom color'), { target: { value: '#123456' } });
    expect(onCustom).toHaveBeenCalledWith('#123456');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('seeds the picker with the first palette colour when nothing is active', () => {
    render(<ColorPopover colors={HIGHLIGHT_COLORS} customLabel="Custom color" onSelect={() => {}} onCustom={() => {}} />);
    expect(screen.getByLabelText('Custom color')).toHaveValue('#fff3a3');
  });

  it('renders the clear button only with onClear', () => {
    renderPopover({ clearLabel: 'No highlight' });
    expect(screen.queryByRole('button', { name: 'No highlight' })).toBeNull();
  });

  it('calls onClear', () => {
    const onClear = jest.fn();
    renderPopover({ onClear, clearLabel: 'No highlight' });
    fireEvent.click(screen.getByRole('button', { name: 'No highlight' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
