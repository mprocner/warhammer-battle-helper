# FEATURE-144 — labele pasków HP/zasobów na tokenie

Data: 2026-07-24

## Problem

Token (image i character) może mieć kilka pasków (HP, zbroja, itp.). Label paska
wpisywany jest w kreatorze i w popupie gear, ale **nie jest pokazywany na widoku
paska na mapie**. Przy kilku paskach nie widać który jest który.

## Cel

Pokazać label paska na tokenie, dla obu typów (image + character) i obu ścieżek
widoku (live GM oraz baked player).

## Zakres

Czysto **frontend**. Dane już płyną:

- `bar.label` zapisywany przez kreator i popup gear.
- Backend baked `models.TokenViewBar` niesie `Label`
  (`internal/service/token_masking.go:124`), więc gracz też go dostaje.
- Paski ukryte (`hidden`) są już wycinane z baku dla gracza — label ukrytego
  paska nie wycieka.

Brak zmian w backendzie, modelu, i18n (label = dane użytkownika, nie klucz t()).

## Zachowanie (hybryda — label WEWNĄTRZ tracku)

- Label renderowany **wewnątrz tracku paska**, z lewej; aktualna wartość
  (`current / max`) dosunięta do prawej. Jeden flex-row nad wypełnieniem
  (kontrast jak dziś przez `text-shadow` na `.token-hp__text`).
- Widoczny **tylko gdy token zaznaczony** (stack ma już modyfikator
  `token-hp-stack--expanded` → track szerszy, jest miejsce na label).
- **W spoczynku** (nie zaznaczony): jak dziś — sama wartość wyśrodkowana, bez
  labela. Token pozostaje czysty.
- **Overflow**: label ma priorytet niższy — obcinany `ellipsis`
  (`flex-shrink`); wartość zawsze pełna (`flex-shrink: 0`).
- **Tooltip** na hover paska pokazuje pełny `label` przez istniejący
  `usePortalTooltip`. Dostępny zawsze (spoczynek i zaznaczony) — dla urwanych
  labeli.
- **Pusty label**: brak tekstu z lewej (wartość wyśrodkowana jak w spoczynku)
  i brak tooltipa.

Odrzucone (wcześniejszy wariant): label jako **absolutna kolumna z lewej**
(`translateX(-100%)`) poza trackiem. Zamiast tego label żyje w tracku — prostszy
CSS, brak pytania o reflow, label i wartość w jednym miejscu.

## Zmiany w kodzie

### 1. `components/token-display/TokenRingChrome.jsx`
- `TokenHpBar` dostaje nowe propsy: `label`, `selected`, `showTooltip`, `hideTooltip`.
  - Wewnątrz `.token-hp__track`: gdy `selected && label` → dwa spany w flex-row —
    `<span className="token-hp__label">{label}</span>` (lewo, ellipsis) oraz
    istniejący `<span className="token-hp__text">` (prawo, wartość). W przeciwnym
    razie sam `.token-hp__text` wyśrodkowany (jak dziś).
  - Track dostaje modyfikator (np. `token-hp__track--labeled`) sterujący
    `justify-content: space-between` gdy label obecny.
  - Na `.token-hp__track` `onMouseEnter`/`onMouseLeave` odpalające tooltip,
    tylko gdy `label` niepuste.
- `renderHp` wołane jako `renderHp({ showTooltip, hideTooltip })` — analogicznie do
  istniejącego `renderExtras` (dziś `renderHp()` bez argumentów).

### 2. Wrappery — przekazanie propsów do `TokenHpBar`
- `components/token-display/TokenOverlay.jsx` — **2 ścieżki**:
  - player baked: `tokenView.bars`
  - GM live: `composedBars`
- `components/token-display/ImageTokenOverlay.jsx` — **1 ścieżka**: `bars`
- Każda: `label={bar.label}`, `selected={selected}`, plus `showTooltip`/`hideTooltip`
  z argumentu `renderHp`.

### 3. `style.css`
- `.token-hp__track--labeled`: `justify-content: space-between` (label lewo,
  wartość prawo). Bazowy `.token-hp__track` bez labela zostaje jak dziś
  (wartość wyśrodkowana).
- `.token-hp__label`: font w skali tokenu, `white-space: nowrap`,
  `overflow: hidden`, `text-overflow: ellipsis`, `min-width: 0`, `flex: 0 1 auto`
  (ellipsis), `text-shadow` jak `.token-hp__text` dla czytelności nad wypełnieniem.
- `.token-hp__text` w trybie labeled: `flex: 0 0 auto` — wartość ma priorytet,
  nigdy nie obcinana.

## Alternatywy odrzucone

- Label w wrapperach **poza** `TokenHpBar`: duplikacja w 3 miejscach;
  `TokenHpBar` jest współdzielonym miejscem na chrome paska — label idzie tam, raz.
- Label jako **absolutna kolumna z lewej tracku**: więcej CSS, pytanie o reflow;
  hybryda (label w tracku) prostsza.

## Testy / weryfikacja

Manualna weryfikacja wizualna (frontend chrome, brak unit testów dla tej warstwy):

1. 1 pasek — label z lewej gdy zaznaczony.
2. Kilka pasków — każdy ma swój label, czytelnie rozróżnialne.
3. Długi label — `ellipsis` + pełny tekst w tooltipie.
4. Pusty label — brak boxa i brak tooltipa.
5. Widok gracza (baked `tokenView.bars`) — label widoczny.
6. Oba typy tokenów: image + character.
