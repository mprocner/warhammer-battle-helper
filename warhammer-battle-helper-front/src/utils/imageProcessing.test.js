import {
  PRESETS,
  PNG_MAX_PIXELS,
  computeTargetSize,
  shouldPassthrough,
  sourceMayHaveAlpha,
  pickEncoding,
} from './imageProcessing';

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

describe('shouldPassthrough', () => {
  const preset = PRESETS.libraryImage;

  it('passes through an image under the limit with no crop', () => {
    expect(shouldPassthrough(preset, null, 300, 300)).toBe(true);
  });

  it('passes through an image exactly at the limit', () => {
    expect(shouldPassthrough(preset, null, 4096, 4096)).toBe(true);
  });

  it('does not pass through when a crop area is given', () => {
    expect(shouldPassthrough(preset, { x: 0, y: 0, width: 250, height: 250 }, 300, 300)).toBe(false);
  });

  it('does not pass through an image over the limit', () => {
    expect(shouldPassthrough(preset, null, 10000, 10000)).toBe(false);
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
