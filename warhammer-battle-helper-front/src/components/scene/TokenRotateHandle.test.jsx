import React from 'react';
import { render } from '@testing-library/react';
import TokenRotateHandle from './TokenRotateHandle';
import { EQUATOR_STACK_STEP } from '../../utils/tokenRingGeometry';

// A mock instead of `import '../../i18n'`: this component uses `t` only for the `title`
// attribute, so real translations verify nothing here. Same call as its sibling,
// TokenRingChrome.test.jsx:6.
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));

// jsdom computes no layout, but inline transforms stay plain strings on style.transform — we
// read them directly, stubbing nothing. This covers exactly what BUG-194 broke: the handle's
// position relative to the ring, and its behaviour on a rotated container.
// Helper copied from TokenRingChrome.test.jsx — returns [x, y] out of translate(calc(...)).
const readTranslate = (el) => [...el.style.transform.matchAll(/calc\(-50% \+ (-?[\d.eE+-]+)px\)/g)]
  .map((m) => parseFloat(m[1]));

const renderHandle = (props) => render(
  <TokenRotateHandle onRotateStart={() => {}} {...props} />
).container;

test('the handle rides the equator, scaling its x with the token size', () => {
  const small = renderHandle({ width: 50, height: 50 });
  const large = renderHandle({ width: 150, height: 150 });

  const [smallX] = readTranslate(small.querySelector('.token-rotate-toggle'));
  const [largeX] = readTranslate(large.querySelector('.token-rotate-toggle'));

  // Literals, not a recomputation of tokenRingGeometry: asserting the component against the same
  // function it calls would pass even if that function's meaning changed. 94 = 25 halfLong + 17
  // RING_MARGIN + 52 EQUATOR_GAP; 144 is the same sum for a 3x3 token (75 halfLong).
  expect(smallX).toBe(94);
  expect(largeX).toBe(144);
  expect(largeX).toBeGreaterThan(smallX);
});

test('the handle sits two stack steps below the kill toggle, at any token size', () => {
  const small = renderHandle({ width: 50, height: 50 });
  const large = renderHandle({ width: 150, height: 150 });

  const [, smallY] = readTranslate(small.querySelector('.token-rotate-toggle'));
  const [, largeY] = readTranslate(large.querySelector('.token-rotate-toggle'));

  // halfLong never enters the Y offset — the column position is identical at every token size.
  expect(smallY).toBe(EQUATOR_STACK_STEP * 2);
  expect(largeY).toBe(smallY);
});

test('the anchor undoes the host container rotation', () => {
  const container = renderHandle({ width: 50, height: 50, counterRotate: 90 });
  expect(container.querySelector('.token-rotate-anchor').style.transform).toBe('rotate(-90deg)');
});

test('a host that does not rotate its container gets no counter-rotation', () => {
  const container = renderHandle({ width: 50, height: 50 });
  expect(container.querySelector('.token-rotate-anchor').style.transform).toBe('rotate(0deg)');
});
