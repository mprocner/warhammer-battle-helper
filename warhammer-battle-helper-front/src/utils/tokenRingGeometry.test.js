import {
  tokenRingGeometry, slotOffset, rotatedHalfHeight,
  ACTIVE_PUSH, ACTIVE_HALF_HEIGHT, ACTIVE_HALF_WIDTH, HP_CLEAR, EQUATOR_STACK_STEP,
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

test('the equator column keeps its buttons apart at every stack position', () => {
  // The column: skull at y=0, eye one step down, rotate two steps down. All three are 22px
  // circles, so two neighbouring centres must sit more than 22px apart or the buttons touch.
  const BUTTON = 22;
  expect(EQUATOR_STACK_STEP).toBeGreaterThan(BUTTON);
});

test('the rotate handle clears the nearest ring slot on the smallest token', () => {
  // BUG-194: the old position (a stem above the token) sat exactly on slot 0. The new one is
  // the right equator, two steps down, so the nearest ring slot is now the 4:30 one (index 3)
  // and that is what has to be cleared. Boxes collide only when they overlap on BOTH axes, so
  // one clean axis is enough — here, X.
  const { radius, equatorX } = tokenRingGeometry(TOKEN, TOKEN, true);
  const nearestSlot = slotOffset(3, radius);
  const handleX = equatorX;

  const HANDLE_HALF = 11; // handle is a 22px circle
  const SLOT_HALF = 11;   // icon slot when selected is 22px
  expect(handleX - nearestSlot.x).toBeGreaterThan(HANDLE_HALF + SLOT_HALF);
});

// The upright overlay box keeps the image's unrotated size, so anything anchored to "the token's
// bottom/top edge" must use the rotated image's bounding box instead (PLAYRPG-354).
describe('rotatedHalfHeight', () => {
  test('an unrotated image is half its own height', () => {
    expect(rotatedHalfHeight(100, 50, 0)).toBeCloseTo(25);
  });
  test('a quarter turn swaps width into the vertical extent', () => {
    expect(rotatedHalfHeight(100, 50, 90)).toBeCloseTo(50);
    expect(rotatedHalfHeight(100, 50, -90)).toBeCloseTo(50);
  });
  test('a half turn is the same as no turn', () => {
    expect(rotatedHalfHeight(100, 50, 180)).toBeCloseTo(25);
  });
  test('a square at 45 degrees reaches half its diagonal', () => {
    expect(rotatedHalfHeight(50, 50, 45)).toBeCloseTo(25 * Math.SQRT2);
  });
});
