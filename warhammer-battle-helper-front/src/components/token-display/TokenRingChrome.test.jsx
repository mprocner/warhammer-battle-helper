import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import TokenRingChrome from './TokenRingChrome';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));

const editableSlot = (over = {}) => ({
  id: 'slot-1', variant: 'chip', value: 5, cap: 'AMMO', showAtRest: true,
  editable: true, numberValue: 5, onSetNumber: () => {}, onStep: () => {}, ...over,
});

const renderRing = (slots, props = {}) => render(
  <TokenRingChrome selected canEdit radius={42} equatorX={94} slots={slots}
    killStrikeClassName="token-kill-strike" killToggleClassName="token-kill-toggle"
    onToggleKilled={() => {}} {...props} />
);

test('an editable chip shows no stepper until it becomes active', () => {
  const { container } = renderRing([editableSlot()]);
  expect(container.querySelector('.token-step')).toBeNull();
});

test('hovering the hit-zone reveals the stepper and releasing hides it again', () => {
  const { container } = renderRing([editableSlot()]);
  const zone = container.querySelector('.token-slot-zone');

  fireEvent.mouseEnter(zone);
  expect(container.querySelectorAll('.token-step--sq button')).toHaveLength(2);

  fireEvent.mouseLeave(zone);
  expect(container.querySelector('.token-step')).toBeNull();
});

test('only one slot is active at a time', () => {
  const { container } = renderRing([editableSlot(), editableSlot({ id: 'slot-2' })]);
  const [first, second] = container.querySelectorAll('.token-slot-zone');

  fireEvent.mouseEnter(first);
  fireEvent.mouseLeave(first);
  fireEvent.mouseEnter(second);

  expect(container.querySelectorAll('.token-slot-zone.is-active')).toHaveLength(1);
  expect(second.className).toContain('is-active');
});

test('a focused field keeps the slot open after the pointer leaves', () => {
  const { container } = renderRing([editableSlot()]);
  const zone = container.querySelector('.token-slot-zone');

  fireEvent.mouseEnter(zone);
  fireEvent.focus(container.querySelector('.token-slot__input'));
  fireEvent.mouseLeave(zone);

  expect(container.querySelector('.token-step--sq')).not.toBeNull();
});

test('deselecting the token clears the active slot', () => {
  const { container, rerender } = renderRing([editableSlot()]);
  fireEvent.mouseEnter(container.querySelector('.token-slot-zone'));

  rerender(
    <TokenRingChrome selected={false} canEdit radius={42} equatorX={94} slots={[editableSlot()]}
      killStrikeClassName="token-kill-strike" killToggleClassName="token-kill-toggle"
      onToggleKilled={() => {}} />
  );

  expect(container.querySelector('.token-slot-zone.is-active')).toBeNull();
});

test('a read-only chip gets no hit-zone handlers and never opens a stepper', () => {
  const { container } = renderRing([{ id: 'ro', variant: 'chip', value: 3, cap: 'WS', showAtRest: true }]);
  fireEvent.mouseEnter(container.querySelector('.token-slot-zone'));
  expect(container.querySelector('.token-step')).toBeNull();
});
