# PLAYRPG-263 — checkbox i select w kafelku karty custom

## Problem

Commit `c7d3ae0` wprowadził wspólny szkielet kafelka (`renderTile` w
`systems/custom/CustomSheetBody.jsx`) dla pól number, progress, computed, text, a później
`352b341` dla char_name/char_avatar/image. Dwa typy zostały poza nim:

- **`checkbox`** — brak ramki kafelka, natywny systemowy `<input type="checkbox">` bez stylu,
  nazwa obok kwadratu zamiast w wierszu nagłówka. W rzędzie z kafelkami nie trzyma linii nazw
  ani wartości.
- **`select`** — własny wrapper `.custom-sheet__field` bez ramki; `select` ~30px wysokości
  (padding 5px) zamiast 26px, `border-radius: 4px` zamiast 3px, `0.9rem` bezszeryfowy zamiast
  `Crimson Text 1rem`, natywna strzałka systemowa.

Świadomie poza zakresem: `label` (tekst szablonu, nie kontrolka), `attr` (medalion — osobny
design), checkbox rozwoju w tabeli/drzewie umiejętności (`.custom-sheet__skill-dev-check`).

## Rozwiązanie

### Checkbox

`renderTile(field, 'checkbox', …)` — ta sama anatomia co reszta: nazwa w `.custom-sheet__tile-head`
(przez `renderFieldLabel`, z tooltipem przy obcięciu), kwadrat w `.custom-sheet__tile-value`.

```
┌──────────────┐ ┌──────────────┐
│ WIEK         │ │ RANNY        │
│ ┌────┐       │ │ ┌──┐         │
│ │ 34 │       │ │ │✓ │         │
│ └────┘       │ │ └──┘         │
└──────────────┘ └──────────────┘
```

Wartość kafelka:

```jsx
<label className="custom-sheet__check">
  <input type="checkbox" className="custom-sheet__check-input" … />
  <CheckIcon className="custom-sheet__check-icon" aria-hidden="true" />
</label>
```

- Prawdziwy `<input>` z `appearance: none`, rysowany w CSS jako kwadrat 18px: tło `#fff9f0`,
  ramka `#c4a882`, radius 3px. Zaznaczony: tło i ramka `#c9975b`. Fokus (`:focus-visible`):
  ramka `#7a5c42`. Klawiatura, fokus, `disabled` i semantyka dostępności zostają natywne.
- Ptaszek: MUI `CheckIcon` (konwencja: ikony zawsze z `@mui/icons-material`), pozycjonowany
  absolutnie nad inputem, `pointer-events: none`, kolor `#fff9f0`, widoczny tylko gdy input
  `:checked` (selektor rodzeństwa `input:checked + .custom-sheet__check-icon`).
- `readOnly` → `disabled` (bez zmian względem dziś), `cursor: default`, bez efektu hover.
- Dane bez zmian: `attrs[key].base` 0/1, zapis przez `onChange.attr(key, 1|0)`.

### Select

`renderTile(field, 'select', …)`, wartość kafelka:

```jsx
<div className="custom-sheet__select-wrap">
  <select className="custom-sheet__select" …>…</select>
  <ArrowDropDownIcon className="custom-sheet__select-arrow" aria-hidden="true" />
</div>
```

- `.custom-sheet__select` dostaje wymiary `.custom-sheet__text-input`: `box-sizing: border-box`,
  `height: 26px`, `Crimson Text 1rem`, radius 3px, `appearance: none`, prawy padding na strzałkę.
- Strzałka: MUI `ArrowDropDownIcon` absolutnie po prawej, `pointer-events: none`, kolor `#7a5c42`.
  `disabled` → strzałka przygaszona.
- Dane bez zmian: `texts[key]`, zapis przez `onChange.text`.

### Sprzątanie CSS

- Usunąć `.custom-sheet__checkbox-label` (martwe po zmianie).
- Reguła `.custom-sheet__cell--rows-1 > .custom-sheet__field { justify-content: center; }`
  zostaje — nadal centruje pole `label` w jednowierszowej komórce — ale komentarz nad nią
  (mówiący o select i checkbox) trzeba poprawić.

### Kreator

`TemplateBuilder` montuje prawdziwy `CustomSheetBody`, więc kreator dostaje nowy wygląd bez
osobnej zmiany. Brak zmian backendu i i18n. `fieldRowSpan` bez zmian (oba typy już `ONE_ROW`).

## Testy

- Nowy test renderujący `CustomSheetBody` (`import '../../i18n';`):
  - checkbox renderuje `.custom-sheet__tile--checkbox` z nazwą w `.custom-sheet__tile-head`;
    kliknięcie woła `onChange.attr(key, 1)`, ponowne na zaznaczonym — `(key, 0)`;
    `readOnly` → input `disabled`.
  - select renderuje `.custom-sheet__tile--select` z nazwą w nagłówku; zmiana woła
    `onChange.text(key, value)`; `readOnly` → `disabled`.
- `CustomSheetBody.domShape.test.jsx.snap` zawiera oba pola — aktualizacja snapshotu jest
  oczekiwana i ma objąć **tylko** węzły checkbox i select (sprawdzić diff przed `-u`).
- Wygląd (wysokość 26px, wyrównanie linii z sąsiednimi kafelkami, kwadrat, strzałka) — jsdom nie
  liczy layoutu; weryfikacja ręczna w przeglądarce: karta w grze i kreator szablonu, rząd
  number + checkbox + select + text obok siebie, stan readOnly.
