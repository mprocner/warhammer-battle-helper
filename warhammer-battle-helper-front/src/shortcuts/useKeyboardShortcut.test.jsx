import { renderHook, fireEvent } from '@testing-library/react';
import useKeyboardShortcut from './useKeyboardShortcut';

const press = (target, init) => fireEvent.keyDown(target, { bubbles: true, cancelable: true, ...init });

describe('useKeyboardShortcut', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  test('runs the handler for its shortcut and claims the key', () => {
    const handler = jest.fn();
    renderHook(() => useKeyboardShortcut('drawing.deleteSelected', handler));
    const prevented = !press(document.body, { key: 'Delete' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(prevented).toBe(true);
  });

  test('leaves other keys alone', () => {
    const handler = jest.fn();
    renderHook(() => useKeyboardShortcut('drawing.deleteSelected', handler));
    expect(press(document.body, { key: 'Enter' })).toBe(true); // not prevented
    expect(handler).not.toHaveBeenCalled();
  });

  test('typing in a field never triggers it (Backspace in the chat)', () => {
    const handler = jest.fn();
    renderHook(() => useKeyboardShortcut('drawing.deleteSelected', handler));
    const input = document.body.appendChild(document.createElement('input'));
    press(input, { key: 'Backspace' });
    expect(handler).not.toHaveBeenCalled();
  });

  test('an open dialog owns the keyboard', () => {
    const handler = jest.fn();
    renderHook(() => useKeyboardShortcut('general.openShortcuts', handler));
    document.body.appendChild(document.createElement('div')).className = 'MuiDialog-root';
    press(document.body, { key: '?' });
    expect(handler).not.toHaveBeenCalled();
  });

  test('a disabled shortcut does not listen', () => {
    const handler = jest.fn();
    renderHook(() => useKeyboardShortcut('drawing.deleteSelected', handler, { enabled: false }));
    press(document.body, { key: 'Delete' });
    expect(handler).not.toHaveBeenCalled();
  });

  test('the latest handler runs without re-subscribing', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(({ h }) => useKeyboardShortcut('drawing.deleteSelected', h), { initialProps: { h: first } });
    rerender({ h: second });
    press(document.body, { key: 'Delete' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
