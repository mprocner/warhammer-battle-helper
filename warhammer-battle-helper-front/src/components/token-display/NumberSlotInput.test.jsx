import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import NumberSlotInput from './NumberSlotInput';

test('the width grows with the digit count', () => {
  const { container, rerender } = render(<NumberSlotInput value={5} onCommit={() => {}} />);
  const narrow = container.querySelector('input').style.width;

  rerender(<NumberSlotInput value={999} onCommit={() => {}} />);
  const wide = container.querySelector('input').style.width;

  expect(parseFloat(narrow)).toBeLessThan(parseFloat(wide));
});

test('the width is capped at the four-character value, so the resting chip stays 28px', () => {
  const { container, rerender } = render(<NumberSlotInput value={-999} onCommit={() => {}} />);
  const fourChars = container.querySelector('input').style.width;

  rerender(<NumberSlotInput value={-99999} onCommit={() => {}} />);
  const sixChars = container.querySelector('input').style.width;

  expect(fourChars).toBe('22px');
  expect(sixChars).toBe('22px');
});

test('reports focus and blur to the caller', () => {
  const seen = [];
  const { container } = render(
    <NumberSlotInput value={5} onCommit={() => {}} onFocusChange={(f) => seen.push(f)} />
  );
  const input = container.querySelector('input');

  fireEvent.focus(input);
  fireEvent.blur(input);

  expect(seen).toEqual([true, false]);
});

test('a live value update does not resize the field while it is being typed in', () => {
  const { container, rerender } = render(<NumberSlotInput value={5} onCommit={() => {}} />);
  const input = container.querySelector('input');

  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: '7' } });
  rerender(<NumberSlotInput value={12345} onCommit={() => {}} />); // WebSocket update mid-typing

  expect(input.value).toBe('7');
  expect(input.style.width).toBe('9px');
});
