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

## Zachowanie

- **Label z lewej strony paska**, sam tekst (bez kropki koloru, bez chipa),
  wyrównany do prawej, obcięty `ellipsis` przy `max-width` w skali tokenu.
- Widoczny **tylko gdy token zaznaczony** (stack ma już modyfikator
  `token-hp-stack--expanded`). W spoczynku token pozostaje czysty.
- Pozycjonowany **absolutnie** `translateX(-100%)` na lewo od tracku — pasek się
  nie przesuwa (brak reflow), spójne z konwencją portal-tooltip (na lewo od
  elementu).
- **Tooltip** na hover paska pokazuje pełny `label` przez istniejący
  `usePortalTooltip`. Dostępny zawsze (spoczynek i zaznaczony).
- **Pusty label**: brak tekstu z lewej i brak tooltipa (żaden pusty box/hover).

## Zmiany w kodzie

### 1. `components/token-display/TokenRingChrome.jsx`
- `TokenHpBar` dostaje nowe propsy: `label`, `selected`, `showTooltip`, `hideTooltip`.
  - Renderuje `<span className="token-hp__label">{label}</span>` gdy `selected && label`.
  - Na `.token-hp__track` dodaje `onMouseEnter`/`onMouseLeave` odpalające tooltip,
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
- `.token-hp__label`: pozycja absolutna na lewo (`right: 100%` / `translateX(-100%)`),
  font w skali tokenu, `white-space: nowrap`, `overflow: hidden`,
  `text-overflow: ellipsis`, `max-width`, kolor dobrany pod istniejący `.token-hp`
  (jasny tekst na ciemnym pasku / z cieniem dla czytelności na mapie).

## Alternatywa odrzucona

Renderować label w wrapperach **poza** `TokenHpBar`. Gorsze: duplikacja w 3
miejscach; `TokenHpBar` jest współdzielonym miejscem na chrome paska — label idzie
tam, raz.

## Testy / weryfikacja

Manualna weryfikacja wizualna (frontend chrome, brak unit testów dla tej warstwy):

1. 1 pasek — label z lewej gdy zaznaczony.
2. Kilka pasków — każdy ma swój label, czytelnie rozróżnialne.
3. Długi label — `ellipsis` + pełny tekst w tooltipie.
4. Pusty label — brak boxa i brak tooltipa.
5. Widok gracza (baked `tokenView.bars`) — label widoczny.
6. Oba typy tokenów: image + character.
