import {
  tokenRingGeometry, slotOffset,
  ACTIVE_PUSH, ACTIVE_HALF_HEIGHT, ACTIVE_HALF_WIDTH, HP_CLEAR,
} from './tokenRingGeometry';

// Default 1-cell token. Every clearance below is measured on it, because the ring only
// runs out of room on small tokens (a token wider than ~82px never collided).
const TOKEN = 50;
const REST_HALF_HEIGHT = 11; // resting chip is 22px tall

test('the ring radius and equator gap are unchanged for the resting ring', () => {
  const { ringRadius, radius, equatorX } = tokenRingGeometry(TOKEN, TOKEN, true);
  expect(ringRadius).toBe(42);
  expect(radius).toBe(42);
  expect(equatorX).toBe(94);
});

test('an active top slot clears its 45-degree neighbour on the vertical axis', () => {
  const { radius } = tokenRingGeometry(TOKEN, TOKEN, true);
  const active = slotOffset(0, radius + ACTIVE_PUSH); // pushed-out top slot
  const neighbour = slotOffset(1, radius);            // resting 45-degree slot

  // Boxes collide only when they overlap on BOTH axes, so one clear axis is enough.
  const dy = Math.abs(neighbour.y - active.y);
  expect(dy).toBeGreaterThan(ACTIVE_HALF_HEIGHT + REST_HALF_HEIGHT);
});

test('an active 45-degree slot clears the top slot on the horizontal axis', () => {
  const { radius } = tokenRingGeometry(TOKEN, TOKEN, true);
  const active = slotOffset(1, radius + ACTIVE_PUSH);
  const neighbour = slotOffset(0, radius);

  const dx = Math.abs(neighbour.x - active.x);
  expect(dx).toBeGreaterThan(ACTIVE_HALF_WIDTH + 14); // 14 = half of the widest resting chip
});

test('an active equator slot clears the kill and gear toggles', () => {
  const { radius, equatorX } = tokenRingGeometry(TOKEN, TOKEN, true);
  const chipOuterEdge = radius + ACTIVE_PUSH + ACTIVE_HALF_WIDTH;
  const toggleInnerEdge = equatorX - 11; // toggles are 22px wide

  expect(toggleInnerEdge).toBeGreaterThan(chipOuterEdge);
});

test('the HP clearance leaves the pushed-out top slot room', () => {
  // HP stacks sit HP_CLEAR beyond the ring; the pushed chip reaches ACTIVE_PUSH + its half height.
  expect(HP_CLEAR).toBeGreaterThan(ACTIVE_PUSH + ACTIVE_HALF_HEIGHT);
});
