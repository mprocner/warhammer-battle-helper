# Motywy wyglądu i tokeny

Spec: PLAYRPG-270. Stan: tokeny i motyw `default` (PLAYRPG-346), zapis motywu gry
i opt-out gracza w backendzie (PLAYRPG-347). Przełączanie w UI, ramki z ozdobnikami
i motywy `scifi` / `twenties` — PLAYRPG-348…350.

## Jak to działa

### Tokeny zamiast wartości

Każda wartość, którą motyw może zmienić, pochodzi ze zmiennej CSS zdefiniowanej w
`src/theme/tokens.css` (importowanym w `src/index.js` przed wszystkimi arkuszami). Motyw
nadpisuje te zmienne w bloku `:root[data-theme="<id>"]`; komponenty nie wiedzą o motywach.

Tokeny są **semantyczne według rodziny właściwości CSS**, nie według wartości:

| Rodzina | Właściwości | Przykłady |
|---|---|---|
| tekst | `color`, `fill`, `stroke`, `caret-color` | `--c-text`, `--c-heading`, `--c-label`, `--c-text-on-dark`, `--c-text-danger` |
| powierzchnie | `background*` | `--c-surface`, `--c-surface-alt`, `--c-input-bg`, `--c-accent-bg`, `--c-leather-bg` |
| ramki | `border*`, `outline*`, `scrollbar-color` | `--c-border`, `--c-border-strong`, `--c-border-accent` |

Dlaczego rodziny: ten sam `#f4e8d8` jest tłem panelu (`background`) i tekstem na ciemnym
przycisku (`color`). W motywie ciemnym pierwszy musi ściemnieć, a drugi zostać jasny —
jeden token na wartość by tego nie wyraził.

Pozostałe tokeny:

- **Przezroczystość** — trójki RGB: `rgb(var(--c-accent-rgb) / 0.3)`. Nie `color-mix()`,
  nie `rgba(var())`.
- **Cienie** — alfa cieni rozmytych mnożona przez `--shadow-k` (default `1`, motyw płaski `0`):
  `rgb(var(--c-shadow-rgb) / calc(0.2 * var(--shadow-k)))`. Pierścienie bez rozmycia
  (`0 0 0 2px`, focus) **nie** mają mnożnika — motyw bez cieni nie może zabrać obwódki focus.
- **Rozstrzelenie liter** — `calc(0.05em * var(--tracking-k))`.
- **Wersaliki** — reguły z `--font-display` bez własnego `text-transform` mają
  `text-transform: var(--display-transform)` (default `none`; Cinzel i tak ma same kapitaliki).
- **Zaokrąglenia** — skala `--radius-xs`…`--radius-pill` (2/3/4/6/8/12/20 px); `0`, `50%` zostają.
- **Czcionki** — `--font-display` (Cinzel), `--font-body` (Crimson Text), `--font-ui` (Roboto).
  Stałe w JS (`lobbyStyles.js`) też wskazują na tokeny.
- **Tekstura tła** — `--bg-texture` (szum pergaminu na `body`).
- **Wyniki rzutów** — paleta `--log-*` (złoto krytyka, zieleń sukcesu, czerwień porażki,
  fiolet fumble, „żar” nowej wiadomości). Czytana też z JS: `ToastStack`, `log/rollUtils`.

### MUI

`src/theme.js` ma `cssVariables: true`. Paleta zostaje w hex — MUI liczy z niej w JS kanały
i kontrast (`alpha()`, `contrastText`), a string `var(--…)` by to wysadził. MUI publikuje
paletę jako `--mui-palette-*` na `:root`, więc blok motywu może ją nadpisać. `styleOverrides`
i `typography` używają naszych tokenów bezpośrednio.

### Czego tokeny nie obejmują

- **Wymiarów**: padding, margin, gap, width/height, font-size, line-height, border-width.
  Szerokość karty z kreatora, wysokości kafelków z `--sheet-row-unit` i kotwice samouczka
  zależą od stałej geometrii. Motyw zmienia, *jak* coś wygląda, nigdy *ile miejsca zajmuje*.
- **Kolorów treści**: palety pasków HP (`BAR_COLORS`, `PRESET_COLORS`), domyślne kolory
  pasków zapisywane w danych, paleta etykiet kreatora (`LABEL_COLORS`), kolory rysunków,
  uczestników, rich textu, kości 3D. Codemod by je zepsuł — przegląd był ręczny.
- **Samouczka** (`TourRunner`) — `react-joyride` wpisuje `stroke` spotlightu w atrybut SVG,
  gdzie `var()` nie działa.

### Strażnik

`src/theme/noRawStyleValues.test.js` przechodzi wszystkie `src/**/*.css` (poza `tokens.css`):

1. brak hex, `rgb()`/`rgba()` z liczbami, `white`/`black` we właściwościach kolorów, gołych px
   w `border-radius`, `letter-spacing` bez `var()`, czcionek Cinzel/Crimson/Roboto;
2. każdy `var(--x)` bez fallbacku jest gdzieś zdefiniowany (w CSS albo jako `'--x'` w JS).

Punkt 2 łapie literówkę w nazwie tokena — taka deklaracja jest nieważna w czasie liczenia
stylu i po cichu spada do `transparent` / wartości początkowej. Złapał to już raz w trakcie
migracji (tokeny dodane do palety, `tokens.css` nie wygenerowany ponownie).

## Kluczowe pliki

- `src/theme/tokens.css` — motyw default (jedyne miejsce z surowymi wartościami)
- `src/theme/noRawStyleValues.test.js` — strażnik
- `src/theme.js` — MUI w trybie `cssVariables`
- backend: `internal/models/appearance.go` (lista id motywów, `Game.Appearance`),
  `PATCH /games/:id/appearance` (tylko MG, event `GAME_APPEARANCE_UPDATED`),
  `UserSettings.IgnoreGameTheme` (opt-out gracza)

## Pułapki

- **Nowy kolor w CSS = token.** Strażnik wywali test na hex. Jeśli żaden token nie pasuje do
  roli, dodaj go do `tokens.css` (i do każdego motywu), zamiast wpisywać wartość.
- **Migracja przyciągnęła kolory do najbliższego tokena tej samej rodziny** (decyzja
  2026-11-11: „bez zauważalnej zmiany”, nie co do piksela). Rzadkie odcienie (~290) zlały się
  z sąsiednimi; gradienty dostały różne tokeny na przystankach, chyba że zmieniłoby to barwę —
  wtedy gradient jest płaski.
- **Backend zna tylko id motywów.** Nowy motyw = id w `models.GameThemes` + blok CSS na froncie.
- **`#rrggbbaa` i `rgba()` na kolorze tła** zamieniają się w trójkę RGB, a nie w token rodziny —
  motyw musi nadpisać też `--c-*-rgb`, nie tylko kolory pełne.
