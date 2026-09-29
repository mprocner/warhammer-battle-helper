# FEATURE-219 — Skórka tabeli umiejętności — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pole `skill_table` w karcie custom dostaje wygląd tabeli (pasek nagłówkowy, linie poziome, zebra, Suma wyróżniona typografią) i zostaje wyprowadzone z `CustomSheetBody.jsx` do własnych komponentów.

**Architecture:** Trzy nowe komponenty w `systems/custom/fields/` (`SkillTable`, `SkillTableHeader`, `SkillTableRow`) plus `keys.js` z `genId`. `CustomSheetBody` zostaje właścicielem stanu współdzielonego (`editingPath`) i polityki afordancji (`showStar`/`showRoll`/`showActions` plus render-propsy `renderStar`/`renderRoll`); tabela dostaje resztę. Cała arytmetyka układu zostaje w `skillLayout.js` — bez zmian.

**Tech Stack:** React 18, `react-i18next`, MUI Icons, CRA + Jest + React Testing Library, jeden globalny `style.css` (BEM).

**Spec:** `docs/superpowers/specs/FEATURE-219.md`

## Global Constraints

- Komentarze w kodzie **zawsze po angielsku** (backend i frontend). Dokumentacja i commity opisowe po polsku/angielsku jak dotychczas w repo; ten plan i spec po polsku.
- Żadnych stringów wprost w JSX — każdy tekst przez `t('klucz')`, klucze angielskie, tłumaczenia w `locales/en` **i** `locales/pl`.
- Ikony wyłącznie z `@mui/icons-material`.
- Nazwy klas CSS w karcie custom: prefiks `custom-sheet__`. Żadnych nowych `coc-*`.
- Paleta karty (jasne tło): tekst `#3a2f1f`, etykiety `#7a5c42`, akcent `#c9975b`, tło inputu `#fff9f0`, ramka `#c4a882`.
- **Modyfikator CSS musi stać w pliku ZA regułą bazową o tej samej specyficzności** — inaczej jest martwy (CLAUDE.md).
- Uruchamianie testów wyłącznie przez CRA, z katalogu `warhammer-battle-helper-front/`:
  `CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody`
  Gołe `npx jest` **nie działa**. Znany baseline fail całego pakietu: `App.test.js` (axios ESM) — to nie regresja.
- Nie ruszamy `skill_tree` ani `weapons_table` poza przemianowaniem klasy gwiazdki (Task 1).

## Struktura plików

| Plik | Odpowiedzialność |
|---|---|
| `systems/custom/fields/keys.js` | **nowy** — `genId(prefix)`, mennica kluczy zastępczych |
| `systems/custom/fields/SkillTableHeader.jsx` | **nowy** — pasek nagłówkowy jednej kolumny tabeli |
| `systems/custom/fields/SkillTableRow.jsx` | **nowy** — jeden wiersz, z trybem edycji nazwy |
| `systems/custom/fields/SkillTable.jsx` | **nowy** — kontener: wiersze, dwie kolumny, dodawanie/rename/kasowanie, przycisk „+" |
| `systems/custom/CustomSheetBody.jsx` | **modyfikowany** — `case 'skill_table'` kurczy się do wywołania `<SkillTable>`; `starAffordance` i `weapons_table` dostają nową nazwę klasy |
| `systems/custom/skillLayout.js` | **bez zmian** |
| `style.css` | **modyfikowany** — sekcja `custom-sheet`, bloki tabeli + nowy blok gwiazdki |
| `locales/{en,pl}/translation.json` | **modyfikowany** — `customSheet.name`, `customSheet.value` |

Kolejność zadań: najpierw mechaniczna zamiana nazwy (1), potem zmiana kształtu DOM (2), potem ekstrakcja przy zamrożonym DOM (3–5), na końcu CSS (6) i weryfikacja ręczna (7). CSS pisany jako ostatni, bo dopiero wtedy markup jest ostateczny.

---

### Task 1: Gwiazdka pod własną nazwą

Zamiana `coc-star-btn` → `custom-sheet__star-btn` we wszystkich czterech miejscach karty custom. Blok CoC zostaje nietknięty — karta CoC nadal go używa.

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx:257,267,1022,1054`
- Modify: `warhammer-battle-helper-front/src/style.css` (nowy blok w sekcji `custom-sheet`, ok. linii 8287)
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTable.test.jsx`
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.domShape.test.jsx` (+ snapshot)

**Interfaces:**
- Consumes: nic.
- Produces: klasa `custom-sheet__star-btn` (+ `--active`, `--static`) — używana we wszystkich kolejnych zadaniach.

**UWAGA — to NIE jest kopia 1:1, i tak ma być.** Dziś karta custom wypisuje na gwiazdce **samo** `coc-star-btn`, a ten blok ustawia wyłącznie `opacity`. Karta CoC dokłada obok `coc-remove-btn`, który robi reset przycisku (`background: none; border: none; padding: 0`) — karta custom go nie dokłada, więc jej gwiazdka renderuje się jako natywny przycisk przeglądarki (szare tło, wypukła ramka) przy 25% krycia. Nowy blok zawiera reset, czyli **naprawia zastaną usterkę** w tabeli, drzewie i broniach naraz.

- [ ] **Step 1: Zaktualizuj asercje w testach (najpierw czerwone)**

W `CustomSheetBody.skillTable.test.jsx` podmień pięć wystąpień w bloku `describe('CustomSheetBody skill_table — favourites star')`:

```js
    expect(container.querySelectorAll('button.custom-sheet__star-btn')).toHaveLength(2);
```
```js
    expect(container.querySelector('.custom-sheet__star-btn')).toBeNull();
```
```js
    const stars = container.querySelectorAll('button.custom-sheet__star-btn');
    expect(stars[0]).toHaveClass('custom-sheet__star-btn--active');
    expect(stars[1]).not.toHaveClass('custom-sheet__star-btn--active');
```
```js
    expect(container.querySelector('.custom-sheet__star-btn--static')).not.toBeNull();
    expect(container.querySelector('button.custom-sheet__star-btn')).toBeNull();
```
```js
    expect(container.querySelector('.custom-sheet__star-btn')).toBeNull();
```

W `CustomSheetBody.domShape.test.jsx:98`:

```js
    expect(container.querySelectorAll('.custom-sheet__star-btn').length).toBeGreaterThan(0);
```

- [ ] **Step 2: Uruchom testy — mają paść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody`
Expected: FAIL — `expect(received).toHaveLength(expected) … Received length: 0` w testach gwiazdki oraz `Received: 0` w domShape.

- [ ] **Step 3: Przemianuj klasę w JSX**

`CustomSheetBody.jsx:257` (w `starAffordance`):

```jsx
          className={`custom-sheet__star-btn${active ? ' custom-sheet__star-btn--active' : ''}`}
```

`CustomSheetBody.jsx:267`:

```jsx
        <span className="custom-sheet__star-btn custom-sheet__star-btn--static" aria-hidden="true">
```

`CustomSheetBody.jsx:1022` (preset broni) i `:1054` (wiersz broni) — oba wyglądają tak samo, różnią się tylko identyfikatorem:

```jsx
                        className={`custom-sheet__star-btn${favoriteWeapons.includes(preset.id) ? ' custom-sheet__star-btn--active' : ''}`}
```
```jsx
                      className={`custom-sheet__star-btn${favoriteWeapons.includes(row.id) ? ' custom-sheet__star-btn--active' : ''}`}
```

- [ ] **Step 4: Dodaj blok CSS**

W `style.css`, w sekcji `custom-sheet`, tuż przed regułą `.custom-sheet__skill-row .coc-star-btn` (ok. linii 8287):

```css
/* Favourites star, under the custom sheet's own name. The CoC card keeps its own .coc-star-btn
   block: every sheet is headed for this engine, and that block goes away with the CoC card.
   The button reset is deliberate and not a copy of the CoC rules — the custom sheet never
   carried .coc-remove-btn alongside the star, so until now its star rendered as a native
   browser button (grey face, outset border) at 25% opacity, next to a roll button that resets
   all of it. */
.custom-sheet__star-btn {
    background: none;
    border: none;
    padding: 0;
    color: #8a7a6a;
    cursor: pointer;
    font-size: 13px;
    flex-shrink: 0;
    opacity: 0.25;
    transition: opacity 0.15s, color 0.15s;
}

.custom-sheet__star-btn--active {
    opacity: 1;
    color: #c9975b;
}

.custom-sheet__star-btn:hover {
    opacity: 0.7;
    color: #c9975b;
}

/* The creator's read-only twin: same box, no pointer, no hover. */
.custom-sheet__star-btn--static {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    opacity: 0.25;
    pointer-events: none;
}
```

Kolejność ma znaczenie: `--active` i `:hover` stoją **za** regułą bazową, bo mają tę samą specyficzność.

- [ ] **Step 5: Przemianuj regułę pozycjonującą**

`style.css:8287` — zmień selektor:

```css
.custom-sheet__skill-row .custom-sheet__star-btn,
.custom-sheet__skill-row .custom-sheet__roll-btn {
    justify-self: center;
}
```

- [ ] **Step 6: Uruchom testy i zaktualizuj snapshot**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody -u`
Expected: PASS, w podsumowaniu `1 snapshot updated` (zmienia się tylko snapshot „session render" — snapshot read-only nie zawiera gwiazdki, bo bez `onToggleFavorite` i bez `showAffordances` nic się nie renderuje).

- [ ] **Step 7: Sprawdź, że w karcie custom nie został żaden `coc-`**

Run: `cd warhammer-battle-helper-front/src && grep -rn "coc-" systems/custom/ | grep -v "\.snap"`
Expected: brak wyników.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom warhammer-battle-helper-front/src/style.css
git commit -m "refactor: FEATURE-219 give the custom sheet star its own class

The star rendered with coc-star-btn, whose block only sets opacity — the
CoC card's reset lives in coc-remove-btn, which the custom sheet never
added. So the button kept its native chrome at 25% opacity. The new block
carries the reset.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Nagłówek zawsze, z etykietami „Nazwa" i „Wartość"

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx:824-847` (stała `header` w `case 'skill_table'`)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `locales/pl/translation.json`
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTable.test.jsx:75-91`
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.domShape.test.jsx` (snapshot)

**Interfaces:**
- Consumes: `skillGridTemplate()` z `skillLayout.js` (bez zmian), klucze `customSheet.base/advances/total`.
- Produces: klucze `customSheet.name`, `customSheet.value`; klasa `custom-sheet__skill-col-label--value`; niezmiennik „nagłówek jest pierwszym dzieckiem kontenera tabeli".

- [ ] **Step 1: Napisz testy nagłówka (najpierw czerwone)**

W `CustomSheetBody.skillTable.test.jsx` **zastąp** test `'renders no header when neither advances nor development are on'` trzema nowymi (reszta bloku `describe` bez zmian):

```js
  it('renders the header even for a field with no flags at all', () => {
    const { container } = render(<CustomSheetBody sections={tableSections()} />);
    expect(container.querySelector('.custom-sheet__skill-table-header')).not.toBeNull();
  });

  it('labels the name column and the single value column when there are no advances', () => {
    const { container } = render(<CustomSheetBody sections={tableSections()} />);
    const labels = [...container.querySelectorAll('.custom-sheet__skill-col-label')]
      .map(el => el.textContent);
    expect(labels).toEqual(['Name', 'Value']);
  });

  it('labels base, advances and total instead when the field has advances', () => {
    const { container } = render(
      <CustomSheetBody sections={tableSections({ hasAdvances: true })} />
    );
    const labels = [...container.querySelectorAll('.custom-sheet__skill-col-label')]
      .map(el => el.textContent);
    expect(labels).toEqual(['Name', 'Base', 'Advances', 'Total']);
  });
```

Testy czytają angielskie etykiety, bo `import '../../i18n'` startuje z językiem domyślnym `en`.

- [ ] **Step 2: Uruchom testy — mają paść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.skillTable`
Expected: FAIL — `expect(received).not.toBeNull()` (nagłówka nie ma) oraz `Received: []` w teście etykiet.

- [ ] **Step 3: Dodaj klucze i18n**

`locales/en/translation.json`, w obiekcie `customSheet`, obok `base`/`advances`/`total`:

```json
      "name": "Name",
      "value": "Value",
```

`locales/pl/translation.json`, w obiekcie `customSheet`:

```json
      "name": "Nazwa",
      "value": "Wartość",
```

- [ ] **Step 4: Przepisz stałą `header`**

W `CustomSheetBody.jsx` zastąp cały blok `const header = (hasAdv || showDev) && (…);` (wraz z komentarzem nad nim) tym:

```jsx
        // The header is unconditional. Two reasons, and the second is the one that bites: it is
        // the table's top edge in the current skin, AND the zebra striping in style.css counts
        // sibling parity from it. A header that came and went with a field flag would flip which
        // rows are tinted. It must stay the FIRST child of the table (or of each column).
        const header = (
          <div className="custom-sheet__skill-table-header" style={{ gridTemplateColumns: gridTemplate }}>
            {showDev && (
              <span
                className="custom-sheet__skill-col-label custom-sheet__skill-col-label--dev"
                onMouseEnter={e => showTooltip(t('customSheet.development'), e.currentTarget)}
                onMouseLeave={hideTooltip}
              >
                <TrendingUpIcon style={{ fontSize: 12 }} />
              </span>
            )}
            <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--name">{t('customSheet.name')}</span>
            {hasAdv ? (
              <>
                <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--base">{t('customSheet.base')}</span>
                <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--adv">{advLabel}</span>
                <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--total">{t('customSheet.total')}</span>
              </>
            ) : (
              <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--value">{t('customSheet.value')}</span>
            )}
          </div>
        );
```

Nagłówek nadal nie wypisuje pustych `<span>`-ów dla kolumn ★, kostki i akcji — grid po prostu zostawia te tory puste, a `gridTemplate` i tak jest ten sam co w wierszu.

- [ ] **Step 5: Uruchom testy skillTable**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.skillTable`
Expected: PASS, wszystkie testy pliku.

- [ ] **Step 6: Zaktualizuj snapshoty domShape**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.domShape -u`
Expected: PASS, `2 snapshots updated` — fixture ma pole `skill_table` bez flag, więc nagłówek dochodzi w obu renderach.

- [ ] **Step 7: Obejrzyj różnicę w snapshocie**

Run: `git diff warhammer-battle-helper-front/src/systems/custom/__snapshots__/`
Expected: jedyna zmiana to dodany `<div class="custom-sheet__skill-table-header" …>` z dwoma `span`-ami etykiet w obu snapshotach. Cokolwiek innego = błąd, wróć do kroku 4.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom warhammer-battle-helper-front/src/locales
git commit -m "feat: FEATURE-219 always render the skill table header

It is the table's top edge in the new skin, and the zebra striping counts
sibling parity from it, so a conditional header would flip which rows are
tinted. Adds the name column's label and, for a field without advances,
the single value column's.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Wydziel `SkillTableHeader`

Od tego zadania do końca Taska 5 obowiązuje jedna zasada: **snapshoty domShape nie mają prawa się zmienić**. To jest dowód, że ekstrakcja nie przesunęła ani jednego opakowania — a od tego zależy kreator, który dokłada swoje uchwyty do tego samego drzewa przez `renderChrome` (FEATURE-212).

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/fields/SkillTableHeader.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (import + użycie w `case 'skill_table'`)

**Interfaces:**
- Consumes: klasy i klucze z Taska 2.
- Produces: `<SkillTableHeader gridTemplate showDevelopment hasAdvances advancesLabel showTooltip hideTooltip />` — używany przez `SkillTable` w Tasku 5.

- [ ] **Step 1: Utwórz komponent**

`systems/custom/fields/SkillTableHeader.jsx`:

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

// The header bar of one skill_table column.
//
// It renders unconditionally. Two reasons, and the second is the one that bites: it is the
// table's top edge in the current skin, AND the zebra striping in style.css counts sibling
// parity from it. A header that came and went with a field flag would flip which rows are
// tinted. It must stay the FIRST child of the table (or of each column in two-column mode).
//
// `gridTemplate` is handed in rather than computed here: the header and every row of the same
// field must be given the SAME string, and the moment the two compute it separately they drift.
function SkillTableHeader({
  gridTemplate,
  showDevelopment = false,
  hasAdvances = false,
  advancesLabel,
  showTooltip,
  hideTooltip,
}) {
  const { t } = useTranslation();

  return (
    <div className="custom-sheet__skill-table-header" style={{ gridTemplateColumns: gridTemplate }}>
      {showDevelopment && (
        <span
          className="custom-sheet__skill-col-label custom-sheet__skill-col-label--dev"
          onMouseEnter={e => showTooltip(t('customSheet.development'), e.currentTarget)}
          onMouseLeave={hideTooltip}
        >
          <TrendingUpIcon style={{ fontSize: 12 }} />
        </span>
      )}
      <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--name">{t('customSheet.name')}</span>
      {hasAdvances ? (
        <>
          <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--base">{t('customSheet.base')}</span>
          <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--adv">{advancesLabel}</span>
          <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--total">{t('customSheet.total')}</span>
        </>
      ) : (
        <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--value">{t('customSheet.value')}</span>
      )}
    </div>
  );
}

export default SkillTableHeader;
```

Kolumny ★, kostki i akcji nie dostają pustych `span`-ów — grid zostawia te tory puste, a szerokości i tak pochodzą z `gridTemplate`.

- [ ] **Step 2: Podepnij w `CustomSheetBody`**

Import obok pozostałych (za importem `skillLayout`):

```jsx
import SkillTableHeader from './fields/SkillTableHeader';
```

Usuń import `TrendingUpIcon` z `CustomSheetBody.jsx` — po przeniesieniu nagłówka ikona nie ma tam już żadnego użycia (jedyne było w linii 835).

W `case 'skill_table'` zastąp cały blok `const header = (…);` z Taska 2 jednym wyrażeniem:

```jsx
        const header = (
          <SkillTableHeader
            gridTemplate={gridTemplate}
            showDevelopment={showDev}
            hasAdvances={hasAdv}
            advancesLabel={advLabel}
            showTooltip={showTooltip}
            hideTooltip={hideTooltip}
          />
        );
```

- [ ] **Step 3: Uruchom cały pakiet CustomSheetBody bez `-u`**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody`
Expected: PASS, **`snapshots: 2 passed`, zero zapisanych**. Jakikolwiek „snapshot obsolete" albo „written" znaczy, że kształt DOM się ruszył — cofnij i porównaj z krokiem 1.

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom
git commit -m "refactor: FEATURE-219 extract SkillTableHeader

Same markup, same snapshots — the extraction is proven by the domShape
snapshots not moving.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wydziel `SkillTableRow`

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/fields/SkillTableRow.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (`renderRow` w `case 'skill_table'`)

**Interfaces:**
- Consumes: `resolveSkillValues(field, row, skills, attrs)` z `skillLayout.js` → `{ base, advances, total, baseReadOnly }`; wiersze z `buildSkillRows` → `{ key, label, attr, custom, isNew }`.
- Produces: `<SkillTableRow …/>` o sygnaturze niżej — używany przez `SkillTable` w Tasku 5.

- [ ] **Step 1: Utwórz komponent**

`systems/custom/fields/SkillTableRow.jsx`:

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import CheckIcon from '@mui/icons-material/Check';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { resolveSkillValues } from '../skillLayout';

// One row of a skill_table.
//
// `showStar` / `showRoll` / `showActions` are booleans separate from renderStar / renderRoll on
// purpose: they reserve a grid track, and the rule for reserving one ("a live handler OR the
// creator's showAffordances") is the parent's affordance policy, not the row's. A row that
// reserved a track based on whether a render prop returned something would give the creator a
// different row width than the game — which is exactly the bug FEATURE-212 was about.
//
// renderRoll receives the ROW, not a ready handler: the row knows which skill it is, the parent
// knows what rolling one means.
function SkillTableRow({
  row,
  field,
  gridTemplate,
  showDevelopment,
  hasAdvances,
  showStar,
  showRoll,
  showActions,
  skills,
  attrs,
  attrByKey,
  customSkillNodes,
  developmentSkills,
  onToggleDevelopment,
  onChange,
  readOnly,
  editing,
  onStartRename,
  onFinishRow,
  onRemoveRow,
  onUpdateCustomSkill,
  renderStar,
  renderRoll,
  showTooltip,
  hideTooltip,
}) {
  const { t } = useTranslation();

  const attrInfo = row.attr ? attrByKey[row.attr] : null;
  const displayName = attrInfo ? `${row.label} (${attrInfo.abbr || attrInfo.label})` : row.label;
  const { base, advances: adv, total, baseReadOnly } = resolveSkillValues(field, row, skills, attrs);
  const attrFields = Object.values(attrByKey);

  return (
    <div className="custom-sheet__skill-row" style={{ gridTemplateColumns: gridTemplate }}>
      {showDevelopment && (
        <input
          type="checkbox"
          className="custom-sheet__skill-dev-check"
          checked={developmentSkills.includes(row.key)}
          disabled={!onToggleDevelopment}
          onChange={onToggleDevelopment ? () => onToggleDevelopment(row.key) : undefined}
          onMouseEnter={e => showTooltip(t('customSheet.development'), e.currentTarget)}
          onMouseLeave={hideTooltip}
        />
      )}
      {editing ? (
        <span className="custom-sheet__skill-name-edit">
          <input
            type="text"
            className="custom-sheet__skill-name-input"
            value={row.label}
            autoFocus
            placeholder={t('customSheet.skillNamePlaceholder')}
            onChange={e => onUpdateCustomSkill(row.key, {
              ...customSkillNodes[row.key],
              label: e.target.value,
            })}
            onKeyDown={e => { if (e.key === 'Enter') onFinishRow(row.key); }}
          />
          {field.assignAttrToSkill && (
            <select
              className="custom-sheet__skill-attr-select"
              value={row.attr}
              onChange={e => onUpdateCustomSkill(row.key, {
                ...customSkillNodes[row.key],
                linkedAttr: e.target.value || undefined,
              })}
            >
              <option value="">{t('customSheet.attrNone')}</option>
              {attrFields.map(f => <option key={f.key} value={f.key}>{f.abbr || f.label}</option>)}
            </select>
          )}
        </span>
      ) : (
        <span className="custom-sheet__skill-name">{displayName}</span>
      )}
      <input
        type="number"
        className={`custom-sheet__skill-val-input${hasAdvances ? ' custom-sheet__skill-val-input--base' : ''}${baseReadOnly ? ' custom-sheet__skill-val-input--derived' : ''}`}
        value={baseReadOnly ? base : (hasAdvances ? (base || '') : base)}
        onChange={onChange && !baseReadOnly ? e => onChange.skill(row.key, e.target.value) : undefined}
        readOnly={readOnly || baseReadOnly}
        min={0}
      />
      {hasAdvances && (
        <>
          <input
            type="number"
            className="custom-sheet__skill-val-input custom-sheet__skill-val-input--adv"
            value={adv || ''}
            onChange={onChange ? e => onChange.skillAdvances(row.key, e.target.value) : undefined}
            readOnly={readOnly}
          />
          <span className="custom-sheet__skill-val-total">{total}</span>
        </>
      )}
      {showStar && renderStar(row.key)}
      {showRoll && renderRoll(row)}
      {showActions && (
        <span className="custom-sheet__skill-row-actions">
          {row.custom && onUpdateCustomSkill && (editing ? (
            <button className="custom-sheet__skill-save" onClick={() => onFinishRow(row.key)} title={t('customSheet.saveSkill')}>
              <CheckIcon style={{ fontSize: 13 }} />
            </button>
          ) : (
            <button className="custom-sheet__skill-edit" onClick={() => onStartRename(row.key, row.label)} title={t('customSheet.editSkill')}>
              <EditIcon style={{ fontSize: 12 }} />
            </button>
          ))}
          {row.custom && onRemoveRow && (
            <button className="custom-sheet__skill-del" onClick={() => onRemoveRow(row.key)} title={t('customSheet.removeSkill')}>
              <DeleteIcon style={{ fontSize: 12 }} />
            </button>
          )}
        </span>
      )}
    </div>
  );
}

export default SkillTableRow;
```

- [ ] **Step 2: Podepnij w `CustomSheetBody`**

Import:

```jsx
import SkillTableRow from './fields/SkillTableRow';
```

Usuń z `CustomSheetBody.jsx` importy ikon, które po tym kroku nie mają już użycia: `CheckIcon` i `DeleteIcon` (obie renderowały się wyłącznie w akcjach wiersza tabeli). `EditIcon` **zostaje** — drzewo używa go w `renderCustomNode`.

Zastąp całą funkcję `const renderRow = (row) => { … };` w `case 'skill_table'` tym:

```jsx
        const renderRow = (row) => (
          <SkillTableRow
            key={row.key}
            row={row}
            field={field}
            gridTemplate={gridTemplate}
            showDevelopment={showDev}
            hasAdvances={hasAdv}
            showStar={showStar}
            showRoll={showRoll}
            showActions={playerAdd}
            skills={skills}
            attrs={attrs}
            attrByKey={attrByKey}
            customSkillNodes={customSkillNodes}
            developmentSkills={developmentSkills}
            onToggleDevelopment={onToggleDevelopment}
            onChange={onChange}
            readOnly={readOnly}
            editing={row.custom && editingPath === row.key}
            onStartRename={startSkillRename}
            onFinishRow={finishSkillRow}
            onRemoveRow={onRemoveCustomSkill ? removeSkillRow : null}
            onUpdateCustomSkill={onUpdateCustomSkill}
            renderStar={starAffordance}
            renderRoll={(r) => rollAffordance(() => onRoll({ skillKey: r.key, label: r.label }))}
            showTooltip={showTooltip}
            hideTooltip={hideTooltip}
          />
        );
```

`key` przechodzi na element `SkillTableRow`, dokładnie tam, gdzie stał wcześniej na `div`-ie — dzięki temu React nadal odróżnia wiersze po kluczu umiejętności.

`renderRoll` dostaje **wiersz**, a nie gotowy handler: wiersz wie, którą jest umiejętnością, a rodzic wie, co znaczy na nią rzucić.

- [ ] **Step 3: Uruchom cały pakiet bez `-u`**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody`
Expected: PASS, `snapshots: 2 passed`, zero zapisanych.

- [ ] **Step 4: Sprawdź ręcznie ścieżkę rzutu w teście integracyjnym**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern="CustomSheetBody.(smoke|skillTable)"`
Expected: PASS. Jeśli któryś test klika kostkę i dostaje `skillKey: undefined`, znaczy że `renderRoll` został z `() => {}` z kroku 1.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom
git commit -m "refactor: FEATURE-219 extract SkillTableRow

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wydziel `SkillTable` i przenieś stan tabeli

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/fields/keys.js`
- Create: `warhammer-battle-helper-front/src/systems/custom/fields/SkillTable.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (`genId`, stany `newSkillRows` / `renameSortLabels`, cały `case 'skill_table'`)

**Interfaces:**
- Consumes: `SkillTableHeader`, `SkillTableRow` (Taski 3–4), `skillGridTemplate`, `buildSkillRows`, `splitHalf` z `skillLayout.js`.
- Produces: `<SkillTable …/>` — jedyne, co po tym zadaniu zostaje z `case 'skill_table'` w `CustomSheetBody`.

- [ ] **Step 1: Wyprowadź `genId` do osobnego modułu**

`systems/custom/fields/keys.js`:

```js
// genId mints a stable, opaque key for a player-added skill node — never derived from the typed
// name, so two skills can share a name and renaming never affects the key. Matches the
// surrogate-key convention used GM-side in TemplateBuilder.
//
// It lives outside CustomSheetBody because both the sheet (skill_tree) and SkillTable mint keys;
// importing it from CustomSheetBody would make SkillTable and its parent import each other.
export function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}
```

W `CustomSheetBody.jsx` usuń definicję `genId` (wraz z jej komentarzem) i dodaj import:

```jsx
import { genId } from './fields/keys';
```

- [ ] **Step 2: Uruchom testy — nic nie ma się zmienić**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody`
Expected: PASS, `snapshots: 2 passed`.

- [ ] **Step 3: Utwórz `SkillTable`**

`systems/custom/fields/SkillTable.jsx`:

```jsx
import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { skillGridTemplate, buildSkillRows, splitHalf } from '../skillLayout';
import { genId } from './keys';
import SkillTableHeader from './SkillTableHeader';
import SkillTableRow from './SkillTableRow';

// The skill_table field: a header bar plus one row per skill, optionally split into two columns.
//
// `showStar` / `showRoll` / `showActions` arrive as booleans separate from renderStar / renderRoll:
// each reserves a grid track, and the rule for reserving one ("a live handler OR the creator's
// showAffordances") is the sheet's affordance policy. A table that inferred the reservation from
// whether a render prop returned something would hand the creator a different row width than the
// game — the bug FEATURE-212 was about. showActions is the same story for the player's own
// edit/delete buttons, which is why it is not derived from field.playerCanAddSkills here.
//
// `editingPath` is a prop rather than local state because skill_tree edits through the same
// value: two independent states would let a table row and a tree node be edited at once.
function SkillTable({
  field,
  skills,
  attrs,
  attrByKey,
  customSkillNodes,
  developmentSkills,
  onToggleDevelopment,
  onChange,
  readOnly,
  onAddCustomSkill,
  onRemoveCustomSkill,
  onUpdateCustomSkill,
  editingPath,
  setEditingPath,
  showTooltip,
  hideTooltip,
  showStar,
  showRoll,
  showActions,
  renderStar,
  renderRoll,
}) {
  const { t } = useTranslation();

  // Rows the player has just created and not yet named. Kept as state rather than derived from an
  // empty label, because a player may deliberately blank a name mid-edit and the row must not jump
  // to the bottom of a sorted list while they type.
  const [newSkillRows, setNewSkillRows] = useState(() => new Set());

  // Label a row had when its rename began, keyed by row key. A rename writes through on every
  // keystroke, so a sorted list would resort the row letter by letter and crawl it away from the
  // cursor; ordering by this frozen label holds the row still until the rename is confirmed. A ref,
  // not state: it is read while rendering the very update that already re-rendered for the click
  // that set it, and it must never trigger a render of its own.
  const renameSortLabels = useRef({});

  const hasAdv   = !!field.hasAdvances;
  const showDev  = !!field.showDevelopment;
  const advLabel = field.advancesLabel || t('customSheet.advances');

  const gridTemplate = skillGridTemplate({
    showDevelopment: showDev,
    hasAdvances: hasAdv,
    showStar,
    showRoll,
    showActions,
  });
  const rows = buildSkillRows(field, customSkillNodes, newSkillRows, renameSortLabels.current);

  const addSkillRow = () => {
    const key = `${field.key}.${genId('skill')}`;
    setNewSkillRows(prev => new Set(prev).add(key));
    setEditingPath(key);
    onAddCustomSkill(key, { label: '' });
  };

  // A row entered through the pencil keeps its place in a sorted list by being ordered on the label
  // it had at this moment. A row entered through the add button needs no freeze: it is still in
  // newSkillRows, which pins it to the bottom until the name is confirmed.
  const startSkillRename = (key, label) => {
    renameSortLabels.current = { ...renameSortLabels.current, [key]: label };
    setEditingPath(key);
  };

  const finishSkillRow = (key) => {
    const { [key]: _frozen, ...rest } = renameSortLabels.current;
    renameSortLabels.current = rest;
    setNewSkillRows(prev => { const next = new Set(prev); next.delete(key); return next; });
    setEditingPath(null);
  };

  const removeSkillRow = (key) => {
    finishSkillRow(key);
    onRemoveCustomSkill(key);
  };

  const header = (
    <SkillTableHeader
      gridTemplate={gridTemplate}
      showDevelopment={showDev}
      hasAdvances={hasAdv}
      advancesLabel={advLabel}
      showTooltip={showTooltip}
      hideTooltip={hideTooltip}
    />
  );

  const renderRow = (row) => (
    <SkillTableRow
      key={row.key}
      row={row}
      field={field}
      gridTemplate={gridTemplate}
      showDevelopment={showDev}
      hasAdvances={hasAdv}
      showStar={showStar}
      showRoll={showRoll}
      showActions={showActions}
      skills={skills}
      attrs={attrs}
      attrByKey={attrByKey}
      customSkillNodes={customSkillNodes}
      developmentSkills={developmentSkills}
      onToggleDevelopment={onToggleDevelopment}
      onChange={onChange}
      readOnly={readOnly}
      editing={row.custom && editingPath === row.key}
      onStartRename={startSkillRename}
      onFinishRow={finishSkillRow}
      onRemoveRow={onRemoveCustomSkill ? removeSkillRow : null}
      onUpdateCustomSkill={onUpdateCustomSkill}
      renderStar={renderStar}
      renderRoll={renderRoll}
      showTooltip={showTooltip}
      hideTooltip={hideTooltip}
    />
  );

  const columns = field.twoColumns ? splitHalf(rows) : null;

  return (
    <div className="custom-sheet__field custom-sheet__field--skill-table">
      <div className="custom-sheet__section-title">{field.label}</div>
      {columns ? (
        <div className="custom-sheet__skill-table custom-sheet__skill-table--two-col">
          {columns.map((colRows, i) => (
            <div key={i} className="custom-sheet__skill-col">
              {header}
              {colRows.map(renderRow)}
            </div>
          ))}
        </div>
      ) : (
        <div className="custom-sheet__skill-table">
          {header}
          {rows.map(renderRow)}
        </div>
      )}
      {showActions && (
        <button
          className="custom-sheet__skill-add-btn"
          onClick={onAddCustomSkill ? addSkillRow : undefined}
          disabled={!onAddCustomSkill}
        >
          + {t('customSheet.addSkill')}
        </button>
      )}
    </div>
  );
}

export default SkillTable;
```

Zwróć uwagę, czego tu **nie ma**: `field.playerCanAddSkills`. Widoczność przycisków gracza jedzie na `showActions` liczonym przez rodzica, dokładnie tak samo jak ★ i kostka — bo ta flaga rezerwuje tor siatki, a zasada rezerwacji zna `showAffordances`, którego tabela nie dostaje.

- [ ] **Step 4: Zamień `case 'skill_table'` na wywołanie komponentu**

Import w `CustomSheetBody.jsx`:

```jsx
import SkillTable from './fields/SkillTable';
```

Cały `case 'skill_table': { … }` (od `const hasAdv` do zamykającego `}` przed `case 'weapons_table'`) zastąp tym:

```jsx
      case 'skill_table': {
        // Reserve a track only when something can actually render into it — a permanently empty
        // column with its gap becomes a visible gap. These three flags are the sheet's affordance
        // policy, which is why SkillTable takes them as booleans instead of inferring them from
        // the render props below.
        const showRoll    = !!field.rollable && (!!onRoll || showAffordances);
        const showStar    = !field.hideFavorites && (!!onToggleFavorite || showAffordances);
        const showActions = !!field.playerCanAddSkills && (!!onAddCustomSkill || showAffordances);

        return (
          <SkillTable
            key={field.key}
            field={field}
            skills={skills}
            attrs={attrs}
            attrByKey={attrByKey}
            customSkillNodes={customSkillNodes}
            developmentSkills={developmentSkills}
            onToggleDevelopment={onToggleDevelopment}
            onChange={onChange}
            readOnly={readOnly}
            onAddCustomSkill={onAddCustomSkill}
            onRemoveCustomSkill={onRemoveCustomSkill}
            onUpdateCustomSkill={onUpdateCustomSkill}
            editingPath={editingPath}
            setEditingPath={setEditingPath}
            showTooltip={showTooltip}
            hideTooltip={hideTooltip}
            showStar={showStar}
            showRoll={showRoll}
            showActions={showActions}
            renderStar={starAffordance}
            renderRoll={(row) => rollAffordance(() => onRoll({ skillKey: row.key, label: row.label }))}
          />
        );
      }
```

Usuń z `CustomSheetBody` stany, których już nikt tam nie czyta: `const [newSkillRows, setNewSkillRows] = useState(…)` i `const renameSortLabels = useRef({})` wraz z ich komentarzami. `editingPath`, `setEditingPath`, `expanded`, `addingUnderPath`, `addingLabel`, `addingAttr`, `editingLabel`, `editingAttr` **zostają** — używa ich drzewo.

- [ ] **Step 5: Sprawdź, że nic osieroconego nie zostało**

Run: `cd warhammer-battle-helper-front/src && grep -n "newSkillRows\|renameSortLabels\|splitHalf\|buildSkillRows\|skillGridTemplate" systems/custom/CustomSheetBody.jsx`
Expected: brak wyników. Jeśli coś zostało w imporcie z `./skillLayout`, usuń tę pozycję — ESLint w CRA zgłosi `no-unused-vars` i test przewróci się na ostrzeżeniu.

- [ ] **Step 6: Uruchom cały pakiet bez `-u`**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody`
Expected: PASS, `snapshots: 2 passed`, zero zapisanych. To jest końcowy dowód, że trzy kroki ekstrakcji nie ruszyły ani jednego opakowania.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom
git commit -m "refactor: FEATURE-219 extract SkillTable and move its own state into it

newSkillRows and renameSortLabels move in; editingPath stays a prop,
because skill_tree edits through the same value.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Skórka CSS

**Files:**
- Modify: `warhammer-battle-helper-front/src/style.css:8189-8340` (sekcja „Skill table")

**Interfaces:**
- Consumes: klasy wypisywane przez `SkillTableHeader` / `SkillTableRow` (Taski 3–4), w tym `--name` i `--value` z Taska 2.
- Produces: końcowy wygląd; żaden kod JS tego nie czyta.

- [ ] **Step 1: Kontenery bez odstępu między wierszami**

`.custom-sheet__skill-table` — zmień `gap: 3px` na `gap: 0`. To samo w `.custom-sheet__skill-col`:

```css
.custom-sheet__skill-table {
    display: flex;
    flex-direction: column;
    gap: 0;
    width: 100%;
}
```

```css
.custom-sheet__skill-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
}
```

Reguła `.custom-sheet__skill-table--two-col` (z komentarzem o podwojonym selektorze) zostaje bez zmian.

- [ ] **Step 2: Pasek nagłówkowy**

Zastąp `.custom-sheet__skill-table-header` i oba bloki `.custom-sheet__skill-col-label`:

```css
.custom-sheet__skill-table-header {
    display: grid;
    align-items: center;
    gap: 8px;
    padding: 5px 4px;
    background: linear-gradient(135deg, #c9975b 0%, #a67c52 100%);
    border-radius: 4px 4px 0 0;
}

.custom-sheet__skill-col-label {
    font-family: 'Cinzel', serif;
    font-size: 10px;
    color: #fff9f0;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    text-align: center;
}

/* The name column is the only one whose content is left-aligned, header included. */
.custom-sheet__skill-col-label--name {
    text-align: left;
    padding-left: 2px;
}

.custom-sheet__skill-col-label--dev {
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
```

`--dev` traci własny `color` — dziedziczy `#fff9f0` z reguły bazowej, tak jak pozostałe etykiety.

- [ ] **Step 3: Wiersz — linia, zebra, wysokość**

Zastąp `.custom-sheet__skill-row` i `.custom-sheet__skill-row:hover`:

```css
/* One grid per skill row, its columns handed in from JS (skillGridTemplate) so a field's header
   and its rows can never disagree about where a column starts. The column count varies with the
   field's flags — development marker, star, die, player actions — which is exactly why the
   template cannot live here.
   The zebra below counts SIBLING parity, and the header is the first child of the table (or of
   each column in two-column mode). That is why SkillTableHeader renders unconditionally: a header
   that came and went with a field flag would flip which rows are tinted. The "+ add skill" button
   is a sibling of the table container, not of the rows, so it stays out of this count. */
.custom-sheet__skill-row {
    display: grid;
    align-items: center;
    gap: 8px;
    padding: 2px 4px;
    min-height: 26px;
    border-bottom: 1px solid rgba(201, 151, 91, 0.5);
    transition: background 0.12s;
}

.custom-sheet__skill-row:nth-child(even) {
    background: rgba(255, 249, 240, 0.55);
}

/* Equal specificity with the zebra rule above (0,2,0), so it must come after it to win. */
.custom-sheet__skill-row:hover {
    background: rgba(201, 151, 91, 0.14);
}
```

- [ ] **Step 4: Kolumny liczbowe — hierarchia**

Zastąp blok `.custom-sheet__skill-row .custom-sheet__skill-val-input` oraz **wszystkie** dotychczasowe reguły `--base`, `--base:focus`, `--derived`, `--derived:focus`, `--adv` i `.custom-sheet__skill-val-total`:

```css
/* The value column of a table row. The emphasis sits on the UNMODIFIED rule because a field
   without advances has exactly one value column and that value is the important one; --base and
   --adv, which the row only adds when hasAdvances is on, push those two back.
   Everything here is anchored to .custom-sheet__skill-row for two reasons: skill_tree renders the
   same input with the bare class and must keep its own look, and at equal specificity the
   modifiers below win by standing later in the file. */
.custom-sheet__skill-row .custom-sheet__skill-val-input {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0 4px;
    font-size: 1.28rem;
    font-weight: 700;
    color: #5a3f28;
}

.custom-sheet__skill-row .custom-sheet__skill-val-input:focus {
    outline: none;
    background: rgba(255, 255, 255, 0.55);
}

/* Base and advances are the inputs you feed the total with — second plane, both of them. */
.custom-sheet__skill-row .custom-sheet__skill-val-input--base,
.custom-sheet__skill-row .custom-sheet__skill-val-input--adv {
    font-size: 0.85rem;
    font-weight: 400;
    color: #6b5a45;
}

/* A base read from a linked attribute (FEATURE-218) is not editable, so it must not look
   editable. The engraved plate it used to wear is now the loudest thing in a borderless row —
   it would outshout the total — so the cell keeps only a fill. --derived always rides with
   --base, which supplies the type. */
.custom-sheet__skill-row .custom-sheet__skill-val-input--derived {
    background: rgba(122, 92, 66, 0.10);
    cursor: default;
}

.custom-sheet__skill-row .custom-sheet__skill-val-input--derived:focus {
    outline: none;
    background: rgba(122, 92, 66, 0.10);
}

/* Total — the number the player rolls against, so it carries the row. */
.custom-sheet__skill-val-total {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    box-sizing: border-box;
    padding: 0 4px;
    color: #5a3f28;
    font-size: 1.28rem;
    font-weight: 700;
}
```

- [ ] **Step 5: Nazwa umiejętności**

Do `.custom-sheet__skill-row .custom-sheet__skill-name` dopisz wyrównanie do lewej krawędzi, żeby zgadzało się z etykietą `--name`:

```css
.custom-sheet__skill-row .custom-sheet__skill-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-left: 2px;
}
```

- [ ] **Step 6: Uruchom testy — mają przejść bez zmian**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody`
Expected: PASS, `snapshots: 2 passed`. **jsdom nie liczy layoutu ani nie czyta `style.css`**, więc testy nie mówią nic o wyglądzie — to tylko potwierdzenie, że nic w JS nie zostało ruszone. Wygląd sprawdza Task 7.

- [ ] **Step 7: Sprawdź, że nie została martwa reguła**

Run: `cd warhammer-battle-helper-front/src && grep -n "skill-val-input--base\|skill-val-input--adv\|skill-val-input--derived\|skill-val-total" style.css`
Expected: każdy modyfikator występuje wyłącznie w blokach z kroku 4, wszystkie zakotwiczone w `.custom-sheet__skill-row` (poza `--total`, które jest osobnym elementem). Stara reguła z ramką 2px nie może nigdzie zostać.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/style.css
git commit -m "feat: FEATURE-219 skin the custom sheet skill table

Header band, horizontal rules and zebra striping; the total set apart by
size and weight rather than by another background layer, with base and
advances pushed to the second plane. The derived base loses its engraved
plate, which in a borderless row outshouted the total it feeds.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Weryfikacja w przeglądarce

jsdom nie liczy layoutu i nie wczytuje `style.css`, więc **żaden test w tym repo nie sprawdza wyglądu**. FEATURE-217 i FEATURE-218 poszły na `main` bez ani jednego kliknięcia i ich CSS jest do dziś niezweryfikowany. To zadanie jest w całości wizualne, więc ten krok jest jego częścią, nie dodatkiem.

**Files:** żadnych zmian w kodzie, chyba że coś wyjdzie.

- [ ] **Step 1: Uruchom stack**

Run: `docker compose up -d` z katalogu głównego repo, potem otwórz `http://localhost:3000`.
Jeśli pracujesz w worktree, zastosuj przepis z pamięci „Worktree browser testing" (whitelist CORS + montowanie kontenera) — inaczej front nie wystartuje pod `:3000`.

- [ ] **Step 2: Przejdź listę kontrolną**

W grze z systemem custom otwórz kartę postaci i sprawdź:

1. tabela **z rozwinięciami** — Suma czytelnie dominuje nad Bazą i Rozwinięciami;
2. tabela **bez rozwinięć** — pojedyncza kolumna wartości jest tą wyróżnioną, nagłówek pokazuje „Nazwa" i „Wartość";
3. **dwie kolumny** (`twoColumns`) — każda ma własny pasek nagłówkowy, zebra w obu zaczyna się tak samo;
4. **checkbox rozwoju** włączony — ikona `↗` w nagłówku jest jasna na złotym tle, tooltip działa;
5. **baza z atrybutu** (FEATURE-218) — pole wygląda na zablokowane, ale nie krzyczy głośniej od Sumy;
6. **wiersz dodany przez gracza** — dodanie, wpisanie nazwy, zapis, ołówek, kosz; wiersz w trakcie pisania nie ucieka spod kursora przy włączonym sortowaniu;
7. **długa nazwa** — wielokropek, kolumny się nie rozjeżdżają;
8. **gwiazdka** — nie ma już natywnej ramki przycisku (efekt uboczny Taska 1); sprawdź ją też w drzewku i w tabeli broni.

- [ ] **Step 3: Kreator**

Otwórz kreator szablonu (`TemplateBuilder`) na tym samym polu. Tabela musi wyglądać **identycznie** jak w grze: ten sam pasek nagłówkowy, ta sama szerokość wierszy, gwiazdka i kostka obecne jako nieaktywne. Różnica w szerokości wiersza między kreatorem a grą = któraś flaga `showStar` / `showRoll` / `showActions` nie uwzględnia `showAffordances` (FEATURE-212).

- [ ] **Step 4: Zrób zrzuty i pokaż użytkownikowi**

Minimum dwa: tabela z rozwinięciami i tabela bez. Dopiero po akceptacji zadanie jest zamknięte.

---

## Podsumowanie pokrycia spec-a

| Wymaganie ze spec-a | Zadanie |
|---|---|
| Pasek nagłówkowy, linie poziome, zebra, wiersz 26px | 6 |
| Suma `1.28rem` bold, baza i rozwinięcia na drugi plan | 6 |
| Nagłówek renderowany zawsze + niezmiennik parzystości | 2, 6 |
| Etykiety „Nazwa" / „Wartość" + klucze i18n | 2 |
| `coc-star-btn` → `custom-sheet__star-btn` (4 miejsca + CSS) | 1 |
| `SkillTable` / `SkillTableHeader` / `SkillTableRow` | 3, 4, 5 |
| `newSkillRows` i `renameSortLabels` do środka, `editingPath` propsem | 5 |
| `showStar` / `showRoll` / `showActions` liczone przez rodzica | 4, 5 |
| `skillLayout.js` bez zmian | 3–5 (żadne nie dotyka pliku) |
| DOM poza nagłówkiem bajt w bajt | 3–5 (snapshot bez `-u`) |
| `--derived` traci płytkę | 6 |
| Specyficzność: modyfikatory za regułą bazową | 6 |
| Weryfikacja ręczna | 7 |

Odstępstwo od spec-a, świadome i opisane w Tasku 1: `custom-sheet__star-btn` **nie jest** kopią 1:1 — dokłada reset przycisku, którego karta custom nigdy nie miała. Bez tego przenosilibyśmy dalej natywną ramkę przycisku widoczną dziś w tabeli, drzewie i broniach.

Drugie odstępstwo, Task 5: spec nie wymieniał `fields/keys.js`. `genId` musi wyjść z `CustomSheetBody`, bo inaczej `SkillTable` i jego rodzic importowałyby się nawzajem.
