import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '../../../../i18n';
import LinkPopover from './LinkPopover';

const field = () => screen.getByRole('textbox', { name: 'Link address' });

describe('LinkPopover', () => {
  it('focuses the address field on open', () => {
    render(<LinkPopover onApply={() => {}} onRemove={() => {}} />);
    expect(field()).toHaveFocus();
  });

  it('applies a normalized address', () => {
    const onApply = jest.fn();
    render(<LinkPopover onApply={onApply} onRemove={() => {}} />);
    fireEvent.change(field(), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith('https://example.com');
  });

  it('submits on Enter', () => {
    const onApply = jest.fn();
    render(<LinkPopover onApply={onApply} onRemove={() => {}} />);
    fireEvent.change(field(), { target: { value: 'https://a.pl' } });
    fireEvent.submit(field());
    expect(onApply).toHaveBeenCalledWith('https://a.pl');
  });

  it('treats a blank address as remove', () => {
    const onApply = jest.fn();
    const onRemove = jest.fn();
    render(<LinkPopover initialHref="https://a.pl" onApply={onApply} onRemove={onRemove} />);
    fireEvent.change(field(), { target: { value: '  ' } });
    fireEvent.submit(field());
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  // Fresh mounts, not rerender: NoteToolbar mounts LinkPopover anew on every open, and
  // useState(initialHref) seeds the field only on mount.
  it('offers remove only for an existing link', () => {
    render(<LinkPopover onApply={() => {}} onRemove={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Remove link' })).toBeNull();
    cleanup();

    const onRemove = jest.fn();
    render(<LinkPopover initialHref="https://a.pl" onApply={() => {}} onRemove={onRemove} />);
    expect(field()).toHaveValue('https://a.pl');
    fireEvent.click(screen.getByRole('button', { name: 'Remove link' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
