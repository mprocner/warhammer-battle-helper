# Motywy wyglądu i tokeny

Spec: PLAYRPG-270. Tokeny i motyw `default` (PLAYRPG-346), zapis motywu gry i opt-out gracza
w backendzie (PLAYRPG-347), przełączanie, wybór w UI i ramki (PLAYRPG-348), motywy `scifi`
i `twenties` (PLAYRPG-349, 350). W UI motyw `default` nazywa się **Pergamin**.

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

### Przełączanie motywu

- **MG** wybiera motyw w zakładce Ogólne → **Wygląd** (`ThemePicker`, tylko MG). Zapis:
  `PATCH /games/:id/appearance` → `Game.Appearance.Theme` → broadcast
  `GAME_APPEARANCE_UPDATED` → każdy klient robi `fetchGameState()`. Bez stanu lokalnego, jak
  ustawienia mapy. Kafelki rysują podgląd **dosłownymi** kolorami z `THEMES[].swatch` — mają
  pokazać inny motyw niż aktywny, więc nie mogą być tokenami.
- **Gracz** (każdy, także MG) może się wypisać: `UserSettings.IgnoreGameTheme`, przełącznik
  w Ogólne i w `/settings` → Gra (`useAccountBooleanSetting('ignoreGameTheme')`).
- `GameSession` liczy `resolveTheme(gameState.appearance.theme, ignoreGameTheme)` (nieznane id,
  puste albo opt-out → `default`) i woła `useApplyTheme`.
- `useApplyTheme` ustawia `<html data-theme="…">` w `useLayoutEffect` i zdejmuje go przy
  odmontowaniu. **Na `<html>`, nie na korzeniu `GameSession`**: ~27 komponentów i dialogi MUI
  renderują przez `createPortal` do `document.body` — są rodzeństwem `#root`, nie dzieckiem
  widoku gry, więc klasa na jego `div` ich nie obejmie. Wewnątrz `<html>` są zawsze. `default`
  to goły `:root` — bez atrybutu. Lobby, landing, `/settings`, `/help` są zawsze w `default`,
  bo `GameSession` jest wtedy odmontowany.
- Rejestr: `src/theme/themes.js` (`THEMES`: id, swatch, `displayFont`, `loadFonts`). Id muszą
  się zgadzać z `models.GameThemes` w backendzie (test rejestru pilnuje listy).
- Czcionki motywów ładuje `loadFonts()` (dynamiczny `import()` paczek `@fontsource`) przy
  wejściu w grę z tym motywem i przy otwarciu `ThemePicker` — strona startowa ich nie pobiera.

### Ozdobniki ramek

`--frame-ornament` (default `none`) to dodatkowe warstwy tła z SVG w narożnikach. Powierzchnie
składają je w tej samej deklaracji co własne tło: `background: var(--frame-ornament), <tło>`.
Dziś: `.character-sheet-popup` (wspólny `DraggablePopup` — karty postaci, tracker walki i inne
pływające okna), `.right-panel`, `.note-editor`, `.handout-viewer`, `.confirm-modal` i
`MuiDialog.paper` w `theme.js`. Tooltipy, menu, przyciski — bez ozdobników.

Dlaczego warstwy tła: w CSS jest ~27 pseudo-elementów (np. `body::before`), nowe by się z nimi
gryzły; `border-image` wyłącza `border-radius`. Tło nie zmienia geometrii i nie łapie kliknięć.

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
- **Warstw canvas na mapie** (`DrawingLayer`, `FogLayer`, `MapRulerOverlay`): zaznaczenie,
  obrysy mgły i miarka leżą na obrazie mapy, nie na pergaminie — dobrane pod kontrast z dowolną
  mapą, która od motywu się nie zmienia. Dlatego nie czytają tokenów i nie przerysowują się
  przy zmianie motywu (decyzja PLAYRPG-348; spec zakładał odwrotnie).
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
- `src/theme/themes.js` — rejestr motywów; `src/theme/useApplyTheme.js` — `data-theme` na `<html>`
- `src/components/tabs/ThemePicker.jsx` — wybór MG; przełącznik opt-out w `GeneralTab`
  i `settings/GameSettings.jsx`
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
- **Modyfikator powierzchni z ramką, który deklaruje `background`,** zgubi ozdobnik, jeśli nie
  złoży go znowu (`var(--frame-ornament), …`). Ten sam problem z `background-attachment: local`
  w przewijanym kontenerze — narożniki przewinęłyby się z treścią.
- **Backend zna tylko id motywów.** Nowy motyw = id w `models.GameThemes` + blok CSS na froncie.
- **`#rrggbbaa` i `rgba()` na kolorze tła** zamieniają się w trójkę RGB, a nie w token rodziny —
  motyw musi nadpisać też `--c-*-rgb`, nie tylko kolory pełne.
