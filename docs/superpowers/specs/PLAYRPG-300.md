# PLAYRPG-300 — Jednolity nagłówek zakładek w grze

## Cel

Każda zakładka prawego panelu (chat, sceny, handouty, pliki, muzyka, notatki, gracze, minigry,
ogólne) ma własną kopię nagłówka: markup i CSS skopiowane 9×. Siedem wygląda tak samo, ale
różni się odstępem pod spodem; Chat i Ogólne odstają stylem; przyciski akcji w nagłówku mają
dwa warianty. Po przełączeniu zakładki nagłówek ma wyglądać identycznie.

## Decyzje

| Temat | Decyzja |
|---|---|
| Mechanizm | Wspólny komponent `components/tabs/TabHeader.jsx` + reguły `.tab-header*` w `style.css`. Stare reguły `__header` / `__title` / `__header-group` każdej zakładki usunięte. |
| API | `<TabHeader title tourId className>{akcje}</TabHeader>` → `.tab-header` > `h3.tab-header__title` + `.tab-header__actions` (children, potem `TourButton tourId`). `className` dokleja klasę do korzenia. |
| Styl nagłówka | Większościowy: Cinzel 14px 600, uppercase, `letter-spacing: 0.5px`, `#6b4423`; `padding-bottom: 10px`, `border-bottom: 1px dashed #c9975b`, `margin-bottom: 12px`, `flex-shrink: 0`; flex `space-between`, `gap: 8px`. |
| Przycisk akcji | `.tab-header__btn`: `AddIcon fontSize="small"` + tekst, 11px, padding 6×8, `white-space: nowrap`, wysokość 36px. Sceny, Pliki, Handouty: tekstowy `+` → `AddIcon`. |
| Wysokość | `.tab-header__title` ma `min-height: 36px` (wysokość przycisku) — nagłówki bez przycisku są tak samo wysokie (47px z linią). |
| Chat | `.log-window` nie ma paddingu → `TabHeader className="log-window__header"`, która dodaje `padding: 12px 12px 10px` — górne 12px to padding, który innym zakładkom daje kontener, więc linia wypada na tej samej wysokości. Ciągła brązowa linia i 0.95rem bez uppercase znikają. |
| Ogólne | Złoty 1rem bez linii → standard. |
| Odstęp w kontenerach z `gap` | Muzyka, Gracze (16px), Ogólne (20px), Minigry (8px) mają `gap`. Tam `.music-tab > .tab-header` (itd.) `{ margin-bottom: 0 }` — odstęp daje sam `gap`. Gap kontenerów bez zmian. |
| Kaskada | Nadpisania `.tab-header` w CSS zakładek mają specyficzność ≥ 0,2,0 (`.x > .tab-header`, `.tab-header.log-window__header`), bo kolejność arkuszy nie jest gwarantowana. |
| Handouty — układ | Dwa przyciski MG i ikona pomocy w jednym rzędzie z tytułem, bez zawijania. Pełne etykiety (~419px) nie mieszczą się w 322px, więc nagłówek używa krótkich: `handouts.addHandoutShort` = „Handout”, `handouts.folders.createFolder` = „Folder” (klucz używany tylko tu). `handouts.addHandout` zostaje dla przycisku w sekcji folderu. Odstęp przycisków 4px, `.tab-header__actions` 6px — zmierzone: mieści się bez zapasu (322/322px). |
| Padding kontenerów | Bez zmian (12 vs 16px) — poza zakresem. |

## Kotwice tutoriala i testów

Klasy zakładek używane jako selektory zostają jako kotwice (bez CSS) albo dostają nową, unikalną:

- `.notes-tab__add-btn` (tour notes) — zostaje na przycisku obok `tab-header__btn`; CSS usunięty.
- `.handouts-tab__header-actions` (tour handouts) — zostaje jako wrapper dwóch przycisków MG
  wewnątrz children (z regułą flex-row + wrap); `.handouts-tab__add-btn` zostaje na przyciskach
  (używa go `HandoutsTab.wsRace.test.jsx`, bierze pierwszy = „Dodaj handout”) — jego CSS usunięty.
  Martwe przy okazji: `.handouts-tab__add-btn--folder` (brak użyć), `.handouts-tab__header-group`,
  `.right-panel__tab-content .log-window__header { border-radius: 0 }`.
- `.scenes-tab__btn` (tour scenes) — klasa jest współdzielona z przyciskami `--sm` w ustawieniach
  sceny, więc CSS zostaje. Przycisk w nagłówku dostaje kotwicę `scenes-tab__create-btn`, tour
  `scenes.js` celuje w nią.
- `.files-tab__actions` (tour files) — wrapper akcji to teraz wspólny `.tab-header__actions`.
  Przycisk dostaje kotwicę `files-tab__create-folder-btn`, tour `files.js` celuje w nią; reguły
  `files-tab__actions` / `files-tab__btn` usunięte.
- `music-tab__add-btn`, `general-tab__actions` — należą do sekcji, nie nagłówka; bez zmian.

Teksty kroków się nie zmieniają (ten sam element, ta sama treść).

## Testy

- `TabHeader.test.jsx`: renderuje tytuł w `h3`, children w `.tab-header__actions`, `TourButton`
  dla podanego `tourId`, dokleja `className`.
- Istniejące: testy tutorialu (`creatorTour.coverage`, `tourTranslations`, testy tours), handouts
  (`wsRace`, `reopen`) i cała suita frontu. Baseline fail `App.test.js` nie jest regresją.
- Wygląd — tylko w przeglądarce (brak layoutu w jsdom): przełączenie po wszystkich 9 zakładkach
  jako MG.

## Poza zakresem

- Padding kontenerów zakładek, nagłówki sekcji wewnątrz zakładek (`__section-title`,
  `__section-header`), nagłówek `MinigameSetup`.
