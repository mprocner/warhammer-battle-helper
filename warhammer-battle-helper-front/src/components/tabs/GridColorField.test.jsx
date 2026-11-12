import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '../../i18n';
import GridColorField, { GRID_COLOR_SAVE_DELAY_MS } from './GridColorField';

const picker = () => screen.getByLabelText('Grid colour');

describe('GridColorField', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('every move in the picker previews at once, and one save follows when it stops', () => {
    const onPreview = jest.fn();
    const onCommit = jest.fn();
    render(<GridColorField value="" onPreview={onPreview} onCommit={onCommit} />);

    // React's onChange on a colour input fires on every `input` event while the picker is open —
    // saving there would send a PUT (and a refetch for every player) per mouse move.
    fireEvent.input(picker(), { target: { value: '#111111' } });
    act(() => { jest.advanceTimersByTime(GRID_COLOR_SAVE_DELAY_MS - 1); });
    fireEvent.input(picker(), { target: { value: '#222222' } });

    expect(onPreview.mock.calls).toEqual([['#111111'], ['#222222']]);
    expect(onCommit).not.toHaveBeenCalled();

    act(() => { jest.advanceTimersByTime(GRID_COLOR_SAVE_DELAY_MS); });
    expect(onCommit.mock.calls).toEqual([['#222222']]);
  });

  test('closing the picker saves at once and cancels the pending save', () => {
    const onCommit = jest.fn();
    render(<GridColorField value="" onPreview={() => {}} onCommit={onCommit} />);

    fireEvent.input(picker(), { target: { value: '#333333' } });
    fireEvent.change(picker(), { target: { value: '#333333' } });
    expect(onCommit.mock.calls).toEqual([['#333333']]);

    act(() => { jest.advanceTimersByTime(GRID_COLOR_SAVE_DELAY_MS * 2); });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  test('a pending save is not lost when the field unmounts (tab switched mid-pick)', () => {
    const onCommit = jest.fn();
    const { unmount } = render(<GridColorField value="" onPreview={() => {}} onCommit={onCommit} />);

    fireEvent.input(picker(), { target: { value: '#444444' } });
    unmount();
    expect(onCommit.mock.calls).toEqual([['#444444']]);
  });

  test('an unset colour has no reset button', () => {
    render(<GridColorField value="" onPreview={() => {}} onCommit={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Default colour' })).toBeNull();
  });

  test('reset previews and saves an empty colour at once', () => {
    const onPreview = jest.fn();
    const onCommit = jest.fn();
    render(<GridColorField value="#ffffff" onPreview={onPreview} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Default colour' }));
    expect(onPreview).toHaveBeenCalledWith('');
    expect(onCommit).toHaveBeenCalledWith('');
  });

  test('a hidden grid disables the colour controls', () => {
    render(<GridColorField value="#ffffff" disabled onPreview={() => {}} onCommit={() => {}} />);
    expect(picker()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Default colour' })).toBeDisabled();
  });
});
