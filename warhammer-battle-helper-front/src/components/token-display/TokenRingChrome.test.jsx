import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import TokenRingChrome from './TokenRingChrome';
import { ACTIVE_PUSH, slotOffset } from '../../utils/tokenRingGeometry';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));

const editableSlot = (over = {}) => ({
  id: 'slot-1', variant: 'chip', value: 5, cap: 'AMMO', showAtRest: true,
  editable: true, numberValue: 5, onSetNumber: () => {}, onStep: () => {}, ...over,
});

const RADIUS = 42;

const renderRing = (slots) => render(
  <TokenRingChrome selected canEdit radius={RADIUS} equatorX={94} slots={slots}
    killStrikeClassName="token-kill-strike" killToggleClassName="token-kill-toggle"
    onToggleKilled={() => {}} />
);

// Reads the `Npx` literal out of a `translate(calc(-50% + Npx), calc(-50% + Npx))` inline
// transform, in order: [x, y].
const readTranslate = (el) => [...el.style.transform.matchAll(/calc\(-50% \+ (-?[\d.eE+-]+)px\)/g)]
  .map((m) => parseFloat(m[1]));

test('an editable chip shows no stepper until it becomes active', () => {
  const { container } = renderRing([editableSlot()]);
  expect(container.querySelector('.token-step')).toBeNull();
});

test('hovering the hit-zone reveals the stepper and releasing hides it again', () => {
  const { container } = renderRing([editableSlot()]);
  const zone = container.querySelector('.token-slot-zone');
  expect(zone.className).toContain('is-interactive');

  fireEvent.mouseEnter(zone);
  expect(container.querySelectorAll('.token-step--sq button')).toHaveLength(2);

  fireEvent.mouseLeave(zone);
  expect(container.querySelector('.token-step')).toBeNull();
});

test('hovering a second slot transfers active state away from the first', () => {
  // NOTE: reduced from the original "only one slot is active at a time" test. That test fired
  // mouseLeave(first) then mouseEnter(second) as two independent events (not how a browser
  // interleaves a pointer move between siblings) and asserted `toHaveLength(1)`, which is
  // trivially true given hoverSlotId is a single scalar — it can never hold two ids at once by
  // construction. What's actually worth asserting is that the two concrete elements end up in
  // the right states after the transition.
  const { container } = renderRing([editableSlot(), editableSlot({ id: 'slot-2' })]);
  const [first, second] = container.querySelectorAll('.token-slot-zone');

  fireEvent.mouseEnter(first);
  fireEvent.mouseLeave(first);
  fireEvent.mouseEnter(second);

  expect(first.className).not.toContain('is-active');
  expect(second.className).toContain('is-active');
});

test('at rest, before any hover, neither the zone nor the chip carries a push offset', () => {
  const { container } = renderRing([editableSlot()]);
  const zone = container.querySelector('.token-slot-zone');
  const chip = container.querySelector('.token-slot--num');

  const off = slotOffset(0, RADIUS);
  const dir = slotOffset(0, 1);
  const [, zoneY] = readTranslate(zone);
  const [, chipY] = readTranslate(chip);

  expect((zoneY - off.y) * dir.y).toBeCloseTo(0);
  expect(chipY * dir.y).toBeCloseTo(0);
});

test('the active push splits evenly between the zone and the chip, ACTIVE_PUSH/2 each', () => {
  // Slot index 0 is the top slot: its ring-angle direction is (0, -1), so only the y offset
  // moves and the assertion does not need to combine x/y into a magnitude.
  const { container } = renderRing([editableSlot()]);
  const zone = container.querySelector('.token-slot-zone');

  fireEvent.mouseEnter(zone);
  const chip = container.querySelector('.token-slot--num');

  const off = slotOffset(0, RADIUS);
  const dir = slotOffset(0, 1);
  const [, zoneY] = readTranslate(zone);
  const [, chipY] = readTranslate(chip);

  // Zone's own push contribution is its offset minus the slot's resting position; the chip's
  // transform carries only its push contribution (the zone already absorbed the resting offset).
  // Multiplying by dir.y (-1) turns "outward" into a positive magnitude along the ring angle.
  const zonePush = (zoneY - off.y) * dir.y;
  const chipPush = chipY * dir.y;

  // Pinning each half separately (not just their sum) catches the variant where the whole
  // 16px push lands on one element and the other contributes 0 — which would undermine the
  // containment argument that the resting zone box stays inside the active zone box.
  expect(zonePush).toBeCloseTo(ACTIVE_PUSH / 2);
  expect(chipPush).toBeCloseTo(ACTIVE_PUSH / 2);
});

test('a select-type chip (no editable, but with slot.onClick) still cycles when clicked', () => {
  const onClick = jest.fn();
  const { container } = renderRing([
    { id: 'stance', variant: 'chip', value: 'Full', cap: 'STANCE', showAtRest: true, onClick },
  ]);

  fireEvent.click(container.querySelector('.token-slot--num'));

  expect(onClick).toHaveBeenCalledTimes(1);
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
    <TokenRingChrome selected={false} canEdit radius={RADIUS} equatorX={94} slots={[editableSlot()]}
      killStrikeClassName="token-kill-strike" killToggleClassName="token-kill-toggle"
      onToggleKilled={() => {}} />
  );

  expect(container.querySelector('.token-slot-zone.is-active')).toBeNull();
});

test('a read-only chip gets no hit-zone handlers and never opens a stepper', () => {
  const { container } = renderRing([{ id: 'ro', variant: 'chip', value: 3, cap: 'WS', showAtRest: true }]);
  const zone = container.querySelector('.token-slot-zone');
  expect(zone.className).not.toContain('is-interactive');
  fireEvent.mouseEnter(zone);
  expect(container.querySelector('.token-step')).toBeNull();
});
