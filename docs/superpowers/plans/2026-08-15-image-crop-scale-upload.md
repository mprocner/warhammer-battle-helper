# FEATURE-132 — Kadrowanie i skalowanie obrazów przy uploadzie — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać kadrowanie i automatyczne skalowanie do wszystkich czterech ścieżek uploadu obrazów, wydzielając logikę do reużywalnego utila i komponentu modala.

**Architecture:** Czysty util `src/utils/imageProcessing.js` (bez Reacta) robi całą pracę na canvasie i wystawia testowalne predykaty. Komponent `ImageCropModal` opakowuje `react-easy-crop` i woła util. Cztery miejsca wywołania używają jednego albo obu, zależnie od tego, czy wgrywają jeden obraz czy wiele. Backend zmienia tylko stałe i listy dozwolonych typów.

**Tech Stack:** React 19 + `react-easy-crop` 6.2 (już w zależnościach), Canvas 2D API, Jest + Testing Library (react-scripts), Go + Gin.

**Spec:** `docs/superpowers/specs/2026-08-15-image-crop-scale-upload-design.md`

## Global Constraints

- Wszystkie stringi widoczne dla użytkownika przez `t('klucz')`, klucze po angielsku; tłumaczenia równolegle w `src/locales/en/translation.json` i `src/locales/pl/translation.json`. Nigdy nie wpisuj tekstu wprost w JSX.
- Ikony wyłącznie z `@mui/icons-material`.
- CSS w konwencji BEM; kolory kart postaci wg tabeli w `CLAUDE.md`.
- Brak wstecznej kompatybilności — martwy kod, martwe klasy CSS i osierocone klucze i18n usuwaj w tej samej zmianie, która je osierociła.
- `MAX_SOURCE_BYTES = 80 * 1024 * 1024`, `PNG_MAX_PIXELS = 1024 * 1024`, `MaxFileSize = 15 * 1024 * 1024`, `MaxMultipartMemory = 32 * 1024 * 1024` — wartości dokładnie te.
- Presety: `avatar` 512 / aspect 1, `gameImage` 800 / aspect 5:4, `handout` 2048 / bez aspektu, `libraryImage` 4096 / bez aspektu. Preset niesie tylko limit i proporcje — o tym, czy pokazać kadrownik, decyduje miejsce wywołania.
- Frontend: `cd warhammer-battle-helper-front`, testy `CI=true npx react-scripts test --testPathPattern <wzorzec>`.
- Backend: `cd warhammer-battle-helper-backend`, budowanie `go build ./...`, testy `go test ./...`.

---

### Task 1: Backend — limity, pamięć multipart, usunięcie GIF-a

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/storage/local.go:33-52`
- Modify: `warhammer-battle-helper-backend/internal/http/FileHandler.go:47-62`, `:108`
- Modify: `warhammer-battle-helper-backend/internal/http/HandoutHandler.go:22-40`, `:87`
- Modify: `warhammer-battle-helper-backend/internal/http/AvatarHandler.go:33`, `:77`
- Modify: `warhammer-battle-helper-backend/internal/http/GameHandler.go:662`

**Interfaces:**
- Consumes: nic.
- Produces: `storage.MaxFileSize` = 15 MB, nowa stała `storage.MaxMultipartMemory` = 32 MB. Listy `storage.AllowedImageTypes`, `storage.AllowedHandoutTypes`, `http.AllowedFileImageTypes`, `http.AllowedHandoutTypes` bez `image/gif`.

- [ ] **Step 1: Podnieś limit i dodaj stałą pamięci multipart**

W `internal/storage/local.go` zamień blok stałych (linie 51–52):

```go
// MaxFileSize is the maximum allowed file size (15MB).
// Images are downscaled client-side before upload, so this is a safety net for
// requests that bypass the frontend, not the working limit.
const MaxFileSize = 15 * 1024 * 1024

// MaxMultipartMemory is how much of a multipart request Go keeps in RAM before
// spilling to temp files. Deliberately NOT derived from MaxFileSize — it is a
// memory budget, not a size limit, and size is validated separately per file.
const MaxMultipartMemory = 32 * 1024 * 1024
```

- [ ] **Step 2: Usuń GIF z list dozwolonych typów w storage**

W tym samym pliku usuń wiersz `"image/gif":  ".gif",` z `AllowedImageTypes` (linia 37) oraz wiersz `"image/gif":       ".gif",` z `AllowedHandoutTypes` (linia 45).

- [ ] **Step 3: Zaktualizuj komunikat rozmiaru w storage**

W `ValidateFile` zamień:

```go
	if header.Size > MaxFileSize {
		return "", fmt.Errorf("file too large: maximum size is 5MB")
	}
```

na:

```go
	if header.Size > MaxFileSize {
		return "", fmt.Errorf("file too large: maximum size is %dMB", MaxFileSize/(1024*1024))
	}
```

Oraz komunikat typu:

```go
		return "", fmt.Errorf("invalid file type: only JPEG, PNG, and WebP are allowed")
```

- [ ] **Step 4: Zaktualizuj FileHandler**

W `internal/http/FileHandler.go` usuń wiersz `"image/gif":  ".gif",` z `AllowedFileImageTypes` i zamień treść `ValidateImageFile`:

```go
// ValidateImageFile checks if the file is a valid image and within size limits
func ValidateImageFile(contentType string, size int64) (string, error) {
	if size > storage.MaxFileSize {
		return "", &ValidationError{fmt.Sprintf("file too large: maximum size is %dMB", storage.MaxFileSize/(1024*1024))}
	}

	ext, ok := AllowedFileImageTypes[contentType]
	if !ok {
		return "", &ValidationError{"invalid file type: only JPEG, PNG, and WebP images are allowed"}
	}

	return ext, nil
}
```

Dodaj `"fmt"` do importów, jeśli go tam nie ma.

W linii 108 zamień:

```go
	if err := c.Request.ParseMultipartForm(10 * storage.MaxFileSize); err != nil {
```

na:

```go
	// maxMemory, not a size cap — per-file size is checked in ValidateImageFile below.
	if err := c.Request.ParseMultipartForm(storage.MaxMultipartMemory); err != nil {
```

- [ ] **Step 5: Zaktualizuj HandoutHandler**

W `internal/http/HandoutHandler.go` usuń `"image/gif":       ".gif",` z `AllowedHandoutTypes`. W `ValidateHandoutFile` zamień:

```go
	// Check file size
	if size > storage.MaxFileSize {
		return "", &ValidationError{fmt.Sprintf("file too large: maximum size is %dMB", storage.MaxFileSize/(1024*1024))}
	}
```

W linii 87 zamień komentarz i wywołanie na:

```go
	// maxMemory, not a size cap — per-file size is checked in ValidateHandoutFile.
	if err := c.Request.ParseMultipartForm(storage.MaxMultipartMemory); err != nil {
```

- [ ] **Step 6: Zaktualizuj AvatarHandler i GameHandler**

W `internal/http/AvatarHandler.go` linia 33 zamień komentarz `// Parse multipart form with max 5MB` oraz wywołanie na `storage.MaxMultipartMemory`. W linii 77 popraw komentarz Swaggera:

```go
// @Produce image/jpeg,image/png,image/webp
```

W `internal/http/GameHandler.go` linia 662 zamień `storage.MaxFileSize` na `storage.MaxMultipartMemory` w wywołaniu `ParseMultipartForm`.

- [ ] **Step 7: Sprawdź, że nic nie zostało**

Run: `cd warhammer-battle-helper-backend && grep -rn "image/gif\|5MB\|10 \* storage.MaxFileSize" internal/ --include="*.go"`
Expected: brak wyników.

- [ ] **Step 8: Zbuduj i uruchom testy**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./...`
Expected: build bez błędów, wszystkie istniejące testy PASS.

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-backend/internal/
git commit -m "feat(upload): FEATURE-132 raise file limit to 15MB, drop GIF uploads

Client-side downscaling makes the byte limit a safety net rather than the
working constraint, and 4096px maps encode past 5MB on detailed art.
ParseMultipartForm gets its own constant — its argument is a memory
budget, not a size cap, so deriving it from MaxFileSize would have put
150MB per multi-upload in RAM.

GIF uploads are rejected: canvas only sees the first frame, so keeping
them would mean an exception branch and a file skipping the size cap.
Already-stored GIFs still serve — GetFile reads the content type from
disk, not from these allow-lists."
```

---

### Task 2: Czyste predykaty w `imageProcessing.js`

**Files:**
- Create: `warhammer-battle-helper-front/src/utils/imageProcessing.js`
- Test: `warhammer-battle-helper-front/src/utils/imageProcessing.test.js`

**Interfaces:**
- Consumes: nic.
- Produces: `PRESETS`, `GAME_IMAGE_ASPECT`, `MAX_SOURCE_BYTES`, `PNG_MAX_PIXELS`, `computeTargetSize(srcW, srcH, maxEdge) -> {width, height}`, `shouldPassthrough(preset, cropArea, srcW, srcH) -> boolean`, `sourceMayHaveAlpha(file) -> boolean`, `pickEncoding(width, height) -> {type, quality}`.

- [ ] **Step 1: Napisz testy, które nie przechodzą**

Utwórz `src/utils/imageProcessing.test.js`:

```js
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
```

- [ ] **Step 2: Uruchom testy i potwierdź, że nie przechodzą**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern imageProcessing`
Expected: FAIL, `Cannot find module './imageProcessing'`.

- [ ] **Step 3: Napisz minimalną implementację**

Utwórz `src/utils/imageProcessing.js`:

```js
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
```

- [ ] **Step 4: Uruchom testy i potwierdź, że przechodzą**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern imageProcessing`
Expected: PASS, 14 testów.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/imageProcessing.js warhammer-battle-helper-front/src/utils/imageProcessing.test.js
git commit -m "feat(upload): FEATURE-132 add image processing presets and predicates

Pure helpers only — the canvas work lands next. Splitting them out is
what makes any of this testable, since jsdom has no canvas and no
createImageBitmap.

pickEncoding splits at 1MP because the size threshold tracks content
type in this app: small images are tokens and avatars, where PNG is
lossless and small; large ones are painted maps, where PNG is lossless
and unusable."
```

---

### Task 3: `processImage` — praca na canvasie

**Files:**
- Modify: `warhammer-battle-helper-front/src/utils/imageProcessing.js`

**Interfaces:**
- Consumes: wszystko z Taska 2.
- Produces: `processImage(file, preset, cropArea = null) -> Promise<File>` oraz klasa błędu `ImageProcessingError` z polem `reason` przyjmującym wartości `'source-too-large'`, `'decode-failed'`, `'encode-failed'`.

**Uwaga o testach:** `processImage` nie dostaje testów jednostkowych. jsdom nie ma ani `createImageBitmap`, ani działającego `canvas.toBlob`, więc test sprowadzałby się do sprawdzania atrap. Rozgałęzienia decyzyjne siedzą w predykatach z Taska 2, które są przetestowane. Weryfikacja `processImage` odbywa się ręcznie w Taskach 5–9.

- [ ] **Step 1: Dopisz klasę błędu i `processImage`**

Dopisz na końcu `src/utils/imageProcessing.js`:

```js
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
```

- [ ] **Step 2: Potwierdź, że testy predykatów dalej przechodzą**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern imageProcessing`
Expected: PASS, 16 testów (nowych nie przybyło).

- [ ] **Step 3: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/imageProcessing.js
git commit -m "feat(upload): FEATURE-132 add processImage canvas pipeline

The passthrough check has to run after decoding, not before: it needs
the image dimensions and nothing in the browser yields those without a
full decode. It still saves the re-encode, which is the only lossy step.

No unit tests here on purpose — jsdom has neither createImageBitmap nor
a working toBlob, so a test would only exercise mocks. Every branch that
makes a decision lives in the predicates, which are covered."
```

---

### Task 4: Komponent `ImageCropModal`

**Files:**
- Create: `warhammer-battle-helper-front/src/components/common/ImageCropModal.jsx`
- Create: `warhammer-battle-helper-front/src/components/common/ImageCropModal.css`
- Create: `warhammer-battle-helper-front/src/components/common/ImageCropModal.smoke.test.jsx`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json`

**Interfaces:**
- Consumes: `processImage`, `ImageProcessingError` z Taska 3.
- Produces: domyślny eksport `ImageCropModal` z propami `{ file, preset, onConfirm, onCancel }`. `onConfirm` dostaje `File` po przetworzeniu. Komponent sam nic nie wysyła na serwer.

- [ ] **Step 1: Dodaj klucze i18n**

W `src/locales/en/translation.json` dodaj nową sekcję najwyższego poziomu (obok istniejących):

```json
  "imageCrop": {
    "title": "Crop image",
    "zoom": "Zoom",
    "sourceTooLarge": "This image is too large to process (max 80MB).",
    "processingFailed": "Could not process this image."
  },
```

W `src/locales/pl/translation.json` w tym samym miejscu:

```json
  "imageCrop": {
    "title": "Przytnij obraz",
    "zoom": "Powiększenie",
    "sourceTooLarge": "Ten obraz jest za duży do przetworzenia (maks. 80MB).",
    "processingFailed": "Nie udało się przetworzyć tego obrazu."
  },
```

- [ ] **Step 2: Napisz test smoke, który nie przechodzi**

Utwórz `src/components/common/ImageCropModal.smoke.test.jsx`:

```jsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImageCropModal from './ImageCropModal';
import { PRESETS } from '../../utils/imageProcessing';

// react-easy-crop needs real layout and image loading, neither of which jsdom
// provides. One stub for the whole file; mockReportsArea switches whether it
// behaves like a cropper that has finished layout (reports an area) or one that
// has not yet. Swapping the module per-test with jest.resetModules instead
// would reload React into a second registry and crash on an invalid hook call.
//
// React is required inside the factory, and the flag is named with a "mock"
// prefix: jest.mock factories are hoisted above the imports, and only
// mock-prefixed out-of-scope bindings are allowed through.
let mockReportsArea = true;

jest.mock('react-easy-crop', () => {
  const ReactInner = require('react');
  return ({ onCropComplete }) => {
    ReactInner.useEffect(() => {
      if (mockReportsArea) {
        onCropComplete({}, { x: 0, y: 0, width: 100, height: 100 });
      }
    }, [onCropComplete]);
    return ReactInner.createElement('div', { 'data-testid': 'cropper' });
  };
});

jest.mock('../../utils/imageProcessing', () => ({
  ...jest.requireActual('../../utils/imageProcessing'),
  processImage: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

const { processImage } = require('../../utils/imageProcessing');

// Not beforeAll: this project runs with CRA's resetMocks default, which would
// wipe these before every test.
beforeEach(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:stub');
  global.URL.revokeObjectURL = jest.fn();
  processImage.mockReset();
  mockReportsArea = true;
});

const sourceFile = () => new File(['x'], 'map.png', { type: 'image/png' });

test('hands the processed file to onConfirm', async () => {
  const processed = new File(['y'], 'map.webp', { type: 'image/webp' });
  processImage.mockResolvedValue(processed);
  const onConfirm = jest.fn();

  render(
    <ImageCropModal
      file={sourceFile()}
      preset={PRESETS.libraryImage}
      onConfirm={onConfirm}
      onCancel={jest.fn()}
    />
  );

  await userEvent.click(screen.getByRole('button', { name: 'common.save' }));

  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(processed));
});

test('shows an error and does not confirm when processing fails', async () => {
  const { ImageProcessingError } = jest.requireActual('../../utils/imageProcessing');
  processImage.mockRejectedValue(new ImageProcessingError('encode-failed'));
  const onConfirm = jest.fn();

  render(
    <ImageCropModal
      file={sourceFile()}
      preset={PRESETS.libraryImage}
      onConfirm={onConfirm}
      onCancel={jest.fn()}
    />
  );

  await userEvent.click(screen.getByRole('button', { name: 'common.save' }));

  expect(await screen.findByText('imageCrop.processingFailed')).toBeInTheDocument();
  expect(onConfirm).not.toHaveBeenCalled();
});

test('save stays disabled until a crop area is reported', () => {
  // The state ImageCropModal is in between opening and react-easy-crop
  // finishing layout. Confirming here would hand processImage a null crop
  // area, which bypasses the preset's aspect ratio entirely.
  mockReportsArea = false;

  render(
    <ImageCropModal
      file={sourceFile()}
      preset={PRESETS.avatar}
      onConfirm={jest.fn()}
      onCancel={jest.fn()}
    />
  );

  expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled();
});

test('cancel closes without processing', async () => {
  const onCancel = jest.fn();

  render(
    <ImageCropModal
      file={sourceFile()}
      preset={PRESETS.libraryImage}
      onConfirm={jest.fn()}
      onCancel={onCancel}
    />
  );

  await userEvent.click(screen.getByRole('button', { name: 'common.cancel' }));

  expect(onCancel).toHaveBeenCalled();
  expect(processImage).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Uruchom test i potwierdź, że nie przechodzi**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern ImageCropModal`
Expected: FAIL, `Cannot find module './ImageCropModal'`.

- [ ] **Step 4: Napisz komponent**

Utwórz `src/components/common/ImageCropModal.jsx`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Cropper from 'react-easy-crop';
import { processImage, ImageProcessingError } from '../../utils/imageProcessing';
import './ImageCropModal.css';

const ERROR_KEYS = {
  'source-too-large': 'imageCrop.sourceTooLarge',
  'decode-failed': 'imageCrop.processingFailed',
  'encode-failed': 'imageCrop.processingFailed',
};

/**
 * Crop-and-downscale dialog shared by every single-image upload path.
 *
 * Deliberately does not upload anything — the four call sites hit four
 * different endpoints with four different payloads, so they keep that part and
 * receive a ready File through onConfirm.
 */
const ImageCropModal = ({ file, preset, onConfirm, onCancel }) => {
  const { t } = useTranslation();
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback((_area, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleConfirm = async () => {
    setBusy(true);
    setError('');
    try {
      onConfirm(await processImage(file, preset, croppedAreaPixels));
    } catch (err) {
      const reason = err instanceof ImageProcessingError ? err.reason : null;
      setError(t(ERROR_KEYS[reason] || 'imageCrop.processingFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="image-crop-modal__overlay">
      <div className="image-crop-modal">
        <h4 className="image-crop-modal__title">{t('imageCrop.title')}</h4>
        <div className="image-crop-modal__area">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={preset.aspect ?? undefined}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>
        <div className="image-crop-modal__zoom">
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="image-crop-modal__zoom-slider"
            aria-label={t('imageCrop.zoom')}
          />
        </div>
        {error && <div className="image-crop-modal__error">{error}</div>}
        <div className="image-crop-modal__actions">
          <button
            className="image-crop-modal__btn"
            onClick={onCancel}
            disabled={busy}
          >
            {t('common.cancel')}
          </button>
          <button
            className="image-crop-modal__btn image-crop-modal__btn--primary"
            onClick={handleConfirm}
            // Waiting for croppedAreaPixels is load-bearing, not cosmetic:
            // processImage passes a null crop area straight to
            // shouldPassthrough, which ignores preset.aspect. Confirming
            // before react-easy-crop reports an area would upload a
            // non-square avatar untouched.
            disabled={busy || !croppedAreaPixels}
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageCropModal;
```

- [ ] **Step 5: Napisz CSS**

Utwórz `src/components/common/ImageCropModal.css` — przeniesione z `GeneralTab.css:657-716` z prefiksem `.image-crop-modal`, plus własne style przycisków i suwaka (dotąd pożyczane z `.general-tab__`):

```css
/* Shared crop dialog for every single-image upload path. */
.image-crop-modal__overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 12, 4, 0.6);
}

.image-crop-modal {
  width: min(520px, calc(100vw - 32px));
  background: linear-gradient(135deg, #f4e8d8 0%, #e8dcc4 100%);
  border: 3px solid #7a5c42;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.image-crop-modal__title {
  font-family: 'Cinzel', serif;
  font-size: 1.05rem;
  font-weight: 700;
  color: #6b4423;
  margin: 0;
}

.image-crop-modal__area {
  position: relative;
  width: 100%;
  height: 320px;
  background: #2a2218;
  border: 2px solid #8b6b3d;
  border-radius: 4px;
  overflow: hidden;
}

.image-crop-modal__zoom {
  display: flex;
  align-items: center;
}

.image-crop-modal__zoom-slider {
  width: 100%;
  accent-color: #c9975b;
}

.image-crop-modal__error {
  font-family: 'Crimson Text', serif;
  font-size: 0.9rem;
  color: #8b2f2f;
}

.image-crop-modal__actions {
  display: flex;
  gap: 10px;
}

.image-crop-modal__btn {
  flex: 1;
  padding: 8px 12px;
  font-family: 'Cinzel', serif;
  font-size: 0.9rem;
  color: #3a2f1f;
  background: #fff9f0;
  border: 2px solid #c4a882;
  border-radius: 4px;
  cursor: pointer;
}

.image-crop-modal__btn:hover:not(:disabled) {
  border-color: #7a5c42;
}

.image-crop-modal__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.image-crop-modal__btn--primary {
  background: #c9975b;
  border-color: #7a5c42;
}
```

- [ ] **Step 6: Uruchom test i potwierdź, że przechodzi**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern ImageCropModal`
Expected: PASS, 4 testy.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/common/ImageCropModal.jsx warhammer-battle-helper-front/src/components/common/ImageCropModal.css warhammer-battle-helper-front/src/components/common/ImageCropModal.smoke.test.jsx warhammer-battle-helper-front/src/locales/
git commit -m "feat(upload): FEATURE-132 add shared ImageCropModal

Owns the cropper and calls processImage, but uploads nothing: the four
call sites hit four different endpoints with different payloads, so they
keep that and get a ready File through onConfirm.

The smoke test stubs react-easy-crop, which needs real layout and image
loading that jsdom cannot provide."
```

---

### Task 5: Migracja `GeneralTab` na wspólny modal

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/tabs/GeneralTab.jsx:1-30`, `:36-52`, `:63-140`, `:350-356`, `:444-492`
- Modify: `warhammer-battle-helper-front/src/components/tabs/GeneralTab.css:657-716` (usunięcie)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json:554-555`, `src/locales/pl/translation.json:554-555` (usunięcie)

**Interfaces:**
- Consumes: `ImageCropModal` z Taska 4, `PRESETS` z Taska 2.
- Produces: `GAME_IMAGE_ASPECT` nie jest już eksportowany z `GeneralTab.jsx` — jedynym źródłem jest `src/utils/imageProcessing.js`.

- [ ] **Step 1: Sprawdź, kto importuje `GAME_IMAGE_ASPECT` z `GeneralTab`**

Run: `cd warhammer-battle-helper-front && grep -rn "GAME_IMAGE_ASPECT" src/`
Expected: tylko `GeneralTab.jsx` i `src/utils/imageProcessing.js`. Jeśli importuje go jakiś inny plik, przestaw jego import na `../../utils/imageProcessing` w tym samym kroku.

- [ ] **Step 2: Usuń stary kod kadrowania z `GeneralTab.jsx`**

Usuń: import `Cropper from 'react-easy-crop'` (linia 4), stałą `export const GAME_IMAGE_ASPECT = 5 / 4;` (linia 28), całą funkcję `cropImageToBlob` z komentarzem (linie 36–52), stany `crop`, `zoom`, `croppedAreaPixels` oraz `onCropComplete` (linie 65–67, 116–118), a także cały blok JSX `{cropSrc && (...)}` (linie 445–492).

Dodaj importy:

```jsx
import ImageCropModal from '../common/ImageCropModal';
import { PRESETS } from '../../utils/imageProcessing';
```

- [ ] **Step 3: Przestaw stan na wybrany plik zamiast data URL**

Zamień stan `cropSrc` na `pickedFile` i przepisz `onImageFileSelected` oraz wysyłkę:

```jsx
  const [pickedFile, setPickedFile] = useState(null);
  const [imageBusy, setImageBusy] = useState(false);
  const fileInputRef = useRef(null);

  const onImageFileSelected = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again later
    if (file) setPickedFile(file);
  };

  const uploadCroppedImage = async (processed) => {
    setImageBusy(true);
    try {
      const form = new FormData();
      form.append('image', processed, processed.name);
      const res = await fetch(`${getApiUrl()}/games/${gameId}/image`, {
        method: 'POST',
        // No Content-Type here — the browser sets the multipart boundary itself.
        headers: getApiHeaders({ Authorization: `Bearer ${token}` }),
        body: form,
      });
      if (res.ok) setPickedFile(null); // game state refreshes via WS broadcast
    } catch { /* ignore */ } finally {
      setImageBusy(false);
    }
  };
```

Uwaga: `FileReader` nie jest już potrzebny — `ImageCropModal` sam robi `URL.createObjectURL`, co przy dużych plikach jest znacznie tańsze niż data URL w base64.

- [ ] **Step 4: Wstaw modal w miejsce usuniętego bloku JSX**

W miejscu, gdzie był `{cropSrc && (...)}`:

```jsx
      {pickedFile && (
        <ImageCropModal
          file={pickedFile}
          preset={PRESETS.gameImage}
          onConfirm={uploadCroppedImage}
          onCancel={() => setPickedFile(null)}
        />
      )}
```

Pole `imageBusy` nadal blokuje przyciski wyboru i usuwania obrazu w sekcji ustawień — zostaw tamten kod bez zmian.

- [ ] **Step 5: Zablokuj GIF-a w inpucie**

W linii 353 zamień `accept="image/*"` na `accept="image/jpeg,image/png,image/webp"`.

- [ ] **Step 6: Usuń osierocony CSS i klucze i18n**

Usuń z `GeneralTab.css` cały blok od komentarza `/* Game image cropper overlay */` do końca `.game-image-cropper__actions .general-tab__action-btn` (linie 657–716). Usuń klucze `settings.gameImageCropTitle` i `settings.gameImageZoom` z obu plików tłumaczeń.

- [ ] **Step 7: Potwierdź, że nic nie zostało**

Run: `cd warhammer-battle-helper-front && grep -rn "game-image-cropper\|gameImageCropTitle\|gameImageZoom\|cropImageToBlob\|cropSrc" src/`
Expected: brak wyników.

- [ ] **Step 8: Uruchom testy i zbuduj**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern "imageProcessing|ImageCropModal" && npx react-scripts build`
Expected: testy PASS, build bez błędów i bez ostrzeżeń o nieużywanych importach w `GeneralTab.jsx`.

- [ ] **Step 9: Weryfikacja ręczna**

Uruchom aplikację, wejdź w grę jako GM, zakładka Ogólne. Wybierz obraz gry — powinien otworzyć się modal z ramką 5:4. Zatwierdź bez ruszania ramki i sprawdź, czy kafelek gry się zmienił. Sprawdź w narzędziach deweloperskich, że wysłany plik ma rozszerzenie `.png` (800×640 to 0,5 MP, czyli poniżej progu `PNG_MAX_PIXELS`).

- [ ] **Step 10: Commit**

```bash
git add warhammer-battle-helper-front/src/components/tabs/GeneralTab.jsx warhammer-battle-helper-front/src/components/tabs/GeneralTab.css warhammer-battle-helper-front/src/locales/
git commit -m "refactor(upload): FEATURE-132 move game image crop to ImageCropModal

Also moves GAME_IMAGE_ASPECT into the util: a view component exporting a
domain constant was an inverted dependency.

Switches from FileReader data URLs to URL.createObjectURL, which avoids
base64-inflating the whole file in memory before the cropper ever sees
it."
```

---

### Task 6: Kadrowanie avatara

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/common/AvatarUpload.jsx`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json:351`, `src/locales/pl/translation.json:351`

**Interfaces:**
- Consumes: `ImageCropModal`, `PRESETS.avatar`.
- Produces: nic dla dalszych tasków.

- [ ] **Step 1: Przepisz `AvatarUpload.jsx`**

Zamień importy i logikę wyboru pliku:

```jsx
import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import MuiAvatar from '@mui/material/Avatar';
import axiosInstance from '../../api/axios';
import { getAvatarUrl } from '../Avatar';
import ImageCropModal from './ImageCropModal';
import { PRESETS } from '../../utils/imageProcessing';

function AvatarUpload({ currentAvatar, onAvatarChange, disabled = false }) {
    const { t } = useTranslation();
    const [isUploading, setIsUploading] = useState(false);
    const [pickedFile, setPickedFile] = useState(null);
    const fileInputRef = useRef(null);

    const handleClick = () => {
        if (!disabled && !isUploading) {
            fileInputRef.current?.click();
        }
    };

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        // Reset the input so the same file can be selected again
        event.target.value = '';
        if (!file) return;

        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            alert(t('characterSheet.invalidFileType'));
            return;
        }

        // Size is not checked here: the cropper downscales to 512px before
        // upload, so what the user picked is not what gets sent. processImage
        // rejects anything genuinely unprocessable.
        setPickedFile(file);
    };

    const uploadCropped = async (processed) => {
        setPickedFile(null);
        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('avatar', processed, processed.name);

            const response = await axiosInstance.post('/avatars', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            onAvatarChange(response.data.url);
        } catch (error) {
            console.error('Avatar upload failed:', error);
            alert(t('characterSheet.avatarUploadFailed'));
        } finally {
            setIsUploading(false);
        }
    };
```

W JSX zamień `accept` w inpucie na `image/jpeg,image/png,image/webp` i dopisz modal tuż przed zamykającym `</div>` komponentu:

```jsx
            {pickedFile && (
                <div onClick={(e) => e.stopPropagation()}>
                    <ImageCropModal
                        file={pickedFile}
                        preset={PRESETS.avatar}
                        onConfirm={uploadCropped}
                        onCancel={() => setPickedFile(null)}
                    />
                </div>
            )}
```

Opakowanie w `div` z `stopPropagation` jest konieczne: cały `.avatar-upload` ma `onClick={handleClick}`, więc bez tego klik w modal otwierałby okno wyboru pliku.

- [ ] **Step 2: Zaktualizuj klucz i18n**

W obu plikach tłumaczeń zamień `characterSheet.invalidFileType`:

- en: `"Invalid file type. Please upload an image (JPEG, PNG or WebP)."`
- pl: `"Nieprawidłowy typ pliku. Prześlij obraz (JPEG, PNG lub WebP)."`

Klucz `characterSheet.fileTooLarge` (linia 352 w obu plikach) nie ma już użyć — usuń go.

- [ ] **Step 3: Potwierdź, że klucz nie został użyty gdzie indziej**

Run: `cd warhammer-battle-helper-front && grep -rn "characterSheet.fileTooLarge" src/`
Expected: brak wyników.

- [ ] **Step 4: Zbuduj**

Run: `cd warhammer-battle-helper-front && npx react-scripts build`
Expected: build bez błędów.

- [ ] **Step 5: Weryfikacja ręczna**

Otwórz kartę postaci, kliknij avatar, wybierz zdjęcie w orientacji pionowej. Modal powinien wymuszać ramkę kwadratową. Po zatwierdzeniu avatar ma być wykadrowany dokładnie tak, jak pokazywała ramka. Sprawdź w narzędziach sieciowych, że wysłany plik to `.png` o boku najwyżej 512 px.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/common/AvatarUpload.jsx warhammer-battle-helper-front/src/locales/
git commit -m "feat(upload): FEATURE-132 crop avatars to a square before upload

An avatar renders inside a circle, so without a cropper a portrait photo
got cut down arbitrarily by CSS with no user control. The size check
goes away because the picked file is no longer the file that gets sent."
```

---

### Task 7: Kadrowanie obrazu handoutu

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/tabs/handouts/HandoutCreateModal.jsx:11-20`, `:142-175`, `:373-376`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json:590-594`, `src/locales/pl/translation.json:590-594`

**Interfaces:**
- Consumes: `ImageCropModal`, `PRESETS.handout`.
- Produces: nic dla dalszych tasków.

- [ ] **Step 1: Zaktualizuj stałe modułu**

W `HandoutCreateModal.jsx` usuń `const MAX_FILE_SIZE = 5 * 1024 * 1024;` i usuń `'image/gif': '.gif',` z `ALLOWED_FILE_TYPES`. Dodaj obok:

```js
// PDF and TXT skip the cropper — there is nothing to crop and nothing to downscale.
const CROPPABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
```

Dodaj importy:

```jsx
import ImageCropModal from '../../common/ImageCropModal';
import { PRESETS } from '../../../utils/imageProcessing';
```

- [ ] **Step 2: Rozdziel ścieżkę obrazu od ścieżki dokumentu**

Dodaj stan obok pozostałych: `const [pickedFile, setPickedFile] = useState(null);`

Zamień `handleFileSelect` na:

```jsx
  const uploadFile = async (file) => {
    setUploadError('');
    setIsUploading(true);

    try {
      const result = await uploadHandoutFile(gameId, file);
      setFormData(prev => ({ ...prev, fileUrl: result.url }));
      setPreviewUrl(result.url);
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadError(t('handouts.uploadFailed'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (!file) return;

    if (!ALLOWED_FILE_TYPES[file.type]) {
      setUploadError(t('handouts.invalidFileType'));
      return;
    }

    if (CROPPABLE_TYPES.includes(file.type)) {
      setPickedFile(file);
      return;
    }

    uploadFile(file);
  };

  const handleCropConfirmed = (processed) => {
    setPickedFile(null);
    uploadFile(processed);
  };
```

Sprawdzenie rozmiaru znika: obrazy i tak schodzą do 2048 px przed wysyłką, a PDF-y i pliki tekstowe łapie limit serwerowy, podniesiony w Tasku 1 do 15 MB.

- [ ] **Step 3: Wstaw modal i popraw `accept`**

W linii 374 zamień `accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt"` na `accept=".jpg,.jpeg,.png,.webp,.pdf,.txt"`.

Tuż przed zamykającym znacznikiem najbardziej zewnętrznego kontenera modala dopisz:

```jsx
      {pickedFile && (
        <ImageCropModal
          file={pickedFile}
          preset={PRESETS.handout}
          onConfirm={handleCropConfirmed}
          onCancel={() => setPickedFile(null)}
        />
      )}
```

- [ ] **Step 4: Zaktualizuj klucze i18n**

W obu plikach tłumaczeń, sekcja `handouts`:

- `invalidFileType` en: `"Invalid file type. Allowed: JPEG, PNG, WebP, PDF, TXT"`, pl: `"Nieprawidłowy typ pliku. Dozwolone: JPEG, PNG, WebP, PDF, TXT"`
- `allowedFormats` en: `"JPEG, PNG, WebP, PDF, TXT (max 15MB)"`, pl: `"JPEG, PNG, WebP, PDF, TXT (max 15MB)"`
- Usuń `handouts.fileTooLarge` z obu plików.

- [ ] **Step 5: Potwierdź brak osieroconych odwołań i uruchom testy**

Run: `cd warhammer-battle-helper-front && grep -rn "handouts.fileTooLarge\|MAX_FILE_SIZE" src/ ; CI=true npx react-scripts test --testPathPattern HandoutsTab`
Expected: grep bez wyników; istniejący test `HandoutsTab.wsRace.test.jsx` PASS.

- [ ] **Step 6: Weryfikacja ręczna**

W grze jako GM otwórz tworzenie handoutu. Wybierz PDF — ma się wysłać od razu, bez modala. Wybierz obraz — ma otworzyć modal ze swobodnymi proporcjami. Zatwierdź bez ruszania ramki i sprawdź, że podgląd pokazuje cały obraz.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/tabs/handouts/HandoutCreateModal.jsx warhammer-battle-helper-front/src/locales/
git commit -m "feat(upload): FEATURE-132 crop handout images before upload

Images go through the cropper with free proportions, which lets a GM
trim the margin off a scan. PDF and TXT keep the direct path — there is
nothing to crop and nothing to downscale."
```

---

### Task 8: Skalowanie wsadowe w `FilesTab`

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/tabs/FilesTab.jsx:257-292`, `:496-499`, sekcja stanu i strefa uploadu
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json:877-885`, `src/locales/pl/translation.json:877-885`

**Interfaces:**
- Consumes: `processImage`, `PRESETS.libraryImage`, `ImageProcessingError`.
- Produces: nic dla Taska 9 poza tym, że `FilesTab` ma już zaimportowany `processImage`.

- [ ] **Step 1: Dodaj klucze i18n**

W sekcji `files` obu plików tłumaczeń dodaj:

- en: `"processing": "Processing {{current}} of {{total}}…"`, `"processingFailed": "Could not process: {{names}}"`
- pl: `"processing": "Przetwarzanie {{current}} z {{total}}…"`, `"processingFailed": "Nie udało się przetworzyć: {{names}}"`

Zaktualizuj istniejące:

- `files.allowedFormats` en: `"JPEG, PNG, WebP (max 15MB each)"`, pl: `"JPEG, PNG, WebP (max 15MB każdy)"`
- Usuń `files.fileTooLarge` z obu plików.

- [ ] **Step 2: Dodaj import i stan postępu**

W `FilesTab.jsx` dodaj import:

```jsx
import { processImage, PRESETS } from '../../utils/imageProcessing';
```

Obok pozostałych stanów dodaj:

```jsx
  const [progress, setProgress] = useState(null); // { current, total } while preprocessing
```

- [ ] **Step 3: Przepisz `handleUpload`**

```jsx
  // Handle file upload (from the picker or an external drag)
  const handleUpload = async (fileList) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const picked = Array.from(fileList).filter(file => validTypes.includes(file.type));

    if (picked.length === 0) {
      setError(t('files.invalidFileType'));
      return;
    }

    setIsUploading(true);
    setError('');

    // Serial, not Promise.all: decoding and redrawing a 4096px image costs
    // ~100ms of main thread, so twenty at once freeze the UI for seconds with
    // no feedback. Awaiting between files hands control back to the event loop
    // and lets the counter render.
    const prepared = [];
    const failed = [];
    for (let i = 0; i < picked.length; i++) {
      setProgress({ current: i + 1, total: picked.length });
      try {
        prepared.push(await processImage(picked[i], PRESETS.libraryImage));
      } catch {
        failed.push(picked[i].name);
      }
    }
    setProgress(null);

    if (failed.length > 0) {
      setError(t('files.processingFailed', { names: failed.join(', ') }));
    }

    if (prepared.length === 0) {
      setIsUploading(false);
      return;
    }

    try {
      const result = await uploadFiles(prepared, currentFolderId);

      if (result.files && result.files.length > 0) {
        setFiles(prev => [...prev, ...result.files]);
      }

      if (result.errors && result.errors.length > 0) {
        setError(result.errors.join(', '));
      }
    } catch (err) {
      console.error('Failed to upload files:', err);
      setError(t('files.uploadError'));
    } finally {
      setIsUploading(false);
    }
  };
```

- [ ] **Step 4: Pokaż postęp w strefie uploadu**

W bloku `{isUploading ? (...)}` zamień treść na:

```jsx
            <>
              <div className="loading-spinner" />
              <span>
                {progress
                  ? t('files.processing', { current: progress.current, total: progress.total })
                  : t('files.uploading')}
              </span>
            </>
```

- [ ] **Step 5: Popraw `accept`**

W linii 498 zamień `accept=".jpg,.jpeg,.png,.gif,.webp"` na `accept=".jpg,.jpeg,.png,.webp"`.

- [ ] **Step 6: Zbuduj i sprawdź osierocone klucze**

Run: `cd warhammer-battle-helper-front && grep -rn "files.fileTooLarge" src/ ; npx react-scripts build`
Expected: grep bez wyników; build bez błędów.

- [ ] **Step 7: Weryfikacja ręczna**

Wejdź w zakładkę Pliki. Wgraj naraz kilka obrazów, w tym jeden duży (co najmniej 5000 px). Podczas przetwarzania ma być widoczny licznik „Przetwarzanie 1 z 3…". Po zakończeniu sprawdź w narzędziach sieciowych, że duży plik poszedł jako `.webp` o dłuższej krawędzi 4096, a mały PNG poszedł nietknięty, z oryginalną nazwą i rozszerzeniem.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/components/tabs/FilesTab.jsx warhammer-battle-helper-front/src/locales/
git commit -m "feat(upload): FEATURE-132 downscale library images on upload

Multi-upload gets no cropper — cropping twenty maps one by one is a
slog, and a map placed on a scene already has its own transform. It does
get automatic downscaling, which it always needs.

Processing runs serially with a visible counter rather than Promise.all,
so the main thread stays responsive."
```

---

### Task 9: Kadrowanie pliku w bibliotece

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/tabs/files/DraggableFileItem.jsx`
- Modify: `warhammer-battle-helper-front/src/components/tabs/FilesTab.jsx` (stan, handlery, render `DraggableFileItem` i modal)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `src/locales/pl/translation.json`

**Interfaces:**
- Consumes: `ImageCropModal`, `PRESETS.libraryImage`, `uploadFiles` z `src/api/files.js`, `resolveFileUrl` z `src/utils/fileUrl.js`.
- Produces: nic — ostatni task.

- [ ] **Step 1: Dodaj klucze i18n**

W sekcji `files` obu plików tłumaczeń:

- en: `"cropFile": "Crop image"`, `"croppedSuffix": "cropped"`, `"cropLoadFailed": "Could not load this file for cropping."`
- pl: `"cropFile": "Przytnij obraz"`, `"croppedSuffix": "przycięty"`, `"cropLoadFailed": "Nie udało się wczytać tego pliku do kadrowania."`

- [ ] **Step 2: Dodaj ikonę do `DraggableFileItem.jsx`**

Dodaj import `import CropIcon from '@mui/icons-material/Crop';`, dopisz `onCrop` do listy propów komponentu i wstaw przycisk w bloku akcji, między przyciskiem sceny a przyciskiem zmiany nazwy:

```jsx
            <button
              className="list-action-btn"
              onClick={(e) => { e.stopPropagation(); onHover(null); onCrop(file); }}
              title={t('files.cropFile')}
            >
              <CropIcon fontSize="inherit" />
            </button>
```

- [ ] **Step 3: Dodaj obsługę w `FilesTab.jsx`**

Dodaj import `import ImageCropModal from '../common/ImageCropModal';` oraz stan:

```jsx
  const [cropTarget, setCropTarget] = useState(null); // { file, source } — source is the fetched File
```

Dodaj handlery:

```jsx
  // Cropping an existing library file writes a COPY. SceneImage references files
  // by fileUrl (not fileId), and one file can be used by scenes across several
  // games, so overwriting in place would mean rewriting every reference plus
  // cache-busting a UUID filename. The copy costs nothing on the backend.
  const handleCropFile = async (file) => {
    setError('');
    try {
      const res = await fetch(resolveFileUrl(file.fileUrl));
      const blob = await res.blob();
      setCropTarget({ file, source: new File([blob], file.name, { type: blob.type }) });
    } catch (err) {
      console.error('Failed to load file for cropping:', err);
      setError(t('files.cropLoadFailed'));
    }
  };

  const handleCropConfirmed = async (processed) => {
    const original = cropTarget.file;
    setCropTarget(null);
    setIsUploading(true);
    setError('');
    try {
      const base = original.name.replace(/\.[^.]+$/, '');
      const ext = processed.name.slice(processed.name.lastIndexOf('.'));
      const named = new File(
        [processed],
        `${base} (${t('files.croppedSuffix')})${ext}`,
        { type: processed.type }
      );
      const result = await uploadFiles([named], currentFolderId);
      if (result.files && result.files.length > 0) {
        setFiles(prev => [...prev, ...result.files]);
      }
    } catch (err) {
      console.error('Failed to upload cropped file:', err);
      setError(t('files.uploadError'));
    } finally {
      setIsUploading(false);
    }
  };
```

Sprawdź, że `resolveFileUrl` jest wśród importów pliku — jeśli nie, dodaj `import { resolveFileUrl } from '../../utils/fileUrl';`.

- [ ] **Step 4: Podłącz prop i modal**

Do każdego renderowania `<DraggableFileItem ... />` w `FilesTab.jsx` dodaj `onCrop={handleCropFile}`.

Obok pozostałych modali dopisz:

```jsx
      {cropTarget && (
        <ImageCropModal
          file={cropTarget.source}
          preset={PRESETS.libraryImage}
          onConfirm={handleCropConfirmed}
          onCancel={() => setCropTarget(null)}
        />
      )}
```

- [ ] **Step 5: Zbuduj**

Run: `cd warhammer-battle-helper-front && npx react-scripts build`
Expected: build bez błędów.

- [ ] **Step 6: Weryfikacja ręczna**

W zakładce Pliki najedź na obraz i kliknij nową ikonę kadrowania. Modal ma pokazać ten plik ze swobodnymi proporcjami. Przytnij i zatwierdź. Sprawdź, że:
1. w folderze są **dwa** pliki — oryginał i kopia z sufiksem `(przycięty)`;
2. oryginał wygląda dokładnie jak wcześniej;
3. jeśli oryginał był wstawiony na scenę, scena **nadal pokazuje wersję nieprzyciętą** — to zamierzone, zgodnie z D2 w specyfikacji;
4. przycięty token PNG zachował przezroczystość i ma rozszerzenie `.png`, jeżeli wynik zmieścił się poniżej 1 MP.

- [ ] **Step 7: Uruchom pełny zestaw testów**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test` oraz `cd warhammer-battle-helper-backend && go test ./...`
Expected: wszystko PASS.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/components/tabs/files/DraggableFileItem.jsx warhammer-battle-helper-front/src/components/tabs/FilesTab.jsx warhammer-battle-helper-front/src/locales/
git commit -m "feat(upload): FEATURE-132 crop library files into a copy

The crop lands as a fourth icon in the row DraggableFileItem already
has; a right-click menu would have introduced portals, positioning and
outside-click handling for a single action.

It writes a copy rather than overwriting. SceneImage points at fileUrl,
not fileId, and one file can back scenes across several games, so
overwriting would mean rewriting every reference and cache-busting a
UUID filename. The cost is that a scene keeps showing the uncropped
version until the user swaps it — acceptable, since the normal flow is
to crop before placing."
```

---

## Kolejność i zależności

Task 1 jest niezależny od reszty i może iść pierwszy albo równolegle. Taski 2 → 3 → 4 są łańcuchem. Taski 5, 6, 7 zależą tylko od 4 i są wzajemnie niezależne. Task 8 zależy od 3. Task 9 zależy od 4 i 8.

## Czego ten plan świadomie nie robi

- Nie podmienia obrazu na scenie po przycięciu pliku w bibliotece (decyzja D2 — użytkownik podmienia ręcznie).
- Nie blokuje animowanego WebP, mimo że canvas spłaszczy go do jednej klatki (przyjęte ograniczenie w D7).
- Nie przenosi przetwarzania do Web Workera (uzasadnienie przy Tasku 8).
- Nie zmienia limitu na muzykę (50 MB zostaje).
