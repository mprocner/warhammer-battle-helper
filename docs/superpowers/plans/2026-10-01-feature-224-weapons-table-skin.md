# FEATURE-224 — Skórka tabeli broni — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pole `weapons_table` dostaje pasek nagłówka, linie, zebrę i kolumny o szerokościach liczonych z typu, a jego render i pomocniki wychodzą z `CustomSheetBody.jsx`.

**Architecture:** Pomocniki broni przenoszą się do nowego `systems/custom/weaponLayout.js`, który dostaje też `weaponGridTemplate`. Render rozpada się na `fields/WeaponsTable.jsx`, `WeaponsTableRow.jsx` i `WeaponsPresetRow.jsx`. Flex ustępuje siatce — jeden `grid-template-columns` liczony raz per pole i wstrzykiwany w nagłówek oraz w każdy wiersz.

**Tech Stack:** React 18, `react-i18next`, MUI Icons, CRA + Jest + React Testing Library, jeden globalny `style.css` (BEM).

**Spec:** `docs/superpowers/specs/FEATURE-224.md`

## Global Constraints

- Komentarze w kodzie **zawsze po angielsku**, bez wyjątków. Spec i plan po polsku.
- Żadnych stringów wprost w JSX — każdy tekst przez `t('klucz')`. To zadanie **nie dodaje żadnych nowych kluczy**.
- Ikony wyłącznie z `@mui/icons-material`, rozmiar **zawsze** ze stałej `AFFORDANCE_ICON_SIZE` (`systems/custom/fields/affordances.js`) — nigdy liczbą wprost.
- Klasy CSS karty custom: prefiks `custom-sheet__`. Żadnych `coc-*`.
- Paleta karty: tekst `#3a2f1f`, drugi plan `#6b5a45`, etykiety `#7a5c42`, akcent `#c9975b`, tło inputu `#fff9f0`, ramka `#c4a882`.
- **Modyfikator CSS musi stać w pliku ZA regułą bazową o tej samej specyficzności** — inaczej jest martwy (CLAUDE.md).
- Reguły komórek muszą być **zakotwiczone w klasie wiersza broni** — ta sama dyscyplina, która od FEATURE-219 trzyma rozdzielone wyglądy tabeli umiejętności i drzewka.
- Zebra liczy parzystość rodzeństwa, więc **nagłówek musi być pierwszym dzieckiem kontenera**, a stopka rodzeństwem kontenera, nie wierszy.
- Uruchamianie testów wyłącznie przez CRA, z katalogu `warhammer-battle-helper-front/`:
  `CI=true npm test -- --watchAll=false --testPathPattern='CustomSheetBody|weaponLayout|CharacterDetails|TemplateBuilder'`
  Gołe `npx jest` **nie działa**. Znany baseline fail pełnej suity: `App.test.js` (axios ESM) — nie regresja, poza tym wzorcem.
- Nie ruszamy modelu danych, kluczy, rzutów ani formuły obrażeń. **Nie powstaje nic pod przyszłe przesuwanie szerokości kolumn przez MG** — to osobny etap i będzie potrzebował własnego pola w szablonie.

## Struktura plików

| Plik | Odpowiedzialność |
|---|---|
| `systems/custom/weaponLayout.js` | **nowy** — pomocniki broni + `weaponGridTemplate` |
| `systems/custom/weaponLayout.test.js` | **nowy** — testy torów siatki |
| `systems/custom/fields/WeaponsTable.jsx` | **nowy** — kontener: nagłówek, trzy rodzaje wierszy, stopka |
| `systems/custom/fields/WeaponsTableRow.jsx` | **nowy** — wiersz gracza |
| `systems/custom/fields/WeaponsPresetRow.jsx` | **nowy** — broń z szablonu MG |
| `systems/custom/fields/SkillFieldHeader.jsx` | **modyfikowany** — klasa paska |
| `systems/custom/CustomSheetBody.jsx` | **modyfikowany** — pomocniki i `case 'weapons_table'` wychodzą |
| `components/creator/TemplateBuilder.jsx` | **modyfikowany** — import pomocników |
| `systems/custom/CharacterDetails.jsx` | **modyfikowany** — import pomocników |
| `systems/custom/CustomSheetBody.weaponRowIssue.test.jsx` | **modyfikowany** — import |
| `style.css` | **modyfikowany** — sekcja broni przepisana, klasa paska przemianowana |

**Uwaga do spec-a:** spec wymienia kreator jako importera pomocników broni. Konsumentów są **trzy**:
`TemplateBuilder.jsx:35` (`collectSkillOptions`, `renderDamageFormula`, `weaponSkillColumn`),
`CharacterDetails.jsx:8` — skrócona karta postaci (`weaponRowLabel`, `weaponRowIssue`,
`weaponIssueTitle`) — oraz `CustomSheetBody.weaponRowIssue.test.jsx:1`. Skrócona karta już dwa
razy w tym projekcie okazała się czytelnikiem, o którym ktoś zapomniał.

Kolejność: najpierw przeprowadzka pomocników przy zamrożonym DOM (1), potem czysta arytmetyka bez
konsumentów (2), potem przemianowanie klasy paska (3), potem render (4), CSS (5), przeglądarka (6).

---

### Task 1: Pomocniki broni przenoszą się do `weaponLayout.js`

Czysta przeprowadzka. Zero zmian w zachowaniu, zero w DOM.

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/weaponLayout.js`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx:11-185`
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:35`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CharacterDetails.jsx:8`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.weaponRowIssue.test.jsx:1`

**Interfaces:**
- Consumes: nic.
- Produces: `weaponLayout.js` eksportujący `weaponRowLabel(field, row, t)`, `collectSkillOptions(sections, customSkillNodes)`, `weaponSkillColumn(field)`, `weaponRowIssue(field, row)`, `weaponIssueTitle(issue, t)`, `renderDamageFormula(blocks, row, fieldKey, onChange, readOnly, t)`.

- [ ] **Step 1: Utwórz `weaponLayout.js` i przenieś kod**

Przenieś z `CustomSheetBody.jsx` **dosłownie, bez zmian w treści**, wraz z komentarzami:

- `const DMG_OP_SYMBOL` (linia 11)
- `weaponRowLabel` (15)
- `collectSkillOptions` (30)
- `diceFaces` (54)
- `isPlayerDie` (61)
- `weaponDamageIncomplete` (72)
- `weaponSkillColumn` (91)
- `weaponRowIssue` (100)
- `weaponIssueTitle` (111)
- `renderDamageFormula` (120)

Nagłówek pliku:

```js
// Weapons-table helpers: the completeness verdict for a row, the name a roll is logged under, the
// skills a "from skills" column can offer, and the damage formula's rendering.
//
// They live beside skillLayout.js rather than inside it because a weapons table is not a skill,
// and a module named for one must not be the home of the other. They left CustomSheetBody because
// three other files import them — the creator, the short character card and a test — so that file
// was the home of weapons logic long after it stopped being the only place weapons are rendered.
//
// Unlike skillLayout.js this module is not purely arithmetic: renderDamageFormula returns JSX.
// That is deliberate. The alternative was a fourth module holding one function, splitting things
// that always change together.
```

`diceFaces`, `isPlayerDie` i `weaponDamageIncomplete` tracą `export`: po przeprowadzce nikt spoza
tego modułu ich nie woła (`weaponDamageIncomplete` nigdy nie było eksportowane, pozostałe dwa były,
ale bez konsumentów). Zostaw je jako prywatne funkcje modułu.

Import Reacta jest potrzebny, bo `renderDamageFormula` zwraca JSX:

```js
import React from 'react';
import { useTranslation } from 'react-i18next'; // tylko jeśli przeniesiony kod go używa — sprawdź
import { walkFields } from '../../utils/templateSections';
```

Sprawdź w przeniesionym kodzie, czego faktycznie używa (`collectSkillOptions` woła `walkFields`),
i zaimportuj dokładnie to, ani jednej nazwy więcej.

- [ ] **Step 2: Usuń przeniesiony kod z `CustomSheetBody.jsx` i dodaj import**

```jsx
import {
  weaponRowLabel, collectSkillOptions, weaponSkillColumn,
  weaponRowIssue, weaponIssueTitle, renderDamageFormula,
} from './weaponLayout';
```

`CustomSheetBody.jsx` **przestaje eksportować** te nazwy. Usuń też import `walkFields`, jeśli po
przeprowadzce `collectSkillOptions` był jego jedynym konsumentem — sprawdź, `attrByKey` też go
używa.

- [ ] **Step 3: Przepnij trzech importerów**

`components/creator/TemplateBuilder.jsx:35`:

```jsx
import { collectSkillOptions, renderDamageFormula, weaponSkillColumn } from '../../systems/custom/weaponLayout';
```

(linia 36, domyślny import `CustomSheetBody`, zostaje bez zmian)

`systems/custom/CharacterDetails.jsx:8`:

```jsx
import { weaponRowLabel, weaponRowIssue, weaponIssueTitle } from './weaponLayout';
```

`systems/custom/CustomSheetBody.weaponRowIssue.test.jsx:1`:

```jsx
import { weaponSkillColumn, weaponRowIssue } from './weaponLayout';
```

- [ ] **Step 4: Uruchom testy BEZ `-u`**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='CustomSheetBody|CharacterDetails|TemplateBuilder'`
Expected: PASS, **snapshoty bez zmian**. To przeprowadzka — jeżeli snapshot drgnął, coś poza importami się ruszyło.

- [ ] **Step 5: Sprawdź, że nic nie zostało**

Run: `cd warhammer-battle-helper-front/src && grep -rn "weaponRowLabel\|weaponRowIssue\|weaponIssueTitle\|weaponSkillColumn\|collectSkillOptions\|renderDamageFormula\|DMG_OP_SYMBOL" --include="*.jsx" --include="*.js" . | grep -v weaponLayout`
Expected: wyłącznie **wywołania** i **importy z `./weaponLayout`** — ani jednej definicji poza nowym modułem.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src
git commit -m "refactor: FEATURE-224 give the weapons helpers their own module

Three files outside CustomSheetBody import them — the creator, the short
character card and a test — so that file had stayed the home of weapons
logic long after it stopped being the only place weapons are rendered.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `weaponGridTemplate`

Czysta arytmetyka, bez konsumentów. Po tym zadaniu nic nie wygląda inaczej.

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/weaponLayout.js`
- Test: `warhammer-battle-helper-front/src/systems/custom/weaponLayout.test.js` (nowy)

**Interfaces:**
- Consumes: `weaponLayout.js` z Taska 1.
- Produces: `weaponGridTemplate(field, { showStar, showActions, hasDamage }) → string`.

- [ ] **Step 1: Napisz testy (najpierw czerwone)**

Cała zawartość `weaponLayout.test.js`:

```js
import { weaponGridTemplate } from './weaponLayout';

// A GM's own column set. Types are the three the creator offers: text, number, select.
const cols = (...types) => types.map((type, i) => ({ key: `c${i}`, label: `K${i}`, type }));

describe('weaponGridTemplate', () => {
  it('gives the first text column the remainder and the rest their type\'s width', () => {
    expect(weaponGridTemplate({ columns: cols('text', 'select', 'number') }, {}))
      .toBe('minmax(0, 2fr) minmax(0, 140px) 56px');
  });

  // Only the FIRST text column is the name — weaponRowLabel picks the first non-empty text column
  // as the weapon's name, and the width rule has to agree with it rather than invent its own.
  it('treats only the first text column as the name', () => {
    expect(weaponGridTemplate({ columns: cols('text', 'text', 'text') }, {}))
      .toBe('minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)');
  });

  it('finds the name column wherever the GM put it', () => {
    expect(weaponGridTemplate({ columns: cols('number', 'select', 'text') }, {}))
      .toBe('56px minmax(0, 140px) minmax(0, 2fr)');
  });

  // A table with no text column at all is a template a GM can really build, so it must produce a
  // usable row rather than a template with no flexible track in it.
  it('still leaves one flexible track when no column is text', () => {
    expect(weaponGridTemplate({ columns: cols('select', 'number') }, {}))
      .toBe('minmax(0, 140px) 56px');
  });

  it('reserves the star, the damage column and the actions only when asked', () => {
    expect(weaponGridTemplate({ columns: cols('text') }, { showStar: true, hasDamage: true, showActions: true }))
      .toBe('22px minmax(0, 2fr) minmax(0, 1fr) 52px');
  });

  it('survives a field with no columns at all', () => {
    expect(weaponGridTemplate({}, { showStar: true, showActions: true })).toBe('22px 52px');
  });
});
```

- [ ] **Step 2: Uruchom testy — mają paść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=weaponLayout`
Expected: FAIL — `TypeError: (0 , _weaponLayout.weaponGridTemplate) is not a function`.

- [ ] **Step 3: Dopisz funkcję**

Na końcu `weaponLayout.js`:

```js
// weaponGridTemplate builds ONE grid-template-columns string for a weapons_table. The header and
// every row of the field must be handed the same string; until FEATURE-224 they were two flex
// rows that happened to hold the same number of flex: 1 children, which nothing enforced while
// the columns themselves are defined by the GM.
//
// A column's track comes from its TYPE, never from its content. auto and max-content would make
// the width depend on the data, so a column would grow while the player types into it and shove
// its neighbours sideways under the cursor.
//
// The name column — the one that gets what is left over — is the first column of type text,
// which is exactly the column weaponRowLabel already treats as the weapon's name. One definition
// of "the name", not two that can drift.
//
// minmax(0, …) on every flexible track: without the zero floor a track refuses to shrink below
// its content, which is the very behaviour this function exists to avoid.
export function weaponGridTemplate(field, { showStar = false, showActions = false, hasDamage = false } = {}) {
  const columns = field.columns || [];
  const nameKey = (columns.find(c => c.type === 'text') || {}).key;

  const trackFor = (c) => {
    if (c.type === 'number') return '56px';
    if (c.type === 'select') return 'minmax(0, 140px)';
    return c.key === nameKey ? 'minmax(0, 2fr)' : 'minmax(0, 1fr)';
  };

  return [
    showStar && '22px',
    ...columns.map(trackFor),
    hasDamage && 'minmax(0, 1fr)',
    showActions && '52px',
  ].filter(Boolean).join(' ');
}
```

- [ ] **Step 4: Uruchom testy**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=weaponLayout`
Expected: PASS, 6 testów.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/weaponLayout.js warhammer-battle-helper-front/src/systems/custom/weaponLayout.test.js
git commit -m "feat: FEATURE-224 size weapon columns from their type

Content-sized tracks move while the player types into them. The type is
already in the template, so the width needs no new field and no creator
work; the name column is the first text column, which is the one
weaponRowLabel already calls the weapon's name.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Pasek nagłówka przestaje należeć do umiejętności

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/fields/SkillFieldHeader.jsx`
- Modify: `warhammer-battle-helper-front/src/style.css`
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTable.test.jsx`
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.domShape.test.jsx` (+ snapshot)

**Interfaces:**
- Consumes: nic z Tasków 1–2.
- Produces: klasa `custom-sheet__field-header` — użyje jej tabela broni w Tasku 4.

- [ ] **Step 1: Zaktualizuj asercje w testach (najpierw czerwone)**

Run: `cd warhammer-battle-helper-front/src && grep -rn "skill-field-header" --include="*.jsx" . | grep -v "\.snap"`
Podmień **każde** znalezione wystąpienie `custom-sheet__skill-field-header` na `custom-sheet__field-header`.

- [ ] **Step 2: Uruchom testy — mają paść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.skillTable`
Expected: FAIL — asercje szukające nagłówka dostają `null`.

- [ ] **Step 3: Przemianuj klasę w komponencie**

W `fields/SkillFieldHeader.jsx` jedna linia:

```jsx
    <div className="custom-sheet__field-header" style={{ gridTemplateColumns: gridTemplate }}>
```

Do komentarza komponentu dopisz zdanie, że klasa paska jest wspólna dla wszystkich trzech list
pola, a ten komponent obsługuje wyłącznie listy umiejętności — tabela broni rysuje własny
nagłówek z tej samej klasy, bo niesie etykiety od MG, a nie stały zestaw.

- [ ] **Step 4: Przemianuj selektor w CSS**

W `style.css` zamień `.custom-sheet__skill-field-header` na `.custom-sheet__field-header`.

Run: `cd warhammer-battle-helper-front/src && grep -rn "skill-field-header" . | grep -v "\.snap"`
Expected: brak wyników.

- [ ] **Step 5: Uruchom testy i zaktualizuj snapshoty**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody -u`
Expected: PASS. Obejrzyj `git diff` na snapshocie: jedyna zmiana to nazwa klasy nagłówka.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src
git commit -m "refactor: FEATURE-224 the header bar belongs to no one list

weapons_table is about to wear the same bar, and a class named for
skills would then be lying about two of its three users.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `WeaponsTable`, `WeaponsTableRow`, `WeaponsPresetRow`

Render wychodzi z `CustomSheetBody`, flex ustępuje siatce, gwiazdka wchodzi do polityki afordancji.

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/fields/WeaponsPresetRow.jsx`
- Create: `warhammer-battle-helper-front/src/systems/custom/fields/WeaponsTableRow.jsx`
- Create: `warhammer-battle-helper-front/src/systems/custom/fields/WeaponsTable.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (`case 'weapons_table'`)
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.domShape.test.jsx` (+ snapshot)

**Interfaces:**
- Consumes: `weaponGridTemplate`, `renderDamageFormula`, `weaponRowLabel`, `weaponRowIssue`, `weaponIssueTitle`, `collectSkillOptions`, `weaponSkillColumn` z `weaponLayout` (Taski 1–2); klasa `custom-sheet__field-header` (Task 3); `AFFORDANCE_ICON_SIZE` z `fields/affordances`.
- Produces: `<WeaponsTable>` — jedyne, co zostaje z `case 'weapons_table'`.

**Zmiana zachowania, zamierzona:** gwiazdka renderuje się **statycznie** w kreatorze, zamiast nie renderować się wcale. Dziś `onToggleFavorite` jest tam `null`, więc wiersz pomija gwiazdkę, a nagłówek i tak rezerwuje jej 22px — każda kolumna stoi w kreatorze 22px obok swojej etykiety. To ta sama klasa błędu co FEATURE-212.

- [ ] **Step 1: Utwórz `WeaponsPresetRow.jsx`**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { renderDamageFormula, weaponRowIssue } from '../weaponLayout';

// One GM-owned weapon: rendered straight from the template so a GM edit reaches every player, and
// rolled by preset id so it is never copied into the character's own stats.
//
// Its cells are muted rather than tinted. The row's background now belongs to the zebra striping,
// and with borderless inputs a static cell and an editable one are otherwise identical — a player
// would discover this row is read-only by clicking it and having nothing happen. Italics were not
// available: in a skill tree they already mean "this node is mine, not the GM's", the opposite
// claim.
function WeaponsPresetRow({
  field,
  preset,
  cols,
  cellLabel,
  nameKey,
  gridTemplate,
  hasDamage,
  showStar,
  renderStar,
  renderRoll,
}) {
  const { t } = useTranslation();
  const issue = weaponRowIssue(field, preset);

  return (
    <div className="custom-sheet__weapon-row custom-sheet__weapon-row--preset" style={{ gridTemplateColumns: gridTemplate }}>
      {showStar && renderStar(preset.id)}

      {cols.map(c => (
        <span
          key={c.key}
          className={`custom-sheet__weapon-cell-static${c.key === nameKey ? ' custom-sheet__weapon-cell-static--name' : ''}`}
        >
          {cellLabel(c, (preset.cells && preset.cells[c.key]) || '') || '—'}
        </span>
      ))}

      {hasDamage && (
        <div className="custom-sheet__weapon-damage">
          {renderDamageFormula(field.damageFormula || [], preset, field.key, null, true, t)}
        </div>
      )}

      <div className="custom-sheet__weapon-actions">
        {field.rollable && renderRoll(preset, issue)}
        <span className="custom-sheet__weapon-lock" title={t('customSheet.weaponPresetLocked')}>🔒</span>
      </div>
    </div>
  );
}

export default WeaponsPresetRow;
```

Ten komponent **nie** dostaje `favoriteWeapons`, `onChange` ani `readOnly`: gwiazdkę renderuje
`renderStar` z rodzica, a broń MG nie ma czego edytować. `weaponRowLabel` i `weaponIssueTitle`
też tu nie wchodzą — etykietę rzutu i tooltip składa `renderRoll`, też w rodzicu.

- [ ] **Step 2: Utwórz `WeaponsTableRow.jsx`**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { renderDamageFormula, weaponRowIssue } from '../weaponLayout';

// One player-owned weapon row. Separate from WeaponsPresetRow rather than one component with a
// flag: every cell differs (input or select against a static span), the tail differs (a delete
// button against a padlock), and only this one has anything to edit. One component would be a
// switch over two unrelated shapes.
function WeaponsTableRow({
  field,
  row,
  cols,
  skillOptions,
  nameKey,
  gridTemplate,
  hasDamage,
  showStar,
  onChange,
  readOnly,
  renderStar,
  renderRoll,
}) {
  const { t } = useTranslation();
  const issue = weaponRowIssue(field, row);

  return (
    <div className="custom-sheet__weapon-row" style={{ gridTemplateColumns: gridTemplate }}>
      {showStar && renderStar(row.id)}

      {cols.map(c => {
        const val = (row.cells && row.cells[c.key]) || '';
        if (c.type === 'select') {
          const opts = c.optionsFromSkills
            ? skillOptions
            : (c.options || []).map(o => ({ key: o, label: o }));
          return (
            <select
              key={c.key}
              className="custom-sheet__weapon-cell-select"
              value={val}
              onChange={onChange ? e => onChange.weaponCell(field.key, row.id, c.key, e.target.value) : undefined}
              disabled={readOnly}
            >
              <option value="">—</option>
              {opts.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          );
        }
        return (
          <input
            key={c.key}
            type={c.type === 'number' ? 'number' : 'text'}
            className={`custom-sheet__weapon-cell-input${c.key === nameKey ? ' custom-sheet__weapon-cell-input--name' : ''}`}
            value={val}
            onChange={onChange ? e => onChange.weaponCell(field.key, row.id, c.key, e.target.value) : undefined}
            readOnly={readOnly}
          />
        );
      })}

      {hasDamage && (
        <div className="custom-sheet__weapon-damage">
          {renderDamageFormula(field.damageFormula || [], row, field.key, onChange, readOnly, t)}
        </div>
      )}

      <div className="custom-sheet__weapon-actions">
        {field.rollable && renderRoll(row, issue)}
        {onChange && (
          <button
            className="custom-sheet__weapon-remove"
            onClick={() => onChange.weaponRemove(field.key, row.id)}
            title={t('customSheet.removeWeapon')}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export default WeaponsTableRow;
```

- [ ] **Step 3: Utwórz `WeaponsTable.jsx`**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import StarIcon from '@mui/icons-material/Star';
import { AFFORDANCE_ICON_SIZE } from './affordances';
import {
  weaponGridTemplate, weaponRowLabel, weaponIssueTitle,
  collectSkillOptions, weaponSkillColumn,
} from '../weaponLayout';
import WeaponsPresetRow from './WeaponsPresetRow';
import WeaponsTableRow from './WeaponsTableRow';

// The weapons_table field: a header bar, the GM's always-on weapons, the player's own, and a
// footer that adds either kind.
//
// The columns are the GM's, so their widths come from weaponGridTemplate and the same string goes
// to the header and to every row. Before FEATURE-224 both were flex rows that happened to hold
// the same number of flex: 1 children — an agreement nothing enforced, over a column set the GM
// can change.
//
// The footer is a sibling of the table container, not of the rows: the zebra striping counts
// sibling parity, so a footer inside would be counted as a row and flip the tint of everything
// after it.
function WeaponsTable({
  field,
  sections,
  weapons,
  customSkillNodes,
  favoriteWeapons,
  onChange,
  onRoll,
  onToggleFavorite,
  readOnly,
  showStar,
  rollAffordance,
}) {
  const { t } = useTranslation();

  const cols      = field.columns || [];
  const rows      = weapons[field.key] || [];
  const dmgBlocks = field.damageFormula || [];
  const hasDamage = dmgBlocks.length > 0;
  const presets   = field.presetWeapons || [];
  const alwaysOnPresets = presets.filter(p => p.alwaysOn);
  const catalogPresets  = presets.filter(p => !p.alwaysOn);

  const skillOptions = weaponSkillColumn(field)
    ? collectSkillOptions(sections, customSkillNodes)
    : [];

  // The name column is the first text column — the same one weaponRowLabel logs a roll under.
  const nameKey = (cols.find(c => c.type === 'text') || {}).key;

  const gridTemplate = weaponGridTemplate(field, {
    showStar,
    showActions: true,
    hasDamage,
  });

  // Resolves a select cell to its display label (skill name or option label).
  const cellLabel = (c, val) => {
    if (c.type !== 'select') return val;
    const opts = c.optionsFromSkills
      ? skillOptions
      : (c.options || []).map(o => ({ key: o, label: o }));
    return opts.find(o => o.key === val)?.label || val;
  };

  // The star is the weapons table's own, not starAffordance's: favourites here are toggled
  // through onChange.weaponFavorite by row id, while the skill fields' helper calls
  // onToggleFavorite with a skill key. What it borrows is the rule that matters — render a dead
  // copy when there is no handler, so the creator reserves the same width the game fills.
  const renderStar = (id) => {
    const active = favoriteWeapons.includes(id);
    if (onToggleFavorite) {
      return (
        <button
          className={`custom-sheet__star-btn${active ? ' custom-sheet__star-btn--active' : ''}`}
          onClick={() => onChange && onChange.weaponFavorite(id)}
          disabled={readOnly}
        >
          <StarIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
        </button>
      );
    }
    return (
      <span className="custom-sheet__star-btn custom-sheet__star-btn--static" aria-hidden="true">
        <StarIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
      </span>
    );
  };

  const renderRoll = (row, issue) => rollAffordance(
    () => !issue && onRoll({ weaponFieldKey: field.key, weaponRowId: row.id, label: weaponRowLabel(field, row, t) }),
    { disabled: !!issue, title: weaponIssueTitle(issue, t) },
  );

  return (
    <div className="custom-sheet__field custom-sheet__field--weapon-table">
      <div className="custom-sheet__section-title">{field.label}</div>
      <div className="custom-sheet__weapon-table">
        <div className="custom-sheet__field-header" style={{ gridTemplateColumns: gridTemplate }}>
          {showStar && <span className="custom-sheet__weapon-col-label" />}
          {cols.map(c => (
            <span key={c.key} className="custom-sheet__weapon-col-label">{c.label}</span>
          ))}
          {hasDamage && <span className="custom-sheet__weapon-col-label">{t('customSheet.damage')}</span>}
          <span className="custom-sheet__weapon-col-label" />
        </div>

        {alwaysOnPresets.map(preset => (
          <WeaponsPresetRow
            key={preset.id}
            field={field}
            preset={preset}
            cols={cols}
            cellLabel={cellLabel}
            nameKey={nameKey}
            gridTemplate={gridTemplate}
            hasDamage={hasDamage}
            showStar={showStar}
            renderStar={renderStar}
            renderRoll={renderRoll}
          />
        ))}

        {rows.map(row => (
          <WeaponsTableRow
            key={row.id}
            field={field}
            row={row}
            cols={cols}
            skillOptions={skillOptions}
            nameKey={nameKey}
            gridTemplate={gridTemplate}
            hasDamage={hasDamage}
            showStar={showStar}
            onChange={onChange}
            readOnly={readOnly}
            renderStar={renderStar}
            renderRoll={renderRoll}
          />
        ))}
      </div>

      {onChange && (
        <div className="custom-sheet__weapon-add-row">
          <button className="custom-sheet__weapon-add-btn" onClick={() => onChange.weaponAdd(field.key)}>
            + {t('customSheet.addWeapon')}
          </button>
          {catalogPresets.length > 0 && (
            <select
              className="custom-sheet__weapon-preset-picker"
              value=""
              onChange={e => {
                const preset = catalogPresets.find(p => p.id === e.target.value);
                if (preset) onChange.weaponAddFromPreset(field.key, preset);
              }}
            >
              <option value="">+ {t('customSheet.addWeaponFromList')}</option>
              {catalogPresets.map(p => (
                <option key={p.id} value={p.id}>{weaponRowLabel(field, p, t)}</option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

export default WeaponsTable;
```

Zwróć uwagę, czego w sygnaturze **nie ma**: `showAffordances`. Tabela broni go nie czyta —
`showStar` liczy rodzic, bo to jego polityka afordancji, i tylko ten jeden boolean tu wchodzi.

Stopka trafiła **poza** `.custom-sheet__weapon-table`, inaczej niż dziś. To celowe: zebra liczy
rodzeństwo, a stopka nie jest wierszem.

- [ ] **Step 4: Zamień `case 'weapons_table'` w `CustomSheetBody.jsx`**

Import obok pozostałych z `./fields/`:

```jsx
import WeaponsTable from './fields/WeaponsTable';
```

Cały `case 'weapons_table': { … }` zastąp tym:

```jsx
      case 'weapons_table': {
        // The star joins the affordance policy the skill fields have used since FEATURE-219:
        // reserve its track when a handler exists OR the creator asked for static affordances.
        // Until now this row gated the star on the handler alone while the header reserved 22px
        // unconditionally, so in the creator every column sat 22px away from its own label.
        const showStar = !!onToggleFavorite || showAffordances;

        return (
          <WeaponsTable
            key={field.key}
            field={field}
            sections={sections}
            weapons={weapons}
            customSkillNodes={customSkillNodes}
            favoriteWeapons={favoriteWeapons}
            onChange={onChange}
            onRoll={onRoll}
            onToggleFavorite={onToggleFavorite}
            readOnly={readOnly}
            showStar={showStar}
            rollAffordance={rollAffordance}
          />
        );
      }
```

- [ ] **Step 5: Sprawdź, że nic osieroconego nie zostało**

Run: `cd warhammer-battle-helper-front/src && grep -n "weapon" systems/custom/CustomSheetBody.jsx`
Expected: wyłącznie `import WeaponsTable`, `case 'weapons_table'` z jego ciałem oraz prop
`favoriteWeapons` w sygnaturze komponentu. Żadnego `cellLabel`, `catalogPresets`, `StarIcon` dla
broni ani `custom-sheet__weapon-*`. Usuń importy, które straciły konsumenta.

- [ ] **Step 6: Uruchom testy i zaktualizuj snapshoty**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='CustomSheetBody|weaponLayout|CharacterDetails|TemplateBuilder' -u`
Expected: PASS. Snapshoty **zmienią się istotnie** — markup przechodzi z flexa na siatkę. Jak
w FEATURE-220, nietknięty snapshot nie byłby tu dowodem niczego.

Jeśli padnie `CustomSheetBody.weaponRowIssue.test.jsx`, **nie poprawiaj testu bez zrozumienia** —
on pilnuje, że rzut jest zablokowany dla niekompletnego wiersza, co ma zostać identyczne.

- [ ] **Step 7: Obejrzyj różnicę w snapshocie**

Run: `git diff warhammer-battle-helper-front/src/systems/custom/__snapshots__/`
Expected: w gałęzi broni pojawia się `custom-sheet__field-header` i `grid-template-columns` na
wierszach; w renderze sesyjnym gwiazdka jak dotąd, w read-only dochodzi `--static`. Gałęzie
umiejętności i drzewka **nie mogą** się zmienić.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src
git commit -m "refactor: FEATURE-224 move the weapons table into its own components

Header and rows were two flex rows that happened to hold the same number
of flex: 1 children, over a column set the GM defines — nothing enforced
the agreement. They share one grid template now.

The star also joins the affordance policy: it was gated on the handler
alone while the header reserved its slot unconditionally, so in the
creator every column sat 22px from its label.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Skórka CSS

**Files:**
- Modify: `warhammer-battle-helper-front/src/style.css` (sekcja broni, ok. 8518–8750)

**Interfaces:**
- Consumes: klasy wypisywane przez trzy komponenty z Taska 4.
- Produces: końcowy wygląd; żaden kod JS tego nie czyta.

- [ ] **Step 1: Kontener i nagłówek**

Zastąp `.custom-sheet__weapon-table` i `.custom-sheet__weapon-table-header`:

```css
.custom-sheet__weapon-table {
    display: flex;
    flex-direction: column;
    gap: 0;
    width: 100%;
}
```

Reguła `.custom-sheet__weapon-table-header` **znika** — nagłówek używa teraz wspólnej
`.custom-sheet__field-header`, przemianowanej w Tasku 3.

Zastąp `.custom-sheet__weapon-col-label` (traci `flex: 1`, bo tory daje siatka):

```css
.custom-sheet__weapon-col-label {
    font-family: 'Cinzel', serif;
    font-size: 10px;
    color: #fff9f0;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
```

Usuń `.custom-sheet__weapon-col--star` i `.custom-sheet__weapon-col--actions` — ich szerokości
daje teraz `weaponGridTemplate`, a dwa źródła tej samej liczby to dwa źródła, które się rozjadą.
Sprawdź wcześniej, czy nie ma ich już w JSX: `grep -rn "weapon-col--" src/`.

- [ ] **Step 2: Wiersz, zebra, hover**

Zastąp `.custom-sheet__weapon-row` i jego `:hover`:

```css
/* One grid per weapon row, its columns handed in from JS (weaponGridTemplate) so the header and
   the rows of a field can never disagree about where a column starts — which matters more here
   than in the skill lists, because the GM defines the columns.
   The zebra below counts SIBLING parity and the header is the first child of the table, so the
   header must stay unconditional. The add-weapon footer is a sibling of the table container, not
   of the rows, and must stay there: inside, it would be counted as a row. */
.custom-sheet__weapon-row {
    display: grid;
    align-items: center;
    gap: 8px;
    padding: 2px 4px;
    min-height: 26px;
    border-bottom: 1px solid rgba(201, 151, 91, 0.5);
    transition: background 0.12s;
}

.custom-sheet__weapon-row:nth-child(even) {
    background: rgba(255, 249, 240, 0.55);
}

/* Equal specificity with the zebra rule above (0,2,0), so it must come after it to win. Gold
   here, unlike the skill tree's brown: that field has depth bands this value would land between,
   and this one has none. */
.custom-sheet__weapon-row:hover {
    background: rgba(201, 151, 91, 0.14);
}
```

Reguła `.custom-sheet__weapon-row--preset` (tło `0.08`) **znika**: tło należy teraz do zebry,
a broń MG rozpoznaje się przygaszonym tekstem.

- [ ] **Step 3: Komórki**

Zastąp `.custom-sheet__weapon-cell-input, .custom-sheet__weapon-cell-select` oraz ich `:focus`,
i dopisz warianty nazwy:

```css
/* Anchored under the row class for the same reason the skill lists anchor theirs: one stylesheet
   holds three field skins and the anchor is what keeps them apart. */
.custom-sheet__weapon-row .custom-sheet__weapon-cell-input,
.custom-sheet__weapon-row .custom-sheet__weapon-cell-select {
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 2px 4px;
    color: #3a2f1f;
    font-size: 0.9rem;
    font-family: inherit;
}

.custom-sheet__weapon-row .custom-sheet__weapon-cell-input:focus,
.custom-sheet__weapon-row .custom-sheet__weapon-cell-select:focus {
    outline: 2px solid #7a5c42;
    outline-offset: -2px;
    background: rgba(255, 255, 255, 0.55);
}

/* The weapon's name identifies the row, the way the total identifies a skill row. */
.custom-sheet__weapon-row .custom-sheet__weapon-cell-input--name {
    font-weight: 700;
}
```

Zastąp `.custom-sheet__weapon-cell-static`:

```css
.custom-sheet__weapon-cell-static {
    min-width: 0;
    padding: 2px 4px;
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    /* Muted, not tinted: the row's background belongs to the zebra now, and with borderless
       inputs a static cell and an editable one would otherwise look identical. This is the same
       second-plane brown the skill table uses for base and advances. */
    color: #6b5a45;
}

.custom-sheet__weapon-cell-static--name {
    font-weight: 700;
}
```

- [ ] **Step 4: Stopka i spinner**

`.custom-sheet__weapon-add-row` dostaje `margin-top: 6px` zamiast `2px` — stoi teraz pod linią
ostatniego wiersza, a nie w odstępie `gap`.

Sprawdź, czy `.custom-sheet__weapon-dmg-input` ma parę `appearance` / `-moz-appearance`; jeśli ma
tylko prefiksowaną, dopisz nieprefiksowaną obok, jak w pozostałych dwóch listach.

- [ ] **Step 5: Uruchom testy**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='CustomSheetBody|weaponLayout'`
Expected: PASS, snapshoty bez zmian, bez `-u`. **jsdom nie wczytuje `style.css`**, więc ten
przebieg potwierdza wyłącznie, że nie ruszyłeś JS — nie mówi nic o wyglądzie.

- [ ] **Step 6: Audyt kolejności i sierot**

Przejrzyj swój diff jako arkusz. Wypisz w raporcie pary reguł o równej specyficzności wraz
z numerami linii w kolejności z pliku — co najmniej zebra kontra `:hover` oraz reguła komórek
kontra jej `:focus`.

Potem zestaw klasy wypisywane przez trzy komponenty z Taska 4 z regułami w arkuszu, w obie strony:
klasa bez reguły renderuje się goła, reguła bez konsumenta zmyli następnego czytelnika.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/style.css
git commit -m "feat: FEATURE-224 skin the weapons table

Header bar, rules and zebra as the skill table has. The GM's own weapons
lose their tint to the zebra and are told apart by muted text, because
borderless inputs make a static cell and an editable one look alike.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Weryfikacja w przeglądarce

jsdom nie wczytuje `style.css` i nie liczy layoutu, więc **żaden test nie sprawdził wyglądu**.
W FEATURE-219 ten krok wyłapał rozjechane rozmiary ikon, a w FEATURE-220 recenzja znalazła trzy
zachowania zgubione przy przebudowie, których nie złapał ani jeden test.

**Files:** żadnych zmian w kodzie, chyba że coś wyjdzie.

- [ ] **Step 1: Uruchom stack**

Run: `docker compose up -d` z katalogu głównego repo, potem otwórz `http://localhost:3000`.

- [ ] **Step 2: Przejdź listę kontrolną**

1. broń MG obok broni gracza — przygaszony tekst czytelnie odróżnia, kłódka na miejscu;
2. kolumny `text`, `select`, `number` — czy proporcje mają sens przy czterech i przy siedmiu kolumnach;
3. długa nazwa broni — wielokropek, sąsiednie kolumny stoją;
4. długa formuła obrażeń — zawinięcie podbija jeden wiersz, reszta bez zmian;
5. tabela **bez** kolumny obrażeń;
6. tabela bez żadnej kolumny `text` (same `select` i `number`);
7. zebra: pierwszy wiersz pod paskiem jest przyciemniony i zostaje taki po dodaniu broni;
8. **kreator obok gry — te same szerokości wierszy**, z gwiazdką obecną statycznie w kreatorze;
9. dodanie broni z katalogu presetów i ręcznie;
10. Tab po wierszu — widać, gdzie jest fokus, także na `select`.

- [ ] **Step 3: Zrzuty**

Minimum dwa: tabela z bronią MG i bronią gracza oraz ta sama tabela w kreatorze. Po akceptacji
użytkownika zadanie zamknięte.

---

## Podsumowanie pokrycia spec-a

| Wymaganie ze spec-a | Zadanie |
|---|---|
| `weaponLayout.js` jako dom pomocników broni | 1 |
| Trzej importerzy przepięci (kreator, skrócona karta, test) | 1 |
| `weaponGridTemplate`, tory z typu kolumny | 2 |
| Nazwa = pierwsza kolumna `text`, zgodnie z `weaponRowLabel` | 2 |
| `minmax(0, …)` na torach elastycznych | 2 |
| Klasa paska wspólna dla trzech list | 3 |
| Trzy komponenty, dwa osobne rodzaje wiersza | 4 |
| Gwiazdka w polityce afordancji (parytet kreator/gra) | 4 |
| Stopka poza kontenerem wierszy | 4 |
| Pasek, linie, zebra, hover złoty | 5 |
| Nazwa pogrubiona, komórki broni MG przygaszone | 5 |
| Reguły zakotwiczone w klasie wiersza | 5 |
| Kolumna obrażeń zostaje zawijalna | 5 (brak zmian, punkt 4 weryfikacji) |
| Brak nowych kluczy i18n | 1–5 |
| Weryfikacja ręczna | 6 |

Odstępstwo od spec-a, świadome: spec wymieniał kreator jako importera pomocników. Konsumentów są
trzy — dochodzi **skrócona karta postaci** (`CharacterDetails.jsx:8`) i plik testowy. Skrócona
karta już dwa razy w tym projekcie była czytelnikiem, o którym ktoś zapomniał, więc jest wymieniona
w Tasku 1 z nazwy.

---

## Uzupełnienie planu: wiersz gracza domyślnie do odczytu

Dopisane 2026-10-02 po weryfikacji w przeglądarce. Spec: sekcja „Uzupełnienie" w `FEATURE-224.md`.
Zadania 7 i 8 wykonuje się po Tasku 6 (przeglądarka), na tej samej gałęzi.

Rozdzielone na dwa, bo przeniesienie kostki musi wylądować **razem** z szablonem siatki — inaczej
nagłówek i wiersze policzą inną liczbę torów — a tryby odczytu i edycji to osobna zmiana
zachowania, którą recenzent powinien móc odrzucić niezależnie.

---

### Task 7: Kostka dostaje własny tor

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/weaponLayout.js` (`weaponGridTemplate`)
- Modify: `warhammer-battle-helper-front/src/systems/custom/weaponLayout.test.js`
- Modify: `warhammer-battle-helper-front/src/systems/custom/fields/WeaponsTable.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/fields/WeaponsTableRow.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/fields/WeaponsPresetRow.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (`case 'weapons_table'`)
- Modify: `warhammer-battle-helper-front/src/style.css`

**Interfaces:**
- Produces: `weaponGridTemplate(field, { showStar, showRoll, showActions, hasDamage })` — nowa flaga `showRoll` wstawia tor `28px` **między** obrażenia a akcje.

- [ ] **Step 1: Zaktualizuj testy szablonu (najpierw czerwone)**

W `weaponLayout.test.js` zastąp test rezerwujący kolumny opcjonalne tym, i dopisz drugi:

```js
  it('reserves the star, the damage column, the die and the actions only when asked', () => {
    expect(weaponGridTemplate({ columns: cols('text') }, { showStar: true, hasDamage: true, showRoll: true, showActions: true }))
      .toBe('22px minmax(0, 2fr) minmax(0, 1fr) 28px 52px');
  });

  // The die sits between the damage column and the actions, matching the order the row renders
  // them in — a template whose track order disagreed with the markup would put every control in
  // the wrong cell while still having the right number of tracks.
  it('puts the die after the damage column and before the actions', () => {
    expect(weaponGridTemplate({ columns: cols('text') }, { showRoll: true, showActions: true }))
      .toBe('minmax(0, 2fr) 28px 52px');
  });
```

- [ ] **Step 2: Uruchom testy — mają paść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=weaponLayout`
Expected: FAIL — otrzymane stringi bez toru `28px`.

- [ ] **Step 3: Dopisz flagę w `weaponGridTemplate`**

Sygnatura i tablica torów:

```js
export function weaponGridTemplate(field, { showStar = false, showRoll = false, showActions = false, hasDamage = false } = {}) {
```

```js
  return [
    showStar && '22px',
    ...columns.map(trackFor),
    hasDamage && 'minmax(0, 1fr)',
    showRoll && '28px',
    showActions && '52px',
  ].filter(Boolean).join(' ');
```

Do komentarza funkcji dopisz zdanie: tor kostki jest osobny, bo tor akcji musi pomieścić dwa
przyciski gracza w trybie edycji, a kostka wciśnięta między nie zostawiłaby na nie 52px na troje.

- [ ] **Step 4: Przenieś kostkę z `weapon-actions` do własnej komórki**

W `WeaponsTableRow.jsx` wyjmij ją z `<div className="custom-sheet__weapon-actions">`, tak by stała
bezpośrednim dzieckiem wiersza, przed tym divem:

```jsx
      {showRoll && renderRoll(row, issue)}

      <div className="custom-sheet__weapon-actions">
        {onChange && (
          <button
            className="custom-sheet__weapon-remove"
            onClick={() => onChange.weaponRemove(field.key, row.id)}
            title={t('customSheet.removeWeapon')}
          >
            <CloseIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
          </button>
        )}
      </div>
```

`showRoll` dochodzi do propsów komponentu; znika z niego warunek `field.rollable`, bo flagę liczy
teraz rodzic.

To samo w `WeaponsPresetRow.jsx` — kostka przed `weapon-actions`, w divie zostaje sama kłódka:

```jsx
      {showRoll && renderRoll(preset, issue)}

      <div className="custom-sheet__weapon-actions">
        <span className="custom-sheet__weapon-lock" title={t('customSheet.weaponPresetLocked')}>
          <LockIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
        </span>
      </div>
```

- [ ] **Step 5: Policz flagę w rodzicu i przekaż ją**

W `CustomSheetBody.jsx`, w `case 'weapons_table'`, obok istniejącego `showStar`:

```jsx
        const showRoll = !!field.rollable && (!!onRoll || showAffordances);
```

i przekaż `showRoll={showRoll}` do `<WeaponsTable>`. To ta sama polityka afordancji co dla
gwiazdki: tor rezerwuje się wtedy i tylko wtedy, gdy coś może się w nim wyrenderować, a kreator
liczy się tak samo jak gra.

W `WeaponsTable.jsx` dodaj `showRoll` do propsów, przekaż go do `weaponGridTemplate` i do obu
komponentów wiersza, a w nagłówku dołóż rozpórkę dokładnie tam, gdzie tor:

```jsx
          {hasDamage && <span className="custom-sheet__weapon-col-label">{t('customSheet.damage')}</span>}
          {showRoll && <span className="custom-sheet__weapon-col-label" />}
          <span className="custom-sheet__weapon-col-label" />
```

- [ ] **Step 6: Wyśrodkuj kostkę w jej torze**

W `style.css`, obok reguły robiącej to samo dla gwiazdki:

```css
.custom-sheet__weapon-row .custom-sheet__roll-btn {
    justify-self: center;
}
```

- [ ] **Step 7: Uruchom testy i zaktualizuj snapshoty**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='CustomSheetBody|weaponLayout' -u`
Expected: PASS. Snapshot zmienia się tak, że kostka wychodzi z `weapon-actions` i staje się
rodzeństwem tego diva, a `grid-template-columns` zyskuje `28px`. Obejrzyj diff: nic poza tym.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src
git commit -m "refactor: FEATURE-224 give the weapon roll a track of its own

It was the only one of the sheet's three lists keeping the die inside
the actions cell. That cell is about to hold two player buttons in edit
mode, and 52px does not fit three controls.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Wiersz gracza czyta się domyślnie, edytuje po ołówku

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/fields/WeaponsTableRow.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/fields/WeaponsTable.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (`case 'weapons_table'`)
- Modify: `warhammer-battle-helper-front/src/style.css`
- Modify: `warhammer-battle-helper-front/src/locales/{en,pl}/translation.json`
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.weaponsTable.test.jsx`

**Interfaces:**
- Consumes: `showRoll` i tor kostki z Taska 7; `editingPath`/`setEditingPath` z `CustomSheetBody` (ta sama para, którą dostają `SkillTable` i `SkillTree`).

- [ ] **Step 1: Dodaj klucze i18n**

`locales/en/translation.json`, w `customSheet`:

```json
      "editWeapon": "Edit weapon",
      "saveWeapon": "Done",
```

`locales/pl/translation.json`:

```json
      "editWeapon": "Edytuj broń",
      "saveWeapon": "Gotowe",
```

Nowe klucze, nie `editSkill`/`saveSkill`: tamte mówią „Edit name", a ołówek broni otwiera cały wiersz.

- [ ] **Step 2: Napisz testy (najpierw czerwone)**

Dopisz do `CustomSheetBody.weaponsTable.test.jsx`. Plik ma już fixture z presetem `alwaysOn`;
dołóż obok własny, z wierszem gracza:

```js
const playerWeaponSections = () => ([{
  id: 'sec1',
  columns: 1,
  fields: [
    {
      key: 'wpn_table',
      type: 'weapons_table',
      label: 'Bronie',
      columns: [{ key: 'name', label: 'Nazwa', type: 'text' }],
    },
  ],
}]);

const playerValues = { weapons: { wpn_table: [{ id: 'w1', cells: { name: 'Miecz' }, damage: {} }] } };

const noop = () => {};
const sheetHandlers = {
  skill: noop, skillAdvances: noop, text: noop, progress: noop, number: noop,
  weaponAdd: noop, weaponAddFromPreset: noop, weaponRemove: noop,
  weaponCell: noop, weaponDamage: noop, weaponFavorite: noop,
};

describe('CustomSheetBody weapons_table — read first, edit on the pencil', () => {
  const renderRow = () => render(
    <CustomSheetBody sections={playerWeaponSections()} values={playerValues} onChange={sheetHandlers} />
  );

  it('shows the weapon as text, not as inputs, until asked', () => {
    const { container } = renderRow();
    expect(container.querySelector('.custom-sheet__weapon-cell-input')).toBeNull();
    expect(container.querySelector('.custom-sheet__weapon-cell-static').textContent).toBe('Miecz');
  });

  // The whole point: the destructive control is the one a stray click must not reach.
  it('keeps the delete button out of reach while the row is at rest', () => {
    const { container } = renderRow();
    expect(container.querySelector('.custom-sheet__weapon-remove')).toBeNull();
  });

  it('turns the cells into inputs when the pencil is clicked', () => {
    const { container } = renderRow();
    fireEvent.click(container.querySelector('.custom-sheet__weapon-edit'));
    expect(container.querySelector('.custom-sheet__weapon-cell-input').value).toBe('Miecz');
    expect(container.querySelector('.custom-sheet__weapon-remove')).not.toBeNull();
  });

  it('goes back to text when the edit is closed', () => {
    const { container } = renderRow();
    fireEvent.click(container.querySelector('.custom-sheet__weapon-edit'));
    fireEvent.click(container.querySelector('.custom-sheet__weapon-save'));
    expect(container.querySelector('.custom-sheet__weapon-cell-input')).toBeNull();
  });

  // A GM weapon is not the player's to change, so it has no way in at all.
  it('gives a GM weapon no pencil', () => {
    const { container } = render(<CustomSheetBody sections={weaponsSections()} onChange={sheetHandlers} />);
    expect(container.querySelector('.custom-sheet__weapon-edit')).toBeNull();
  });
});
```

Sprawdź nazwę fixture z presetem w tym pliku i użyj jej w ostatnim teście zamiast `weaponsSections`,
jeśli nazywa się inaczej.

- [ ] **Step 3: Uruchom testy — mają paść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=weaponsTable`
Expected: FAIL — pierwszy test znajduje input zamiast `null`, bo wiersz renderuje dziś inputy zawsze.

- [ ] **Step 4: Rozdziel wiersz gracza na dwa tryby**

Całe ciało `WeaponsTableRow.jsx` — zmienia się lista propsów i renderowanie komórek oraz ogona:

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import EditIcon from '@mui/icons-material/Edit';
import { AFFORDANCE_ICON_SIZE } from './affordances';
import { renderDamageFormula, weaponRowIssue } from '../weaponLayout';

// One player-owned weapon row, in one of two modes.
//
// At rest it renders the same static cells a GM weapon does. A weapon is set up once and then
// rarely touched, so inputs that are always live spend most of the row's life offering nothing
// but a chance to change it by accident — and the cheapest stray click, delete, is the one that
// cannot be undone. The pencil guards all of it, delete included.
//
// Editing is a visibility gate, not a buffer: a keystroke still writes through onChange.weaponCell
// exactly as before, and the tick only closes the mode. The save itself is already debounced 800ms
// upstream in CharacterSheet's triggerAutoSave, so buffering here would turn one request into one
// request and buy nothing but an undo nobody asked for.
//
// Separate from WeaponsPresetRow rather than one component with a flag: a GM weapon has no edit
// mode to be in, no pencil and no delete, and its cells are muted because they are not the
// player's to change.
function WeaponsTableRow({
  field,
  row,
  cols,
  cellLabel,
  skillOptions,
  nameKey,
  gridTemplate,
  hasDamage,
  showStar,
  showRoll,
  editing,
  onStartEdit,
  onFinishEdit,
  onChange,
  readOnly,
  renderStar,
  renderRoll,
}) {
  const { t } = useTranslation();
  const issue = weaponRowIssue(field, row);

  return (
    <div className="custom-sheet__weapon-row" style={{ gridTemplateColumns: gridTemplate }}>
      {showStar && renderStar(row.id)}

      {cols.map(c => {
        const val = (row.cells && row.cells[c.key]) || '';

        if (!editing) {
          return (
            <span
              key={c.key}
              className={`custom-sheet__weapon-cell-static${c.key === nameKey ? ' custom-sheet__weapon-cell-static--name' : ''}`}
            >
              {cellLabel(c, val) || '—'}
            </span>
          );
        }

        if (c.type === 'select') {
          const opts = c.optionsFromSkills
            ? skillOptions
            : (c.options || []).map(o => ({ key: o, label: o }));
          return (
            <select
              key={c.key}
              className="custom-sheet__weapon-cell-select"
              value={val}
              onChange={onChange ? e => onChange.weaponCell(field.key, row.id, c.key, e.target.value) : undefined}
              disabled={readOnly}
            >
              <option value="">—</option>
              {opts.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          );
        }
        return (
          <input
            key={c.key}
            type={c.type === 'number' ? 'number' : 'text'}
            className="custom-sheet__weapon-cell-input"
            value={val}
            onChange={onChange ? e => onChange.weaponCell(field.key, row.id, c.key, e.target.value) : undefined}
            readOnly={readOnly}
          />
        );
      })}

      {hasDamage && (
        <div className="custom-sheet__weapon-damage">
          {/* readOnly at rest for the same reason the cells are static: the formula's number
              inputs are part of the weapon's definition, not of play. */}
          {renderDamageFormula(field.damageFormula || [], row, field.key, onChange, editing ? readOnly : true, t)}
        </div>
      )}

      {showRoll && renderRoll(row, issue)}

      <div className="custom-sheet__weapon-actions">
        {onChange && (editing ? (
          <>
            <button
              className="custom-sheet__weapon-save"
              onClick={() => onFinishEdit()}
              title={t('customSheet.saveWeapon')}
            >
              <CheckIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
            </button>
            <button
              className="custom-sheet__weapon-remove"
              onClick={() => onChange.weaponRemove(field.key, row.id)}
              title={t('customSheet.removeWeapon')}
            >
              <CloseIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
            </button>
          </>
        ) : (
          <button
            className="custom-sheet__weapon-edit"
            onClick={() => onStartEdit(row.id)}
            title={t('customSheet.editWeapon')}
          >
            <EditIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default WeaponsTableRow;
```

`cellLabel` dochodzi do propsów — wiersz gracza potrzebuje go teraz do tego samego, do czego od
początku potrzebuje go wiersz MG: rozwiązania wartości `select` na etykietę. Jedna funkcja, dwa
rodzaje wiersza, zero drugiej definicji.

- [ ] **Step 5: Podaj stan edycji z kontenera**

W `WeaponsTable.jsx` dodaj do propsów `editingPath` i `setEditingPath`, a w miejscu renderowania
wiersza gracza przekaż:

```jsx
            cellLabel={cellLabel}
            showRoll={showRoll}
            editing={editingPath === row.id}
            onStartEdit={setEditingPath}
            onFinishEdit={() => setEditingPath(null)}
```

W komentarzu komponentu dopisz, dlaczego to ta sama zmienna, którą edytują obie listy
umiejętności: na całej karcie edytuje się dokładnie jedna rzecz naraz, a kolizji kluczy nie ma,
bo klucze umiejętności mają kropkę i prefiks pola, a identyfikatory broni pochodzą z `genId`.

- [ ] **Step 6: Przekaż parę z `CustomSheetBody`**

W `case 'weapons_table'` dołóż do `<WeaponsTable>`:

```jsx
            editingPath={editingPath}
            setEditingPath={setEditingPath}
```

- [ ] **Step 7: Rozdziel przygaszenie w CSS**

Dziś `weapon-cell-static` **jest** komórką MG, więc niesie `color: #6b5a45`. Teraz renderuje ją
też wiersz gracza, a przygaszenie znaczy „to nie twoje", nie „to nie jest input".

W regule `.custom-sheet__weapon-row .custom-sheet__weapon-cell-static` zamień kolor na `#3a2f1f`
i dopisz **po niej**:

```css
/* Muted only for the GM's own weapons. The base static cell is now what a player's row renders at
   rest too, so the colour has to mean "not yours to change" rather than "not an input".
   --preset is the only hook that tells the two apart; it also mutes the preset's damage inputs. */
.custom-sheet__weapon-row--preset .custom-sheet__weapon-cell-static {
    color: #6b5a45;
}
```

Dołóż też reguły dla dwóch nowych przycisków, obok istniejącej `.custom-sheet__weapon-remove` —
to samo pudełko, inny kolor:

```css
.custom-sheet__weapon-edit,
.custom-sheet__weapon-save {
    border: none;
    background: transparent;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    border-radius: 3px;
    flex-shrink: 0;
}

.custom-sheet__weapon-edit { color: #7a5c42; }
.custom-sheet__weapon-save { color: #4a7a4a; }

.custom-sheet__weapon-edit:hover { background: rgba(122, 92, 66, 0.15); }
.custom-sheet__weapon-save:hover { background: rgba(74, 122, 74, 0.15); }
```

Usuń regułę `.custom-sheet__weapon-row .custom-sheet__weapon-cell-input--name`, jeśli jeszcze
istnieje — wariant `--name` inputu zniknął z JSX-a razem z pogrubieniem.

- [ ] **Step 8: Uruchom testy i zaktualizuj snapshoty**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='CustomSheetBody|weaponLayout' -u`
Expected: PASS, pięć nowych testów zielonych. Snapshot zmienia się tak, że wiersz gracza pokazuje
`span` zamiast `input` i ołówek zamiast `✕`.

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-front/src
git commit -m "feat: FEATURE-224 read a weapon row first, edit it on the pencil

A weapon is set up once and then rarely touched, so always-live inputs
spend most of a row's life offering nothing but a chance to change it by
accident — and the cheapest stray click, delete, is the one that cannot
be undone. The pencil guards all of it.

Editing is a visibility gate, not a buffer: keystrokes still write
through and the save is already debounced upstream, so a buffer would
turn one request into one request and buy only an undo nobody asked for.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
