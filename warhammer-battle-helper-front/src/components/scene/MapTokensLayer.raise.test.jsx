import React from 'react';
import { render } from '@testing-library/react';
import MapTokensLayer from './MapTokensLayer';

// The tokens themselves are heavy; only the z-index they are handed matters here.
const received = [];
jest.mock('./SceneImage', () => (props) => { received.push(['image', props.image.id, props.topZIndex]); return null; });
jest.mock('./MapCharacterToken', () => (props) => { received.push(['char', props.character.id, props.topZIndex]); return null; });

// A selected token's ring must sit above every other token. Its chrome lives inside the token's
// own stacking context (an image is rotated), so the whole token is raised while selected — to
// one above the highest z-index in the layer, since bring-to-front has no upper bound.
test('every token learns the z-index that puts it above all others', () => {
  received.length = 0;
  render(
    <MapTokensLayer
      characters={[{ character: { id: 'c1' }, zIndex: 0 }]}
      images={[{ id: 'i1', zIndex: 3 }, { id: 'i2', zIndex: 12 }]}
    />,
  );
  expect(received).toEqual([['char', 'c1', 13], ['image', 'i1', 13], ['image', 'i2', 13]]);
});

test('an empty-ish layer still raises above zero', () => {
  received.length = 0;
  render(<MapTokensLayer characters={[]} images={[{ id: 'i1' }]} />);
  expect(received).toEqual([['image', 'i1', 1]]);
});
