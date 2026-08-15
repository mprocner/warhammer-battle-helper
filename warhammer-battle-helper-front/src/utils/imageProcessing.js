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

// react-easy-crop has no free-form mode: its defaultProps set aspect to 4/3, so
// passing undefined silently crops every image to 4:3 rather than leaving it
// alone. A preset with no aspect of its own therefore takes the source image's,
// which makes the opening frame the whole image — the behaviour "no aspect" was
// meant to describe.
export function resolveAspect(preset, naturalWidth, naturalHeight) {
  if (preset.aspect) return preset.aspect;
  if (!naturalWidth || !naturalHeight) return 1;
  return naturalWidth / naturalHeight;
}

// Deliberately blind to preset.aspect, which puts a requirement on callers:
// a preset carrying an aspect MUST only be used behind a crop dialog that
// refuses to confirm until it has a crop area. Nothing here enforces that —
// pass such a preset a null cropArea and a wrongly-shaped image sails through
// untouched. Presets with aspect: null impose no shape, so they are unaffected.
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

export class ImageProcessingError extends Error {
  constructor(reason) {
    super(`image processing failed: ${reason}`);
    this.name = 'ImageProcessingError';
    this.reason = reason;
  }
}

function encode(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

function renameTo(originalName, mimeType) {
  const ext = mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg';
  return originalName.replace(/\.[^.]+$/, '') + ext;
}

/**
 * Prepare an image for upload: crop it, downscale it to the preset's limit and
 * re-encode it. Returns the ORIGINAL file untouched when neither is needed.
 *
 * @param {File} file
 * @param {object} preset - one of PRESETS
 * @param {?{x:number, y:number, width:number, height:number}} cropArea - source-pixel
 *   rectangle, exactly what react-easy-crop reports as croppedAreaPixels
 * @returns {Promise<File>}
 * @throws {ImageProcessingError}
 */
export async function processImage(file, preset, cropArea = null) {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ImageProcessingError('source-too-large');
  }

  let bitmap;
  try {
    // imageOrientation is not optional: phone photos carry rotation in EXIF and
    // drawImage without it renders the avatar lying on its side.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageProcessingError('decode-failed');
  }

  const source = cropArea || { x: 0, y: 0, width: bitmap.width, height: bitmap.height };

  if (shouldPassthrough(preset, cropArea, bitmap.width, bitmap.height)) {
    bitmap.close();
    return file;
  }

  const { width, height } = computeTargetSize(source.width, source.height, preset.maxEdge);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  // Defaults to 'low', which aliases visibly on a 10000px -> 4096px downscale.
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, source.x, source.y, source.width, source.height, 0, 0, width, height);
  // Release the raw RGBA now rather than waiting for GC — FilesTab processes
  // files serially, so a queue of large maps would otherwise pile up gigabytes.
  bitmap.close();

  const { type, quality } = pickEncoding(width, height);
  let blob = await encode(canvas, type, quality);

  if (!blob) {
    // Only WebP can fail here (iOS Safari caps canvas area at 16.7M pixels, and
    // 4096x4096 sits exactly on that line). Falling back to JPEG is safe only
    // without alpha — a token silently gaining a black background is the exact
    // failure WebP was chosen to prevent.
    if (type === 'image/webp' && !sourceMayHaveAlpha(file)) {
      blob = await encode(canvas, 'image/jpeg', 0.85);
    }
    if (!blob) {
      throw new ImageProcessingError('encode-failed');
    }
  }

  return new File([blob], renameTo(file.name, blob.type), { type: blob.type });
}
