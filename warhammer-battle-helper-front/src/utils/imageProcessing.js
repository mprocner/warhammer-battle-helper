// Client-side image preparation for every upload path: crop, downscale, re-encode.
//
// Two rules drive the whole module. First, canvas.toBlob always encodes from
// scratch — a canvas holds raw RGBA and remembers nothing about the source
// format — so "resize but keep the original encoding" does not exist. Second,
// encoding is the only lossy step, which is why an image that needs neither a
// crop nor a downscale is returned untouched instead of round-tripped.

export const GAME_IMAGE_ASPECT = 5 / 4;

// Reject before decoding: createImageBitmap expands to raw RGBA regardless of
// how well the file compressed, so a 10000x10000 PNG costs 400MB of memory.
export const MAX_SOURCE_BYTES = 80 * 1024 * 1024;

// Below this, lossless PNG is cheap enough to be worth it (a 250x250 token is
// ~60KB). Above it, PNG is unusable — a 4096px map runs 20-40MB against 1.5-3MB
// in WebP, and every player re-downloads scene images on each scene switch.
export const PNG_MAX_PIXELS = 1024 * 1024;

// Whether a path shows the cropper is decided by the call site, not by the
// preset — FilesTab uses libraryImage both ways (bulk upload without the modal,
// single-file crop with it), so a `crop` flag here would be dead weight.
export const PRESETS = {
  avatar:       { maxEdge: 512,  aspect: 1 },
  gameImage:    { maxEdge: 800,  aspect: GAME_IMAGE_ASPECT },
  handout:      { maxEdge: 2048, aspect: null },
  libraryImage: { maxEdge: 4096, aspect: null },
};

// Never upscales — stretching a 200px token to 4096px is noise and megabytes.
export function computeTargetSize(srcW, srcH, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
  return { width: Math.round(srcW * scale), height: Math.round(srcH * scale) };
}

export function shouldPassthrough(preset, cropArea, srcW, srcH) {
  if (cropArea) return false;
  return Math.max(srcW, srcH) <= preset.maxEdge;
}

// MIME type is enough: JPEG has no alpha channel by definition, PNG and WebP may.
export function sourceMayHaveAlpha(file) {
  return file.type === 'image/png' || file.type === 'image/webp';
}

export function pickEncoding(width, height) {
  return width * height <= PNG_MAX_PIXELS
    ? { type: 'image/png', quality: undefined }
    : { type: 'image/webp', quality: 0.85 };
}
