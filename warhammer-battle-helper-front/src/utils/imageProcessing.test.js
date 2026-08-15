import {
  PRESETS,
  PNG_MAX_PIXELS,
  GAME_IMAGE_ASPECT,
  MAX_PASSTHROUGH_BYTES,
  computeTargetSize,
  resolveAspect,
  shouldPassthrough,
  sourceMayHaveAlpha,
  pickEncoding,
} from './imageProcessing';

const SMALL_BYTES = 1024;

describe('computeTargetSize', () => {
  it('scales a landscape image down by its longer edge', () => {
    expect(computeTargetSize(10000, 5000, 4096)).toEqual({ width: 4096, height: 2048 });
  });

  it('scales a portrait image down by its longer edge', () => {
    expect(computeTargetSize(5000, 10000, 4096)).toEqual({ width: 2048, height: 4096 });
  });

  it('never upscales a small image', () => {
    expect(computeTargetSize(200, 200, 4096)).toEqual({ width: 200, height: 200 });
  });

  it('leaves an image exactly at the limit alone', () => {
    expect(computeTargetSize(4096, 4096, 4096)).toEqual({ width: 4096, height: 4096 });
  });
});

describe('resolveAspect', () => {
  it('uses the preset ratio when it has one', () => {
    expect(resolveAspect(PRESETS.avatar, 800, 600)).toBe(1);
    expect(resolveAspect(PRESETS.gameImage, 800, 600)).toBe(GAME_IMAGE_ASPECT);
  });

  it("falls back to the source's own ratio when the preset has none", () => {
    expect(resolveAspect(PRESETS.libraryImage, 1600, 900)).toBeCloseTo(16 / 9);
    expect(resolveAspect(PRESETS.handout, 1000, 1000)).toBe(1);
  });

  it('never returns 4/3 by accident for a null-aspect preset', () => {
    // Pins the actual defect: react-easy-crop's defaultProps would have made
    // this 4/3 when the component passed undefined.
    expect(resolveAspect(PRESETS.libraryImage, 1600, 900)).not.toBeCloseTo(4 / 3);
  });

  it('is defensive about a missing media size', () => {
    expect(resolveAspect(PRESETS.libraryImage, 0, 0)).toBe(1);
  });
});

describe('shouldPassthrough', () => {
  const preset = PRESETS.libraryImage;

  it('passes through an image under the limit with no crop', () => {
    expect(shouldPassthrough(preset, null, 300, 300, SMALL_BYTES)).toBe(true);
  });

  it('passes through an image exactly at the limit', () => {
    expect(shouldPassthrough(preset, null, 4096, 4096, SMALL_BYTES)).toBe(true);
  });

  it('does not pass through when a crop area is given', () => {
    expect(shouldPassthrough(preset, { x: 0, y: 0, width: 250, height: 250 }, 300, 300, SMALL_BYTES)).toBe(false);
  });

  it('does not pass through an image over the limit', () => {
    expect(shouldPassthrough(preset, null, 10000, 10000, SMALL_BYTES)).toBe(false);
  });

  it('never passes through an aspect-bearing preset once a crop area exists', () => {
    const area = { x: 0, y: 0, width: 300, height: 300 };
    expect(shouldPassthrough(PRESETS.avatar, area, 400, 400, SMALL_BYTES)).toBe(false);
    expect(shouldPassthrough(PRESETS.gameImage, area, 400, 400, SMALL_BYTES)).toBe(false);
  });

  it('would pass a wrongly-shaped image through if the crop area were missing', () => {
    // Pins the invariant documented on shouldPassthrough: this 500x300 image is
    // not square, yet passes the avatar preset untouched. Safe only because the
    // crop dialog never confirms without a crop area. If that guard is ever
    // removed, this test is the record of what breaks.
    expect(shouldPassthrough(PRESETS.avatar, null, 500, 300, SMALL_BYTES)).toBe(true);
  });

  it('does not pass through a file at or over the byte ceiling, even under the pixel limit', () => {
    // A photographic PNG well under maxEdge in pixels can still weigh more
    // than the server accepts — passthrough must not skip the re-encode that
    // would have shrunk it.
    expect(shouldPassthrough(preset, null, 300, 300, MAX_PASSTHROUGH_BYTES)).toBe(false);
  });

  it('passes through a file just under the byte ceiling', () => {
    expect(shouldPassthrough(preset, null, 300, 300, MAX_PASSTHROUGH_BYTES - 1)).toBe(true);
  });
});

describe('sourceMayHaveAlpha', () => {
  it('is true for PNG and WebP', () => {
    expect(sourceMayHaveAlpha({ type: 'image/png' })).toBe(true);
    expect(sourceMayHaveAlpha({ type: 'image/webp' })).toBe(true);
  });

  it('is false for JPEG', () => {
    expect(sourceMayHaveAlpha({ type: 'image/jpeg' })).toBe(false);
  });
});

describe('pickEncoding', () => {
  it('uses lossless PNG exactly at the pixel threshold', () => {
    expect(pickEncoding(1024, 1024)).toEqual({ type: 'image/png', quality: undefined });
    expect(1024 * 1024).toBe(PNG_MAX_PIXELS);
  });

  it('uses WebP one pixel past the threshold', () => {
    expect(pickEncoding(1025, 1024)).toEqual({ type: 'image/webp', quality: 0.85 });
  });

  it('keeps avatars and the game tile lossless', () => {
    expect(pickEncoding(512, 512).type).toBe('image/png');
    expect(pickEncoding(800, 640).type).toBe('image/png');
  });

  it('sends maps and large handouts to WebP', () => {
    expect(pickEncoding(2048, 1536).type).toBe('image/webp');
    expect(pickEncoding(4096, 4096).type).toBe('image/webp');
  });
});
