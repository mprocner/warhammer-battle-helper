# FEATURE-143 — Magnetyczny snap obrotu obrazka co 45°

Data: 2026-07-27

## Cel

Podczas obrotu obrazka sceny obrót ma być swobodny, ale magnetycznie „łapać"
do kątów będących wielokrotnością 45° (0, 45, 90, 135, ...), gdy kursor znajdzie
się blisko takiego kąta. Ułatwia to MG szybkie ustawianie prostych orientacji
mapy/elementów bez precyzyjnego celowania.

## Zakres

Tylko frontend, tylko obrót obrazków sceny w `SceneImage.jsx`.

Poza zakresem:
- brak modyfikatora Shift (snap ma być domyślny i widoczny, nie ukryty)
- brak zmian backendu / WS / zapisu (`rotation` to i tak dowolny `number`)
- brak konfiguracji progu w UI

## Zachowanie

- Obrót płynny (jak obecnie) poza strefą snapu.
- W strefie ±10° od najbliższej wielokrotności 45° kąt skacze do tej
  wielokrotności — **na żywo** podczas przeciągania (obrazek widocznie przeskakuje
  pod kursorem), oraz przy zapisie po puszczeniu myszy.
- Raw kąt liczony zawsze z `startRotation + (currentAngle - startAngle)`, nigdy
  z wartości już zsnapowanej — dzięki temu nie ma efektu „przyklejenia": z każdej
  strefy da się wyjść, przesuwając dalej.
- Działa dla kątów ujemnych i > 360° (`Math.round` jest symetryczny).

**Kompromis:** w strefie snapu (np. 40–50°) nie da się ustawić kąta pośredniego
typu 42° — wpadnie w 45. Akceptowalne dla mapy bitewnej.

## Implementacja

Helper w osobnym module (modularność + testowalność):

Nowy plik: `warhammer-battle-helper-front/src/utils/angleSnap.js`

```js
export const SNAP_STEP = 45;
export const SNAP_THRESHOLD = 10;

export function snapAngle(angle, step = SNAP_STEP, threshold = SNAP_THRESHOLD) {
  const nearest = Math.round(angle / step) * step;
  return Math.abs(angle - nearest) <= threshold ? nearest : angle;
}
```

Import w `warhammer-battle-helper-front/src/components/scene/SceneImage.jsx`:

```js
import { snapAngle } from '../../utils/angleSnap';
```

Wpięcie w istniejący `useEffect` obsługujący rotację (`onMove` + `onUp`):

```js
// onMove — live
const raw = startRotation + (currentAngle - startAngle);
setRotation(snapAngle(raw));

// onUp — zapis
const raw = startRotation + (currentAngle - startAngle);
const finalRotation = snapAngle(raw);
setRotation(finalRotation);
justFinishedRotatingRef.current = true;
setIsRotating(false);
saveRotation(finalRotation);
```

## Testy

Jednostkowe dla `snapAngle` — nowy plik `utils/angleSnap.test.js`
(wzorzec jak istniejące `utils/tokenGeometry.test.js`):
- `snapAngle(43)` → `45`
- `snapAngle(30)` → `30` (|30-45|=15 > 10, |30-0|=30 > 10)
- `snapAngle(2)` → `0`
- `snapAngle(-43)` → `-45`
- `snapAngle(370)` → `360`
- `snapAngle(55)` → `45`
- `snapAngle(58)` → `58` (|58-45|=13 > 10)

Weryfikacja manualna: obrót obrazka w scenie, sprawdzenie live-snapu blisko
0/45/90 oraz swobody poza strefą.
