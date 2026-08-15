# FEATURE-167 — Swobodne proporcje kadru — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zamienić `react-easy-crop` na `react-image-crop`, żeby kadr dało się ciągnąć do dowolnych proporcji, zachowując zoom i cały istniejący pipeline przetwarzania obrazu.

**Architecture:** Zmiana zamyka się w jednym komponencie i jednej czystej funkcji. `ImageCropModal` dostaje nowe wnętrze; `imageProcessing.js` traci `resolveAspect` (obejście specyficzne dla starej biblioteki) i zyskuje `percentCropToSourceRect`. Cztery miejsca wywołania, `processImage`, presety i backend pozostają nietknięte, bo granica między nimi a kadrownikiem to propsy komponentu plus prostokąt w pikselach źródła.

**Tech Stack:** React 19, `react-image-crop` 11.1.2, Jest + Testing Library (react-scripts 5).

**Spec:** `docs/superpowers/specs/2026-08-15-free-form-crop-design.md`

## Global Constraints

- Frontend root: `/Users/mateuszprocner/priv/warhammer-battle-helper/warhammer-battle-helper-front`. Wszystkie polecenia npm/npx stamtąd.
- Wszystkie stringi widoczne dla użytkownika przez `t('klucz')`, klucze po angielsku, tłumaczenia równolegle w `src/locales/en/translation.json` i `src/locales/pl/translation.json`.
- CSS w konwencji BEM, prefiks `.image-crop-modal`.
- Brak wstecznej kompatybilności: martwy kod, martwe klasy CSS, osierocone klucze i18n i nieużywane zależności usuwaj w tej samej zmianie, która je osierociła.
- Czysta warstwa (`imageProcessing.js`) **nie zna typów biblioteki** — funkcje przyjmują zwykłe liczby. Rozpakowanie obiektów biblioteki zostaje w komponencie.
- `percentCropToSourceRect(xPct, yPct, widthPct, heightPct, naturalWidth, naturalHeight) -> { x, y, width, height }`, wynik zaokrąglony do pełnych pikseli.
- Reguła „nietknięta ramka = brak kadru" obowiązuje **wyłącznie** presety z `aspect == null` (`handout`, `libraryImage`). Dla `avatar` i `gameImage` kadr jest stosowany zawsze.
- Zoom realizowany szerokością obrazu (`width: ${zoom * 100}%`) w kontenerze `overflow: auto`. **Nigdy** `transform: scale()`.
- Repozytorium ma istniejący, niezwiązany z tą zmianą błąd: suite `src/App.test.js` nie kompiluje się z powodu axios/ESM. Zakresuj uruchomienia testów przez `--testPathPattern`. Nie ruszaj tego pliku.
- Testy: `CI=true npx react-scripts test --testPathPattern <wzorzec>`. Build: `npx react-scripts build` — jedno istniejące ostrzeżenie dotyczy `HandoutViewerModal.jsx` i nie jest efektem tej pracy.

---

### Task 1: `percentCropToSourceRect`

**Files:**
- Modify: `warhammer-battle-helper-front/src/utils/imageProcessing.js`
- Test: `warhammer-battle-helper-front/src/utils/imageProcessing.test.js`

**Interfaces:**
- Consumes: nic.
- Produces: `percentCropToSourceRect(xPct, yPct, widthPct, heightPct, naturalWidth, naturalHeight) -> { x, y, width, height }`. Task 2 woła to w `ImageCropModal`.

Task jest czysto addytywny — nic w aplikacji jeszcze tej funkcji nie używa, więc nic nie może się zepsuć.

- [ ] **Step 1: Napisz testy, które nie przechodzą**

Dopisz na końcu `src/utils/imageProcessing.test.js` nowy blok. Rozszerz istniejący import na górze pliku o `percentCropToSourceRect` — nie dodawaj drugiej linii importu.

```js
describe('percentCropToSourceRect', () => {
  it('maps a full-frame selection to the whole source', () => {
    expect(percentCropToSourceRect(0, 0, 100, 100, 1600, 900))
      .toEqual({ x: 0, y: 0, width: 1600, height: 900 });
  });

  it('maps a bottom-right quarter', () => {
    expect(percentCropToSourceRect(50, 50, 50, 50, 1600, 900))
      .toEqual({ x: 800, y: 450, width: 800, height: 450 });
  });

  it('scales each axis by its own dimension', () => {
    // A portrait source: the same percentage means different pixel counts on
    // each axis, so a single shared scale factor would fail this.
    expect(percentCropToSourceRect(0, 0, 100, 50, 800, 1600))
      .toEqual({ x: 0, y: 0, width: 800, height: 800 });
  });

  it('rounds to whole pixels', () => {
    expect(percentCropToSourceRect(33.333, 0, 33.333, 100, 900, 600))
      .toEqual({ x: 300, y: 0, width: 300, height: 600 });
  });
});
```

- [ ] **Step 2: Uruchom testy i potwierdź, że nie przechodzą**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern imageProcessing`
Expected: FAIL, `percentCropToSourceRect is not a function`.

- [ ] **Step 3: Napisz implementację**

Dopisz w `src/utils/imageProcessing.js`, obok pozostałych czystych funkcji:

```js
// Turns react-image-crop's percentage selection into the source-pixel rectangle
// processImage expects. Takes plain numbers rather than the library's PercentCrop
// object on purpose: the maths is universal, so it should survive the next change
// of cropping library. Unpacking the library's object stays in the component.
//
// No clamping: the library keeps its selection inside the image, and silently
// correcting an out-of-range rectangle here would hide a real bug rather than
// surface it.
export function percentCropToSourceRect(xPct, yPct, widthPct, heightPct, naturalWidth, naturalHeight) {
  return {
    x: Math.round((xPct / 100) * naturalWidth),
    y: Math.round((yPct / 100) * naturalHeight),
    width: Math.round((widthPct / 100) * naturalWidth),
    height: Math.round((heightPct / 100) * naturalHeight),
  };
}
```

- [ ] **Step 4: Uruchom testy i potwierdź, że przechodzą**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern imageProcessing`
Expected: PASS, 4 nowe testy obok istniejących.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/imageProcessing.js warhammer-battle-helper-front/src/utils/imageProcessing.test.js
git commit -m "feat(crop): FEATURE-167 add percentCropToSourceRect

Takes plain numbers rather than the cropping library's own crop object.
The maths is universal, and the previous helper that leaked a library's
behaviour into this module is exactly the one this feature has to delete.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Wymiana biblioteki i wnętrza `ImageCropModal`

**Files:**
- Modify: `warhammer-battle-helper-front/package.json` (dodanie zależności)
- Modify: `warhammer-battle-helper-front/src/components/common/ImageCropModal.jsx` (przepisanie wnętrza)
- Modify: `warhammer-battle-helper-front/src/components/common/ImageCropModal.css` (kontener przewijany)
- Test: `warhammer-battle-helper-front/src/components/common/ImageCropModal.smoke.test.jsx` (przepisanie)

**Interfaces:**
- Consumes: `percentCropToSourceRect` z Taska 1; `processImage(file, preset, cropArea)` i `ImageProcessingError` bez zmian; `PRESETS`.
- Produces: `ImageCropModal` z **niezmienionymi** propami `{ file, preset, onConfirm, onCancel }`. Miejsca wywołania nie są ruszane w żadnym tasku tego planu.

Po tym tasku `resolveAspect` i `react-easy-crop` są już nieużywane, ale jeszcze obecne — sprząta je Task 3. Dzięki temu ten task da się przejrzeć jako jedną, kompletną zamianę.

- [ ] **Step 1: Zainstaluj zależność**

Run: `cd warhammer-battle-helper-front && npm install react-image-crop@11.1.2`
Expected: `package.json` zyskuje `"react-image-crop": "^11.1.2"` w `dependencies`.

- [ ] **Step 2: Napisz testy, które nie przechodzą**

Zastąp **całą zawartość** `src/components/common/ImageCropModal.smoke.test.jsx`:

```jsx
import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImageCropModal from './ImageCropModal';
import { PRESETS } from '../../utils/imageProcessing';

// react-image-crop needs real layout, which jsdom does not provide. The stub
// renders its children (so the <img> and its onLoad survive) and exposes a
// button that fires onChange, standing in for the user dragging the frame.
//
// React is required inside the factory: jest.mock factories are hoisted above
// the imports and may not reference out-of-scope variables. Swapping the module
// per-test with jest.resetModules instead would reload React into a second
// registry and crash on an invalid hook call.
jest.mock('react-image-crop', () => {
  const ReactInner = require('react');
  return {
    __esModule: true,
    default: ({ children, onChange }) =>
      ReactInner.createElement(
        'div',
        { 'data-testid': 'cropper' },
        ReactInner.createElement(
          'button',
          {
            type: 'button',
            onClick: () => onChange({}, { unit: '%', x: 10, y: 20, width: 30, height: 40 }),
          },
          'drag-the-frame'
        ),
        children
      ),
    // The real helpers are the library's business; what matters here is that the
    // component routes a fixed-aspect preset through them and sends the result on.
    centerCrop: (crop) => crop,
    makeAspectCrop: () => ({ unit: '%', x: 25, y: 0, width: 50, height: 100 }),
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

beforeEach(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:stub');
  global.URL.revokeObjectURL = jest.fn();
  processImage.mockReset();
});

const sourceFile = () => new File(['x'], 'map.png', { type: 'image/png' });

// jsdom never loads a blob: URL and reports naturalWidth as 0, so the load event
// and the intrinsic size both have to be supplied by hand.
const loadImage = (width = 1600, height = 900) => {
  const img = document.querySelector('.image-crop-modal__area img');
  Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });
  fireEvent.load(img);
};

const renderModal = (preset, overrides = {}) =>
  render(
    <ImageCropModal
      file={sourceFile()}
      preset={preset}
      onConfirm={jest.fn()}
      onCancel={jest.fn()}
      {...overrides}
    />
  );

test('hands the processed file to onConfirm', async () => {
  const processed = new File(['y'], 'map.webp', { type: 'image/webp' });
  processImage.mockResolvedValue(processed);
  const onConfirm = jest.fn();

  renderModal(PRESETS.libraryImage, { onConfirm });
  loadImage();

  await userEvent.click(screen.getByRole('button', { name: 'common.save' }));

  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(processed));
});

test('an untouched frame on a free-aspect preset sends no crop area', async () => {
  processImage.mockResolvedValue(new File(['y'], 'map.png', { type: 'image/png' }));

  renderModal(PRESETS.libraryImage);
  loadImage();

  await userEvent.click(screen.getByRole('button', { name: 'common.save' }));

  await waitFor(() => expect(processImage).toHaveBeenCalled());
  expect(processImage).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'map.png' }),
    PRESETS.libraryImage,
    null
  );
});

test('an untouched frame on a fixed-aspect preset still sends a rectangle', async () => {
  // The avatar's opening frame is a centred square — already a crop. Extending
  // the "untouched means no crop" rule to it would upload the whole portrait.
  processImage.mockResolvedValue(new File(['y'], 'a.png', { type: 'image/png' }));

  renderModal(PRESETS.avatar);
  loadImage(1600, 900);

  await userEvent.click(screen.getByRole('button', { name: 'common.save' }));

  await waitFor(() => expect(processImage).toHaveBeenCalled());
  expect(processImage).toHaveBeenCalledWith(
    expect.anything(),
    PRESETS.avatar,
    { x: 400, y: 0, width: 800, height: 900 }
  );
});

test('dragging the frame makes even a free-aspect preset send a rectangle', async () => {
  processImage.mockResolvedValue(new File(['y'], 'map.png', { type: 'image/png' }));

  renderModal(PRESETS.libraryImage);
  loadImage(1600, 900);

  await userEvent.click(screen.getByRole('button', { name: 'drag-the-frame' }));
  await userEvent.click(screen.getByRole('button', { name: 'common.save' }));

  await waitFor(() => expect(processImage).toHaveBeenCalled());
  expect(processImage).toHaveBeenCalledWith(
    expect.anything(),
    PRESETS.libraryImage,
    { x: 160, y: 180, width: 480, height: 360 }
  );
});

test('save stays disabled until the image has loaded', () => {
  // Before load there is no intrinsic size, so no percentage can be turned into
  // source pixels. Confirming here would crash or send nonsense.
  renderModal(PRESETS.avatar);

  expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled();
});

test('shows an error and does not confirm when processing fails', async () => {
  const { ImageProcessingError } = jest.requireActual('../../utils/imageProcessing');
  processImage.mockRejectedValue(new ImageProcessingError('encode-failed'));
  const onConfirm = jest.fn();

  renderModal(PRESETS.libraryImage, { onConfirm });
  loadImage();

  await userEvent.click(screen.getByRole('button', { name: 'common.save' }));

  expect(await screen.findByText('imageCrop.processingFailed')).toBeInTheDocument();
  expect(onConfirm).not.toHaveBeenCalled();
});

test('maps a too-large source to its own message', async () => {
  const { ImageProcessingError } = jest.requireActual('../../utils/imageProcessing');
  processImage.mockRejectedValue(new ImageProcessingError('source-too-large'));
  const onConfirm = jest.fn();

  renderModal(PRESETS.libraryImage, { onConfirm });
  loadImage();

  await userEvent.click(screen.getByRole('button', { name: 'common.save' }));

  expect(await screen.findByText('imageCrop.sourceTooLarge')).toBeInTheDocument();
  expect(onConfirm).not.toHaveBeenCalled();
});

test('stays busy until an async onConfirm settles', async () => {
  processImage.mockResolvedValue(new File(['y'], 'map.webp', { type: 'image/webp' }));

  let releaseUpload;
  const onConfirm = jest.fn(() => new Promise((resolve) => { releaseUpload = resolve; }));

  renderModal(PRESETS.libraryImage, { onConfirm });
  loadImage();

  const save = screen.getByRole('button', { name: 'common.save' });
  const cancel = screen.getByRole('button', { name: 'common.cancel' });

  await userEvent.click(save);
  await waitFor(() => expect(onConfirm).toHaveBeenCalled());

  // The upload has not resolved yet. Both buttons must still be locked.
  expect(save).toBeDisabled();
  expect(cancel).toBeDisabled();

  await act(async () => { releaseUpload(); });

  await waitFor(() => expect(save).not.toBeDisabled());
});

test('cancel closes without processing', async () => {
  const onCancel = jest.fn();

  renderModal(PRESETS.libraryImage, { onCancel });
  loadImage();

  await userEvent.click(screen.getByRole('button', { name: 'common.cancel' }));

  expect(onCancel).toHaveBeenCalled();
  expect(processImage).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Uruchom testy i potwierdź, że nie przechodzą**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern ImageCropModal`
Expected: FAIL — komponent nadal renderuje `react-easy-crop`, którego atrapa w tym pliku już nie obejmuje, więc ani ramka startowa, ani `naturalSize` nie powstają tak, jak testy zakładają. Zanotuj w raporcie faktyczny komunikat błędu; nie zgaduj go z góry.

- [ ] **Step 4: Przepisz komponent**

Zastąp **całą zawartość** `src/components/common/ImageCropModal.jsx`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { processImage, percentCropToSourceRect, ImageProcessingError } from '../../utils/imageProcessing';
import './ImageCropModal.css';

const ERROR_KEYS = {
  'source-too-large': 'imageCrop.sourceTooLarge',
  'decode-failed': 'imageCrop.processingFailed',
  'encode-failed': 'imageCrop.processingFailed',
};

const WHOLE_IMAGE_CROP = { unit: '%', x: 0, y: 0, width: 100, height: 100 };

/**
 * Crop-and-downscale dialog shared by every single-image upload path.
 *
 * Deliberately does not upload anything — the four call sites hit four
 * different endpoints with different payloads, so they keep that part and
 * receive a ready File through onConfirm.
 */
const ImageCropModal = ({ file, preset, onConfirm, onCancel }) => {
  const { t } = useTranslation();
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState(null);
  const [touched, setTouched] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Keyed on `file` so a swapped file gets a fresh preview AND fresh crop state.
  // Without the resets, a call site that changes `file` without remounting would
  // keep the previous image's frame and its touched flag, and could crop the new
  // image to the old bounds.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setCrop(null);
    setTouched(false);
    setZoom(1);
    setNaturalSize(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onImageLoad = useCallback((e) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setNaturalSize({ width: naturalWidth, height: naturalHeight });
    setCrop(
      preset.aspect
        ? centerCrop(
            makeAspectCrop({ unit: '%', width: 100 }, preset.aspect, naturalWidth, naturalHeight),
            naturalWidth,
            naturalHeight
          )
        : WHOLE_IMAGE_CROP
    );
  }, [preset.aspect]);

  const handleConfirm = async () => {
    setBusy(true);
    setError('');
    try {
      // An untouched frame counts as "no crop" ONLY where the preset forces no
      // shape. For avatar and gameImage the opening frame is already a centred
      // crop, so skipping it would upload the whole, wrongly-shaped image — the
      // failure the previous library's confirm guard existed to prevent.
      const cropArea =
        preset.aspect == null && !touched
          ? null
          : percentCropToSourceRect(
              crop.x, crop.y, crop.width, crop.height,
              naturalSize.width, naturalSize.height
            );
      // onConfirm is awaited, not fired and forgotten: every call site uploads
      // inside it, and busy is what keeps Save and Cancel disabled. Without the
      // await they re-enable while the request is still in flight, and a second
      // click starts a second concurrent upload.
      await onConfirm(await processImage(file, preset, cropArea));
    } catch (err) {
      const reason = err instanceof ImageProcessingError ? err.reason : null;
      setError(t(ERROR_KEYS[reason] || 'imageCrop.processingFailed'));
    } finally {
      setBusy(false);
    }
  };

  // Portaled to document.body: AvatarUpload's five mount points sit inside
  // popups that create their own stacking contexts (the character sheet
  // popup's inline z-index from WindowManagerContext, PlayerSettingsPopup's
  // 9999), which clamp this dialog's z-index regardless of its own value.
  // React events still bubble through the React tree, not the DOM tree, so
  // AvatarUpload's stopPropagation wrapper keeps working on the portaled node.
  return createPortal(
    <div className="image-crop-modal__overlay">
      <div className="image-crop-modal">
        <h4 className="image-crop-modal__title">{t('imageCrop.title')}</h4>
        <div className="image-crop-modal__area">
          {imageSrc && (
            <ReactCrop
              crop={crop ?? undefined}
              onChange={(_pixelCrop, percentCrop) => {
                setCrop(percentCrop);
                setTouched(true);
              }}
              aspect={preset.aspect ?? undefined}
              keepSelection
            >
              {/* Zoom is the image's real width, not a transform: a transform
                  leaves the layout box unscaled, so the frame would be measured
                  against the unzoomed rectangle and every crop would need
                  unwinding afterwards. */}
              <img
                src={imageSrc}
                alt=""
                style={{ width: `${zoom * 100}%`, display: 'block' }}
                onLoad={onImageLoad}
              />
            </ReactCrop>
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
            // Waiting for naturalSize is load-bearing: before the image loads
            // there is no intrinsic size, so no percentage can be converted to
            // source pixels and there is nothing meaningful to confirm.
            disabled={busy || !naturalSize}
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ImageCropModal;
```

- [ ] **Step 5: Zamień kontener kadru na przewijany**

W `src/components/common/ImageCropModal.css` zastąp regułę `.image-crop-modal__area`:

```css
/* Scrolls rather than clips: zoom widens the image past this box on purpose,
   and dragging inside it creates the crop frame, so panning is by scrollbar. */
.image-crop-modal__area {
  width: 100%;
  height: 320px;
  overflow: auto;
  background: #2a2218;
  border: 2px solid #8b6b3d;
  border-radius: 4px;
}
```

`position: relative` odpada — było potrzebne staremu kadrownikowi, który pozycjonował obraz absolutnie. Pozostałe reguły w tym pliku zostaw bez zmian.

- [ ] **Step 6: Uruchom testy i potwierdź, że przechodzą**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern ImageCropModal`
Expected: PASS, 9 testów.

- [ ] **Step 7: Sprawdź, że reguła presetów naprawdę jest pilnowana**

Zamień w komponencie warunek `preset.aspect == null && !touched` na samo `!touched`, uruchom ponownie testy z kroku 6 i potwierdź, że test „an untouched frame on a fixed-aspect preset still sends a rectangle" **PADA**. Przywróć warunek i potwierdź, że znów przechodzi. Zapisz oba wyniki w raporcie — jeśli test przechodzi z osłabionym warunkiem, jest bezwartościowy.

- [ ] **Step 8: Zbuduj**

Run: `cd warhammer-battle-helper-front && npx react-scripts build`
Expected: bez błędów, bez nowego ostrzeżenia nazywającego `ImageCropModal.jsx`.

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-front/package.json warhammer-battle-helper-front/package-lock.json warhammer-battle-helper-front/src/components/common/
git commit -m "feat(crop): FEATURE-167 free-form crop frame via react-image-crop

react-easy-crop's aspect prop is always a number and defaults to 4/3, so
the frame could only ever shrink proportionally. react-image-crop treats
an undefined aspect as genuinely free, and renders our own <img> as its
child — which is what lets zoom be the image's real width instead of a
transform, keeping the percentage crop directly convertible.

An untouched frame now means no crop at all, so confirming without
touching anything returns the original file rather than a re-encode. That
applies only to presets with no forced aspect: the avatar's opening frame
is already a centred square.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Usunięcie starej biblioteki i jej obejścia

**Files:**
- Modify: `warhammer-battle-helper-front/src/utils/imageProcessing.js` (usunięcie `resolveAspect`)
- Modify: `warhammer-battle-helper-front/src/utils/imageProcessing.test.js` (usunięcie bloku `describe('resolveAspect')`)
- Modify: `warhammer-battle-helper-front/package.json` (usunięcie `react-easy-crop`)

**Interfaces:**
- Consumes: nic. Po Tasku 2 nic już nie używa `resolveAspect` ani `react-easy-crop`.
- Produces: nic — ostatni task.

- [ ] **Step 1: Potwierdź, że nic tego nie używa**

Run: `cd warhammer-battle-helper-front && grep -rn "resolveAspect\|react-easy-crop" src/`
Expected: jedyne trafienia to definicja `resolveAspect` w `src/utils/imageProcessing.js` i jej blok testowy w `src/utils/imageProcessing.test.js`. Jeśli pojawi się cokolwiek innego, **zatrzymaj się i zgłoś** — oznacza to, że Task 2 nie zamknął zamiany.

- [ ] **Step 2: Usuń `resolveAspect`**

Usuń z `src/utils/imageProcessing.js` całą funkcję `resolveAspect` razem z jej komentarzem (zaczyna się od `// react-easy-crop has no free-form mode`). Usuń `resolveAspect` z importu w pliku testowym, jeśli tam jest, oraz cały blok `describe('resolveAspect', ...)` z `src/utils/imageProcessing.test.js`.

Funkcja istniała wyłącznie po to, żeby obejść domyślne `4/3` w `react-easy-crop`. Nowa biblioteka rozumie `undefined` jako „swobodnie", więc obejście jest już nie tylko zbędne, ale mylące.

Sprawdź, czy po usunięciu `GAME_IMAGE_ASPECT` jest jeszcze importowany w pliku testowym. Jeśli używał go tylko blok `resolveAspect`, usuń go z importu — inaczej build zgłosi nieużywaną zmienną.

- [ ] **Step 3: Odinstaluj starą bibliotekę**

Run: `cd warhammer-battle-helper-front && npm uninstall react-easy-crop`
Expected: `react-easy-crop` znika z `dependencies` w `package.json`.

- [ ] **Step 4: Potwierdź, że nic nie zostało**

Run: `cd warhammer-battle-helper-front && grep -rn "resolveAspect\|react-easy-crop" src/ package.json`
Expected: brak wyników.

- [ ] **Step 5: Uruchom pełny zestaw testów i zbuduj**

Run: `cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern "imageProcessing|ImageCropModal|HandoutsTab" && npx react-scripts build`
Expected: wszystkie testy PASS (blok `resolveAspect` zniknął, więc licznik `imageProcessing` spada o 4 i rośnie o 4 z Taska 1); build bez błędów.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/package.json warhammer-battle-helper-front/package-lock.json warhammer-battle-helper-front/src/utils/
git commit -m "refactor(crop): FEATURE-167 drop resolveAspect and react-easy-crop

resolveAspect only ever existed to work around the old library's 4/3
default leaking into a module that has no business knowing which cropper
the app uses. The new library needs no such workaround, and keeping the
function would leave a misleading name behind.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Weryfikacja ręczna — do wykonania przez właściciela

Żaden test w tym repozytorium nie widzi układu strony ani danych EXIF, więc te punkty nie mają automatycznego odpowiednika.

1. **Swobodny kadr.** Zakładka Pliki, ikona kadrowania przy obrazie 16:9. Chwyć róg ramki i wyciągnij wąski poziomy pasek, potem wysoki pionowy. Oba muszą być możliwe.
2. **Zatwierdzenie bez ruszania ramki.** Ten sam plik, otwórz kadrowanie i od razu zatwierdź. Kopia musi mieć **to samo rozszerzenie i ten sam rozmiar** co oryginał — dowód, że passthrough zadziałał i nie było przekodowania.
3. **Avatar nadal kwadratowy.** Karta postaci, wgraj zdjęcie pionowe, zatwierdź bez ruszania ramki. Avatar musi być kwadratowy, nie rozciągnięty i nie pełnej wysokości.
4. **Zoom i przewijanie.** Mapa 6000 px, suwak na maksimum. Obraz ma się powiększyć, kontener ma dostać paski przewijania, a ramka postawiona po przewinięciu ma wyciąć ten fragment, który widać.
5. **EXIF.** Zdjęcie prosto z telefonu, w orientacji pionowej. Podgląd w kadrowniku i wynik po zatwierdzeniu muszą mieć tę samą orientację. To jedyny punkt, przed którym README biblioteki ostrzega wprost.

## Czego ten plan świadomie nie robi

- Nie dotyka czterech miejsc wywołania `ImageCropModal` — jego propsy się nie zmieniają.
- Nie wprowadza własnej warstwy abstrakcji nad kadrownikiem (decyzja D7 w specyfikacji).
- Nie wykrywa powrotu ramki do pełnego obrazu po wcześniejszym przeciągnięciu — `touched` nie wraca do `false` (świadome ograniczenie, opisane w D4).
- Nie zmienia `processImage`, presetów, pozostałych predykatów ani backendu.
