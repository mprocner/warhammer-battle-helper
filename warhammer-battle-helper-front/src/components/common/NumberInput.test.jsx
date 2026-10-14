import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import NumberInput from './NumberInput';

// Mirrors the sheets: the parent coerces with `Number(v) || 0` on every change.
function Harness({ initial = 5, onCommit }) {
  const [value, setValue] = useState(initial);
  return (
    <NumberInput
      aria-label="attr"
      value={value}
      onChange={e => { const n = Number(e.target.value) || 0; setValue(n); onCommit?.(n); }}
    />
  );
}

describe('NumberInput', () => {
  it('keeps the field empty after clearing instead of re-filling it with 0', () => {
    const onCommit = jest.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByLabelText('attr');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '7' } });
    expect(input.value).toBe('7');
    expect(onCommit).toHaveBeenLastCalledWith(7);
  });

  it('forwards parseable keystrokes live', () => {
    const onCommit = jest.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText('attr'), { target: { value: '12' } });
    expect(onCommit).toHaveBeenCalledWith(12);
  });

  it('lets the parent fallback decide an empty field on blur', () => {
    const onCommit = jest.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByLabelText('attr');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(0);
    expect(input.value).toBe('0');
  });

  it('does not emit on blur when nothing was left unparseable', () => {
    const onCommit = jest.fn();
    const onBlur = jest.fn();
    render(<NumberInput aria-label="attr" value={5} onChange={onCommit} onBlur={onBlur} />);
    fireEvent.blur(screen.getByLabelText('attr'));
    expect(onCommit).not.toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalled();
  });
});

// Shape of the custom sheet: one state object, handlers read it from the closure.
function Sheet({ onSave }) {
  const [edited, setEdited] = useState({ a: 5, b: 3 });
  const update = (key, v) => { const ne = { ...edited, [key]: Number(v) || 0 }; setEdited(ne); onSave(ne); };
  return (
    <>
      <NumberInput aria-label="a" value={edited.a} onChange={e => update('a', e.target.value)} />
      <NumberInput aria-label="b" value={edited.b} onChange={e => update('b', e.target.value)} />
    </>
  );
}

it('clearing A then editing B commits both', () => {
  const onSave = jest.fn();
  render(<Sheet onSave={onSave} />);
  const a = screen.getByLabelText('a');
  const b = screen.getByLabelText('b');
  fireEvent.focus(a);
  fireEvent.change(a, { target: { value: '' } });
  fireEvent.blur(a);
  fireEvent.focus(b);
  fireEvent.change(b, { target: { value: '9' } });
  expect(a.value).toBe('0');
  expect(b.value).toBe('9');
  expect(onSave).toHaveBeenLastCalledWith({ a: 0, b: 9 });
});
