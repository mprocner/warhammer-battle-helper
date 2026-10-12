# PLAYRPG-263 Checkbox i select w kafelku — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pola `checkbox` i `select` karty custom renderują się we wspólnym szkielecie kafelka (`renderTile`) i wyglądają jak reszta pól (number, text).

**Architecture:** Zmiana tylko we froncie: dwa `case` w `renderField` (`CustomSheetBody.jsx`) przechodzą na `renderTile`, a `style.css` dostaje własny kwadrat checkboxa (natywny input z `appearance: none` + MUI `CheckIcon`) i select o wymiarach text-inputu (26px, `appearance: none` + MUI `ArrowDropDownIcon`). Dane i zapis bez zmian. Spec: `docs/superpowers/specs/PLAYRPG-263.md`.

**Tech Stack:** React, `@mui/icons-material`, CSS BEM w `src/style.css`, Jest + Testing Library (CRA).

## Global Constraints

- Komentarze w kodzie po angielsku.
- Ikony wyłącznie z `@mui/icons-material`; rozmiar ikony MUI przez `style={{ fontSize }}`, nie przez klasę CSS (emotion wygrywa z `style.css` dla właściwości, które sam ustawia: width/height/font-size).
- Kolory karty: tło inputu `#fff9f0`, tekst `#3a2f1f`, ramka `#c4a882`, ramka focus `#7a5c42`, akcent `#c9975b`.
- Dane bez zmian: checkbox = `attrs[key].base` 0/1 przez `onChange.attr(key, 1|0)`; select = `texts[key]` przez `onChange.text(key, value)`.
- `readOnly` (= `!onChange`) → input/select `disabled`.
- Testy: `CI=true npm test -- --watchAll=false --testPathPattern=<nazwa>` z `warhammer-battle-helper-front/`. Znany baseline fail: `App.test.js` (axios ESM).
- Pracujemy na `main`, bez worktree.

---

### Task 1: Checkbox i select w `renderTile` (JSX + testy + snapshot)

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (importy na górze; `case 'checkbox'` i `case 'select'` ok. linii 398–429; komentarz nad `renderTile` ok. linii 181)
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.tiles.test.jsx`
- Snapshot: `warhammer-battle-helper-front/src/systems/custom/__snapshots__/CustomSheetBody.domShape.test.jsx.snap`

**Interfaces:**
- Produces (klasy, których Task 2 używa w CSS): `.custom-sheet__tile--checkbox`, `.custom-sheet__check`, `.custom-sheet__check-input`, `.custom-sheet__check-icon`, `.custom-sheet__tile--select`, `.custom-sheet__select-wrap`, `.custom-sheet__select`, `.custom-sheet__select-arrow`. DOM: ikona checkboxa jest **bezpośrednim następnym rodzeństwem** inputu; strzałka jest bezpośrednim następnym rodzeństwem `<select>`.

- [ ] **Step 1: Write the failing tests**

Na górze `CustomSheetBody.tiles.test.jsx` zmień import:

```jsx
import { render, fireEvent } from '@testing-library/react';
```

Dopisz na końcu pliku:

```jsx
const choiceSections = [{
  id: 's', title: '', columns: 2, fields: [
    { key: 'wounded', type: 'checkbox', label: 'Wounded' },
    { key: 'race', type: 'select', label: 'Species', options: ['Human', 'Elf'] },
  ],
}];

const editable = () => ({ attr: jest.fn(), text: jest.fn() });

test('checkbox and select share the tile skeleton with their name in the head', () => {
  const { container } = render(<CustomSheetBody sections={choiceSections} />);
  const check = container.querySelector('.custom-sheet__tile--checkbox');
  const select = container.querySelector('.custom-sheet__tile--select');
  [[check, 'Wounded'], [select, 'Species']].forEach(([tile, name]) => {
    expect(tile.children[0].classList.contains('custom-sheet__tile-head')).toBe(true);
    expect(tile.children[0].textContent).toBe(name);
    expect(tile.children[1].classList.contains('custom-sheet__tile-value')).toBe(true);
  });
});

// The icon is drawn over the real input and shown by `input:checked + icon` in CSS, so it must
// stay the input's immediate next sibling.
test('the checkbox draws its tick as the input\'s next sibling', () => {
  const { container } = render(<CustomSheetBody sections={choiceSections} />);
  const input = container.querySelector('.custom-sheet__check-input');
  expect(input.type).toBe('checkbox');
  expect(input.nextElementSibling.classList.contains('custom-sheet__check-icon')).toBe(true);
});

test('ticking the checkbox stores 1, unticking stores 0', () => {
  const onChange = editable();
  const { container, rerender } = render(<CustomSheetBody sections={choiceSections} onChange={onChange} />);
  fireEvent.click(container.querySelector('.custom-sheet__check-input'));
  expect(onChange.attr).toHaveBeenLastCalledWith('wounded', 1);

  rerender(
    <CustomSheetBody sections={choiceSections} onChange={onChange} values={{ attributes: { wounded: { base: 1 } } }} />
  );
  expect(container.querySelector('.custom-sheet__check-input')).toBeChecked();
  fireEvent.click(container.querySelector('.custom-sheet__check-input'));
  expect(onChange.attr).toHaveBeenLastCalledWith('wounded', 0);
});

test('choosing an option stores its text', () => {
  const onChange = editable();
  const { container } = render(<CustomSheetBody sections={choiceSections} onChange={onChange} />);
  fireEvent.change(container.querySelector('.custom-sheet__select'), { target: { value: 'Elf' } });
  expect(onChange.text).toHaveBeenCalledWith('race', 'Elf');
});

test('a read-only sheet disables both controls', () => {
  const { container } = render(<CustomSheetBody sections={choiceSections} />);
  expect(container.querySelector('.custom-sheet__check-input')).toBeDisabled();
  expect(container.querySelector('.custom-sheet__select')).toBeDisabled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (z `warhammer-battle-helper-front/`): `CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.tiles`
Expected: 5 nowych testów FAIL (np. `Cannot read properties of null (reading 'children')` / `reading 'type'`); 6 istniejących PASS.

- [ ] **Step 3: Implement**

W `CustomSheetBody.jsx` dopisz importy obok pozostałych ikon:

```jsx
import CheckIcon from '@mui/icons-material/Check';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
```

Zamień komentarz nad `renderTile`:

```jsx
  // renderTile is the shared skeleton of every value field (number, progress, computed, text,
  // image, checkbox, select): a head row (name + icon slot), a value row of fixed minimum
  // height, and an optional strip along the bottom edge. One anatomy for all of them is what
  // lets them sit side by side in a grid row with names and values on the same lines; the type
  // only decides what fills the value row.
```

Zamień cały `case 'checkbox'` i `case 'select'` na:

```jsx
      // A real checkbox input, restyled with `appearance: none`: focus, the keyboard and
      // `disabled` stay native. The tick is drawn over it and shown by CSS when it is checked.
      case 'checkbox':
        return renderTile(field, 'checkbox', (
          <label className="custom-sheet__check">
            <input
              type="checkbox"
              className="custom-sheet__check-input"
              checked={!!(attrs[field.key]?.base)}
              onChange={onChange ? e => onChange.attr(field.key, e.target.checked ? 1 : 0) : undefined}
              disabled={readOnly}
            />
            <CheckIcon className="custom-sheet__check-icon" style={{ fontSize: 14 }} aria-hidden="true" />
          </label>
        ));

      case 'select':
        return renderTile(field, 'select', (
          <div className="custom-sheet__select-wrap">
            <select
              className="custom-sheet__select"
              value={texts[field.key] || ''}
              onChange={onChange ? e => onChange.text(field.key, e.target.value) : undefined}
              disabled={readOnly}
            >
              <option value="">—</option>
              {(field.options || []).map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <ArrowDropDownIcon className="custom-sheet__select-arrow" style={{ fontSize: 20 }} aria-hidden="true" />
          </div>
        ));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.tiles`
Expected: wszystkie 11 PASS.

- [ ] **Step 5: Check the DOM-shape snapshot diff, then update it**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.domShape`
Expected: 2 FAIL (`read-only render` i `session render`). Przejrzyj diff: zmienić mogą się **wyłącznie** fragmenty `custom-sheet__field--checkbox` (`Martwy`) i `custom-sheet__field--select` (`Rasa`), zastąpione przez `custom-sheet__tile custom-sheet__tile--checkbox` / `--select`. Jakakolwiek inna zmiana = błąd w Step 3, nie aktualizuj.

Następnie: `CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.domShape -u`
Expected: 2 snapshots updated, PASS.

- [ ] **Step 6: Run the custom-system suite**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=systems/custom`
Expected: wszystko PASS.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx \
        warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.tiles.test.jsx \
        warhammer-battle-helper-front/src/systems/custom/__snapshots__/CustomSheetBody.domShape.test.jsx.snap
git commit -m "feat: PLAYRPG-263 checkbox and select fields in the sheet tile"
```

---

### Task 2: Style kwadratu checkboxa i selecta + sprzątanie CSS

**Files:**
- Modify: `warhammer-battle-helper-front/src/style.css` — blok `.custom-sheet__select` / `.custom-sheet__select option` (ok. linii 8447–8460), blok `.custom-sheet__checkbox-label` (ok. 8484–8491), komentarz nad `.custom-sheet__cell--rows-1 > .custom-sheet__field` (ok. 8132)

**Interfaces:**
- Consumes: klasy i struktura DOM z Task 1 (patrz „Produces" w Task 1).

- [ ] **Step 1: Replace the select block**

Zamień istniejące reguły `.custom-sheet__select { … }` i `.custom-sheet__select option { … }` na:

```css
/* Same box as .custom-sheet__text-input so a select lines up with the text tiles beside it.
   The native arrow is replaced by an icon so it looks the same on every system. */
.custom-sheet__select-wrap {
    position: relative;
    width: 100%;
    min-width: 0;
}

.custom-sheet__select {
    box-sizing: border-box;
    width: 100%;
    height: 26px;
    padding: 2px 22px 2px 6px;
    appearance: none;
    -webkit-appearance: none;
    background: #fff9f0;
    border: 1px solid #c4a882;
    border-radius: 3px;
    color: #3a2f1f;
    font-family: 'Crimson Text', serif;
    font-size: 1rem;
    text-overflow: ellipsis;
    cursor: pointer;
    transition: border-color 0.15s;
}

/* A read-only sheet keeps the value readable instead of the browser's greyed-out disabled
   look, like the read-only text inputs beside it. */
.custom-sheet__select:disabled {
    color: #3a2f1f;
    opacity: 1;
    cursor: default;
}

.custom-sheet__select option {
    background: #fff9f0;
    color: #3a2f1f;
}

.custom-sheet__select-arrow {
    position: absolute;
    top: 50%;
    right: 2px;
    transform: translateY(-50%);
    color: #7a5c42;
    pointer-events: none;
}

.custom-sheet__select:disabled + .custom-sheet__select-arrow {
    opacity: 0.4;
}
```

Wspólna reguła `.custom-sheet__text-input:focus, .custom-sheet__select:focus, .custom-sheet__textarea:focus` zostaje bez zmian (ramka `#7a5c42`).

- [ ] **Step 2: Replace the checkbox-label block**

Usuń całą regułę `.custom-sheet__checkbox-label { … }` i w jej miejscu wstaw:

```css
/* A real checkbox input drawn by CSS (`appearance: none`); the tick icon sits over it and is
   shown only when the input is checked. */
.custom-sheet__check {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;
    width: 18px;
    height: 18px;
}

.custom-sheet__check-input {
    appearance: none;
    -webkit-appearance: none;
    box-sizing: border-box;
    width: 18px;
    height: 18px;
    margin: 0;
    background: #fff9f0;
    border: 1px solid #c4a882;
    border-radius: 3px;
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s;
}

.custom-sheet__check-input:hover:not(:disabled) {
    border-color: #7a5c42;
}

.custom-sheet__check-input:checked {
    background: #c9975b;
    border-color: #c9975b;
}

.custom-sheet__check-input:focus-visible {
    outline: none;
    border-color: #7a5c42;
    box-shadow: 0 0 0 2px rgba(122, 92, 66, 0.25);
}

.custom-sheet__check-input:disabled {
    cursor: default;
}

.custom-sheet__check-icon {
    position: absolute;
    top: 2px;
    left: 2px;
    color: #fff9f0;
    pointer-events: none;
    visibility: hidden;
}

.custom-sheet__check-input:checked + .custom-sheet__check-icon {
    visibility: visible;
}
```

- [ ] **Step 3: Fix the stale comment over the one-row centring rule**

Zamień komentarz nad `.custom-sheet__cell--rows-1 > .custom-sheet__field {`:

```css
/* A label field is shorter than a value tile; in a one-row cell it sits in its middle so a row
   of mixed fields reads as one line. */
```

- [ ] **Step 4: Verify no dead references remain**

Run (z `warhammer-battle-helper-front/`): `grep -rn "checkbox-label\|field--checkbox\|field--select" src`
Expected: brak wyników.

- [ ] **Step 5: Run the custom-system suite**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=systems/custom`
Expected: wszystko PASS (CSS nie wpływa na jsdom; to kontrola, że nic nie popsuto przy okazji).

- [ ] **Step 6: Manual browser check**

jsdom nie liczy layoutu — sprawdź w przeglądarce (lokalny stack docker, `:3000`):
1. Kreator szablonu: sekcja 4-kolumnowa z number, checkbox, select, text_short obok siebie — nazwy na jednej linii, wartości na jednej linii, wszystkie kafelki tej samej wysokości.
2. Kwadrat 18px wyśrodkowany pionowo w wierszu wartości; ptaszek biały na złotym po zaznaczeniu; Tab daje widoczny fokus, spacja przełącza.
3. Select 26px, czcionka jak text-input, strzałka MUI po prawej, długa opcja ucina się wielokropkiem przed strzałką.
4. Karta w trybie podglądu (readOnly): select czytelny (nie wyszarzony), strzałka przygaszona, checkbox bez hover.
5. Wąska komórka (sekcja zagnieżdżona): select nie wylewa się poza kafelek.

Jeśli którykolwiek punkt nie przejdzie — popraw CSS przed commitem.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/style.css
git commit -m "feat: PLAYRPG-263 tile styling for sheet checkbox and select"
```
