# FEATURE-220 — Skórka drzewka umiejętności — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pole `skill_tree` w karcie custom dostaje wyrównane kolumny, pasek nagłówka, pasma głębokości i prowadnice — a jego rekurencja zamienia się w jedną listę wierszy liczoną czystą funkcją.

**Architecture:** `flattenTree` w `skillLayout.js` spłaszcza drzewo do listy `{key, label, depth, hasChildren, isOpen, kind}`; renderują ją nowe `fields/SkillTree.jsx` i `fields/SkillTreeRow.jsx`. Nagłówek jest wspólny z tabelą (`SkillTableHeader` → `SkillFieldHeader`). Wcięcie przenosi się z całego wiersza do komórki nazwy, razem z trójkącikiem.

**Tech Stack:** React 18, `react-i18next`, MUI Icons, CRA + Jest + React Testing Library, jeden globalny `style.css` (BEM).

**Spec:** `docs/superpowers/specs/FEATURE-220.md`

## Global Constraints

- Komentarze w kodzie **zawsze po angielsku**, bez wyjątków. Spec i plan po polsku.
- Żadnych stringów wprost w JSX — każdy tekst przez `t('klucz')`, klucze angielskie, tłumaczenia w `locales/en` **i** `locales/pl`. To zadanie **nie dodaje żadnych nowych kluczy** — nagłówek używa istniejących `customSheet.name` i `customSheet.value`.
- Ikony wyłącznie z `@mui/icons-material`, rozmiar **zawsze** ze stałej `AFFORDANCE_ICON_SIZE` (`systems/custom/fields/affordances.js`) — nigdy liczbą wprost.
- Klasy CSS karty custom: prefiks `custom-sheet__`. Żadnych `coc-*`.
- Paleta karty: tekst `#3a2f1f`, etykiety `#7a5c42`, akcent `#c9975b`, tło inputu `#fff9f0`, ramka `#c4a882`.
- **Modyfikator CSS musi stać w pliku ZA regułą bazową o tej samej specyficzności** — inaczej jest martwy (CLAUDE.md).
- Reguły wartości w drzewie muszą być **zakotwiczone w klasie wiersza drzewa**. Tabela i drzewo renderują tę samą klasę `custom-sheet__skill-val-input`; od FEATURE-219 to zakotwiczenie jest jedyną rzeczą, która trzyma oba wyglądy osobno.
- Klucze umiejętności **nie mogą zawierać kropki** poza rolą separatora ścieżki — mennica `genId` (`utils/surrogateKeys.js`) to gwarantuje i ma na to testy. Nie buduj kluczy ręcznie.
- Uruchamianie testów wyłącznie przez CRA, z katalogu `warhammer-battle-helper-front/`:
  `CI=true npm test -- --watchAll=false --testPathPattern='CustomSheetBody|skillLayout'`
  Gołe `npx jest` **nie działa**. Znany baseline fail pełnej suity: `App.test.js` (axios ESM) — nie regresja, poza tym wzorcem.
- Nie ruszamy `weapons_table`, modelu danych, kluczy, rzutów ani flag MG w kreatorze.

## Struktura plików

| Plik | Odpowiedzialność |
|---|---|
| `systems/custom/skillLayout.js` | **modyfikowany** — dochodzą `flattenTree` i `treeGridTemplate` |
| `systems/custom/skillLayout.test.js` | **modyfikowany** — testy obu nowych funkcji |
| `systems/custom/fields/SkillFieldHeader.jsx` | **przemianowany** z `SkillTableHeader.jsx`; wspólny dla tabeli i drzewa |
| `systems/custom/fields/SkillTreeRow.jsx` | **nowy** — jeden wiersz drzewa o danej głębokości |
| `systems/custom/fields/SkillTree.jsx` | **nowy** — kontener: stan rozwinięć, dodawanie, rename, dwie kolumny |
| `systems/custom/fields/SkillTable.jsx` | **modyfikowany** — jeden import nagłówka |
| `systems/custom/CustomSheetBody.jsx` | **modyfikowany** — cała rekurencja drzewa i jego stan wychodzą |
| `style.css` | **modyfikowany** — sekcja drzewa przepisana, nagłówek przemianowany |

Kolejność: najpierw czysta arytmetyka bez konsumentów (1), potem przemianowanie nagłówka przy zamrożonym DOM (2), potem przeniesienie drzewa (3), CSS (4), przeglądarka (5).

---

### Task 1: `flattenTree` i `treeGridTemplate`

Czysta arytmetyka układu, bez DOM i bez konsumentów. Po tym zadaniu nic w aplikacji nie wygląda inaczej.

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/skillLayout.js`
- Test: `warhammer-battle-helper-front/src/systems/custom/skillLayout.test.js`

**Interfaces:**
- Consumes: istniejące `siblingItems(parentPath, templateChildren, customSkillNodes)` i `sortItems(items, fieldSort)` z tego samego pliku.
- Produces:
  - `treeGridTemplate({ showDevelopment, showStar, showRoll, showActions }) → string`
  - `flattenTree(rootPath, items, customSkillNodes, { expanded, sort, addingUnderPath }) → Row[]`, gdzie
    `Row` to `{ kind: 'node', key, label, attr, depth, custom, hasChildren, isOpen }`
    albo `{ kind: 'addForm', key, parentPath, depth }`.

- [ ] **Step 1: Napisz testy (najpierw czerwone)**

Dopisz na końcu `skillLayout.test.js`. Import na górze pliku rozszerz o dwie nowe nazwy:

```js
import {
  skillGridTemplate, buildSkillRows, splitHalf, siblingItems, sortItems,
  subtreeSize, splitBranchesWeighted, resolveSkillValues,
  flattenTree, treeGridTemplate,
} from './skillLayout';
```

(zachowaj te nazwy, które plik importuje dziś — dopisz tylko dwie ostatnie).

```js
// Broń biała -> Jednoręczna -> Miecz / Topór, plus płytka gałąź Wiedza -> Imperium. Trzy poziomy,
// bo trzy to realny przypadek i dopiero na trzecim widać, czy głębokość liczy się poprawnie.
const treeField = {
  key: 'fld_tree',
  tree: {
    key: 'root',
    children: [
      {
        key: 'melee', label: 'Broń biała', children: [
          { key: 'one_h', label: 'Jednoręczna', children: [
            { key: 'sword', label: 'Miecz', children: [] },
            { key: 'axe',   label: 'Topór',  children: [] },
          ] },
        ],
      },
      { key: 'lore', label: 'Wiedza', children: [
        { key: 'empire', label: 'Imperium', children: [] },
      ] },
    ],
  },
};

const rootItemsOf = (field, custom = {}, sort = false) =>
  sortItems(siblingItems(field.key, field.tree.children, custom), sort);

const flattenField = (field, custom = {}, opts = {}) =>
  flattenTree(field.key, rootItemsOf(field, custom, opts.sort), custom, opts);

describe('treeGridTemplate', () => {
  it('has no advances columns and reserves a wider action track than the table', () => {
    expect(treeGridTemplate({ showDevelopment: true, showStar: true, showRoll: true, showActions: true }))
      .toBe('20px 1fr 72px 24px 28px 64px');
  });

  it('drops every optional track when its flag is off', () => {
    expect(treeGridTemplate()).toBe('1fr 72px');
  });
});

describe('flattenTree', () => {
  it('walks depth-first and numbers the depth of every row', () => {
    const rows = flattenField(treeField);
    expect(rows.map(r => [r.label, r.depth])).toEqual([
      ['Broń biała', 0],
      ['Jednoręczna', 1],
      ['Miecz', 2],
      ['Topór', 2],
      ['Wiedza', 0],
      ['Imperium', 1],
    ]);
  });

  it('builds a key by appending the node key to its parent path', () => {
    const rows = flattenField(treeField);
    expect(rows.find(r => r.label === 'Miecz').key).toBe('fld_tree.melee.one_h.sword');
  });

  it('marks which rows can expand, and leaves a leaf alone', () => {
    const rows = flattenField(treeField);
    const by = (label) => rows.find(r => r.label === label);
    expect(by('Broń biała').hasChildren).toBe(true);
    expect(by('Jednoręczna').hasChildren).toBe(true);
    expect(by('Miecz').hasChildren).toBe(false);
  });

  // The state holds only the exceptions: a branch nobody has touched is open.
  it('treats an untouched branch as open', () => {
    expect(flattenField(treeField, {}, { expanded: {} }).some(r => r.label === 'Miecz')).toBe(true);
  });

  it('drops the descendants of a collapsed branch, the whole subtree at once', () => {
    const rows = flattenField(treeField, {}, { expanded: { 'fld_tree.melee': false } });
    expect(rows.map(r => r.label)).toEqual(['Broń biała', 'Wiedza', 'Imperium']);
  });

  it('collapses only below the branch that was closed', () => {
    const rows = flattenField(treeField, {}, { expanded: { 'fld_tree.melee.one_h': false } });
    expect(rows.map(r => r.label)).toEqual(['Broń biała', 'Jednoręczna', 'Wiedza', 'Imperium']);
  });

  it('puts the add form under its parent, one level deeper', () => {
    const rows = flattenField(treeField, {}, { addingUnderPath: 'fld_tree.lore' });
    expect(rows.map(r => r.kind === 'addForm' ? ['<form>', r.depth] : [r.label, r.depth])).toEqual([
      ['Broń biała', 0],
      ['Jednoręczna', 1],
      ['Miecz', 2],
      ['Topór', 2],
      ['Wiedza', 0],
      ['Imperium', 1],
      ['<form>', 1],
    ]);
    expect(rows.find(r => r.kind === 'addForm').parentPath).toBe('fld_tree.lore');
  });

  // Adding under a collapsed branch has to reveal it — otherwise the player types into a form
  // they cannot see.
  it('reveals a collapsed branch while something is being added under it', () => {
    const rows = flattenField(treeField, {}, {
      expanded: { 'fld_tree.melee': false },
      addingUnderPath: 'fld_tree.melee',
    });
    expect(rows.map(r => r.kind === 'addForm' ? '<form>' : r.label))
      .toEqual(['Broń biała', 'Jednoręczna', 'Miecz', 'Topór', '<form>', 'Wiedza', 'Imperium']);
  });

  it('weaves the player\'s own nodes in among the template\'s, per level', () => {
    const custom = {
      'fld_tree.melee.one_h.dagger': { label: 'Sztylet' },
      'fld_tree.aaa': { label: 'Alchemia' },
    };
    const rows = flattenTree(
      treeField.key,
      sortItems(siblingItems(treeField.key, treeField.tree.children, custom), true),
      custom,
      { sort: true },
    );
    expect(rows.map(r => r.label)).toEqual([
      'Alchemia', 'Broń biała', 'Jednoręczna', 'Miecz', 'Sztylet', 'Topór', 'Wiedza', 'Imperium',
    ]);
  });

  it('tells a player-added row apart from a template one', () => {
    const custom = { 'fld_tree.aaa': { label: 'Alchemia' } };
    const rows = flattenTree(
      treeField.key,
      siblingItems(treeField.key, treeField.tree.children, custom),
      custom,
      {},
    );
    expect(rows.find(r => r.label === 'Alchemia').custom).toBe(true);
    expect(rows.find(r => r.label === 'Wiedza').custom).toBe(false);
  });

  it('carries a node\'s linked attribute through, from both kinds of node', () => {
    const custom = { 'fld_tree.aaa': { label: 'Alchemia', linkedAttr: 'fld_int' } };
    const field = {
      key: 'fld_tree',
      tree: { key: 'root', children: [{ key: 'lore', label: 'Wiedza', linkedAttr: 'fld_wp', children: [] }] },
    };
    const rows = flattenTree(field.key, siblingItems(field.key, field.tree.children, custom), custom, {});
    expect(rows.find(r => r.label === 'Wiedza').attr).toBe('fld_wp');
    expect(rows.find(r => r.label === 'Alchemia').attr).toBe('fld_int');
  });

  // Two columns: the caller cuts the ROOT branches and hands one half in. Flattening first and
  // cutting the flat list in half would slice a branch down the middle and leave the second
  // column's indents hanging under no parent.
  it('flattens one column\'s branches without reaching into the other\'s', () => {
    const [left, right] = splitBranchesWeighted(
      rootItemsOf(treeField),
      (item) => subtreeSize(item.node, `${treeField.key}.${item.node.key}`, {}),
    );
    expect(flattenTree(treeField.key, left, {}, {}).map(r => r.label))
      .toEqual(['Broń biała', 'Jednoręczna', 'Miecz', 'Topór']);
    expect(flattenTree(treeField.key, right, {}, {}).map(r => r.label))
      .toEqual(['Wiedza', 'Imperium']);
  });
});
```

- [ ] **Step 2: Uruchom testy — mają paść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillLayout`
Expected: FAIL — `TypeError: (0 , _skillLayout.treeGridTemplate) is not a function` (i analogicznie dla `flattenTree`).

- [ ] **Step 3: Dopisz `treeGridTemplate`**

W `skillLayout.js`, bezpośrednio pod `skillGridTemplate`:

```js
// treeGridTemplate is skillGridTemplate's counterpart for a skill_tree. It is a separate function
// rather than a flag on that one: a tree has no advances columns and never will — there is nothing
// to advance without an advances column — and a shared function would have to express that absence
// by switching it off instead of simply not having it.
//
// There is no track for the expand/collapse toggle. The toggle lives INSIDE the name cell, behind
// the depth guides, because its position depends on the row's depth and a grid track is by
// definition the same for every row.
//
// The action track is wider than the table's 52px because a tree row fits three buttons there
// (add-child, rename, delete) rather than two.
export function treeGridTemplate({
  showDevelopment = false,
  showStar = false,
  showRoll = false,
  showActions = false,
} = {}) {
  return [
    showDevelopment && '20px',
    '1fr',
    '72px',
    showStar && '24px',
    showRoll && '28px',
    showActions && '64px',
  ].filter(Boolean).join(' ');
}
```

- [ ] **Step 4: Dopisz `flattenTree`**

Na końcu `skillLayout.js`:

```js
// flattenTree turns the tree into the single list of rows the DOM actually shows, in order, with
// depth as a number. It exists because the rendering used to BE the recursion: every node wrapped
// its own descendants in a div, which meant no flat list of siblings existed — so :nth-child had
// nothing to count, a header bar had nowhere to sit, and the rule for which rows are visible lived
// in JSX where jsdom (which computes no layout) could never test it.
//
// `items` is one already-cut level of siblings, not the whole field: two-column mode splits the
// ROOT branches by weight and flattens each half separately. Flattening first and cutting the flat
// list in half would slice a branch down the middle and leave the second column's indents hanging
// under no parent.
//
// Every level is sorted here, including the one handed in — sorting an already-sorted level is a
// no-op, and doing it in one place stops the caller and this function from disagreeing about it.
export function flattenTree(rootPath, items, customSkillNodes = {}, {
  expanded = {},
  sort = false,
  addingUnderPath = null,
} = {}) {
  const out = [];

  const walk = (parentPath, levelItems, depth) => {
    for (const item of sortItems(levelItems, sort)) {
      const isCustom = !item.node;
      const path = isCustom ? item.customKey : `${parentPath}.${item.node.key}`;
      const node = isCustom ? (customSkillNodes[path] || {}) : item.node;
      const childItems = siblingItems(path, isCustom ? [] : (item.node.children || []), customSkillNodes);
      const hasChildren = childItems.length > 0;
      // The state holds only the exceptions, so a branch nobody has touched is open.
      const isOpen = expanded[path] !== false;

      out.push({
        kind: 'node',
        key: path,
        label: node.label || '',
        attr: node.linkedAttr || '',
        depth,
        custom: isCustom,
        hasChildren,
        isOpen,
      });

      // Adding under a collapsed branch reveals it for as long as the form is open — otherwise the
      // player would be typing into a form they cannot see.
      const adding = addingUnderPath === path;
      if ((hasChildren || adding) && (isOpen || adding)) {
        walk(path, childItems, depth + 1);
        if (adding) {
          out.push({ kind: 'addForm', key: `${path}::add`, parentPath: path, depth: depth + 1 });
        }
      }
    }
  };

  walk(rootPath, items, 0);
  return out;
}
```

- [ ] **Step 5: Uruchom testy**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillLayout`
Expected: PASS, wszystkie testy pliku.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/skillLayout.js warhammer-battle-helper-front/src/systems/custom/skillLayout.test.js
git commit -m "feat: FEATURE-220 flatten the skill tree into a list of rows

The rendering used to be the recursion, so no flat list of siblings
existed: nothing for a header to sit above, and the visibility rule
lived in JSX where jsdom can never reach it. It is data now, and tested.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Nagłówek przestaje należeć do tabeli

Mechaniczne przemianowanie komponentu i jego klasy CSS, plus poprawka komentarza, który po FEATURE-219 mówi rzecz prawdziwą **tylko** o tabeli. Zero zmian wizualnych.

**Files:**
- Rename: `warhammer-battle-helper-front/src/systems/custom/fields/SkillTableHeader.jsx` → `SkillFieldHeader.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/fields/SkillTable.jsx` (import + użycie)
- Modify: `warhammer-battle-helper-front/src/style.css` (`custom-sheet__skill-table-header` → `custom-sheet__skill-field-header`)
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTable.test.jsx`
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.domShape.test.jsx` (+ snapshot)

**Interfaces:**
- Consumes: nic z Taska 1.
- Produces: `SkillFieldHeader` i klasa `custom-sheet__skill-field-header` — używane przez drzewo w Tasku 3.

- [ ] **Step 1: Zaktualizuj asercje w testach (najpierw czerwone)**

W `CustomSheetBody.skillTable.test.jsx` podmień **każde** wystąpienie `custom-sheet__skill-table-header` na `custom-sheet__skill-field-header`. Sprawdź, ile ich jest:

Run: `cd warhammer-battle-helper-front/src && grep -c "skill-table-header" systems/custom/CustomSheetBody.skillTable.test.jsx`
Expected: liczba > 0; podmień tyle samo.

- [ ] **Step 2: Uruchom testy — mają paść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.skillTable`
Expected: FAIL — asercje szukające nagłówka dostają `null`.

- [ ] **Step 3: Przemianuj plik komponentu**

```bash
cd warhammer-battle-helper-front/src/systems/custom/fields
git mv SkillTableHeader.jsx SkillFieldHeader.jsx
```

- [ ] **Step 4: Przepisz komponent**

Cała zawartość `SkillFieldHeader.jsx` — zmienia się nazwa funkcji, eksport, klasa i komentarz:

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

// The header bar of one skill field's column — shared by skill_table and skill_tree, which is why
// it is named for neither.
//
// It renders unconditionally. In a TABLE that is load-bearing and not merely tidy: the zebra
// striping in style.css counts sibling parity, and the header is the first child of the table (or
// of each column), so a header that came and went with a field flag would flip which rows are
// tinted. A TREE has no zebra — its rows are banded by depth — so there the header is only the
// list's top edge.
//
// `gridTemplate` is handed in rather than computed here: the header and every row of the same
// field must be given the SAME string, and the moment the two compute it separately they drift.
// That is also what lets one component serve two fields whose column sets differ.
function SkillFieldHeader({
  gridTemplate,
  showDevelopment = false,
  hasAdvances = false,
  advancesLabel,
  showTooltip,
  hideTooltip,
}) {
  const { t } = useTranslation();

  return (
    <div className="custom-sheet__skill-field-header" style={{ gridTemplateColumns: gridTemplate }}>
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

export default SkillFieldHeader;
```

Ikona `TrendingUpIcon` zostaje na `fontSize: 12` — to etykieta kolumny stojąca obok 10-pikselowego tekstu, nie kontrolka, więc **nie** bierze `AFFORDANCE_ICON_SIZE`.

- [ ] **Step 5: Podmień import w tabeli**

W `fields/SkillTable.jsx`:

```jsx
import SkillFieldHeader from './SkillFieldHeader';
```

i w ciele komponentu `<SkillTableHeader … />` → `<SkillFieldHeader … />` (propsy bez zmian).

- [ ] **Step 6: Przemianuj klasę w CSS**

W `style.css` zamień selektor `.custom-sheet__skill-table-header` na `.custom-sheet__skill-field-header`. Zostaw komentarz nad regułą bez zmian, jeśli dotyczy wyglądu paska; jeśli mówi o tabeli, dopisz, że pasek służy też drzewu.

Run: `cd warhammer-battle-helper-front/src && grep -rn "skill-table-header" . | grep -v "\.snap"`
Expected: brak wyników.

- [ ] **Step 7: Uruchom testy i zaktualizuj snapshot**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody -u`
Expected: PASS; w podsumowaniu zaktualizowane snapshoty. Obejrzyj `git diff` na pliku snapshotu: jedyna zmiana to nazwa klasy nagłówka. Cokolwiek innego = błąd.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src
git commit -m "refactor: FEATURE-220 the skill header belongs to no one field

skill_tree is about to render the same bar, and the component's comment
claimed the unconditional render is about zebra parity — true of the
table, meaningless for a tree, which has no zebra.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `SkillTree` i `SkillTreeRow`

Największe zadanie: rekurencja i cały stan drzewa wychodzą z `CustomSheetBody`, a wiersz przechodzi z flexa na siatkę.

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/fields/SkillTreeRow.jsx`
- Create: `warhammer-battle-helper-front/src/systems/custom/fields/SkillTree.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx`
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTree.test.jsx`, `CustomSheetBody.domShape.test.jsx` (+ snapshot)

**Interfaces:**
- Consumes: `flattenTree`, `treeGridTemplate` (Task 1); `SkillFieldHeader` (Task 2); istniejące `siblingItems`, `sortItems`, `subtreeSize`, `splitBranchesWeighted`; `genId` z `utils/surrogateKeys`; `AFFORDANCE_ICON_SIZE` z `fields/affordances`.
- Produces: `<SkillTree>` — jedyne, co zostaje z `case 'skill_tree'` w `CustomSheetBody`.

**Dwie zmiany zachowania, obie zamierzone i obie do wychwycenia tylko okiem:**
1. Wiersz w trybie edycji nazwy **zachowuje** kolumnę wartości, gwiazdkę i kostkę. Dziś znikają i wiersz się zapada; w siatce ich tory i tak są zarezerwowane, więc chowanie zostawiłoby dziury.
2. Węzeł gracza traci `border-left: 2px dashed`. Lewa krawędź należy teraz do prowadnic głębokości. Rozróżnienie niesie kursywa w nazwie oraz ołówek i kosz.

- [ ] **Step 1: Utwórz `SkillTreeRow.jsx`**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { AFFORDANCE_ICON_SIZE } from './affordances';

// One row of a skill_tree, at one depth.
//
// The expand/collapse toggle lives INSIDE the name cell, behind the depth guides, rather than in a
// grid track of its own: its position depends on this row's depth, and a grid track is by
// definition the same for every row. With the toggle pinned to the card's edge a nested parent
// looked as though it expanded from the same place as a root one.
//
// A leaf still reserves the toggle's width (visibility: hidden). Without it two rows at the same
// depth — one with children, one without — would have their names 14px apart, and the indent is
// supposed to mean depth, not "do I happen to have children right now".
//
// The depth band is emitted only for a row that HAS children, which is why the class is chosen
// here and not by a two-class selector in the stylesheet: the rule belongs next to `hasChildren`,
// where a reader can see it. Depth 3 and deeper share depth 2's band — three levels is the real
// case (Melee > One-handed > Sword) and a fourth shade would be a distinction nobody reads.
function SkillTreeRow({
  row,
  field,
  gridTemplate,
  showDevelopment,
  showStar,
  showRoll,
  showActions,
  skills,
  attrByKey,
  developmentSkills,
  onToggleDevelopment,
  onChange,
  readOnly,
  editing,
  editingLabel,
  setEditingLabel,
  editingAttr,
  setEditingAttr,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
  onToggleExpand,
  onAddUnder,
  onRemove,
  renderStar,
  renderRoll,
  showTooltip,
  hideTooltip,
}) {
  const { t } = useTranslation();

  const attrInfo = row.attr ? attrByKey[row.attr] : null;
  const displayLabel = attrInfo ? `${row.label} (${attrInfo.abbr || attrInfo.label})` : row.label;
  const attrFields = Object.values(attrByKey);
  const band = row.hasChildren ? ` custom-sheet__skill-tree-row--d${Math.min(row.depth, 2)}` : '';

  return (
    <div className={`custom-sheet__skill-tree-row${band}`} style={{ gridTemplateColumns: gridTemplate }}>
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

      <span className="custom-sheet__skill-tree-namecell">
        {Array.from({ length: row.depth }, (_, i) => (
          <span key={i} className="custom-sheet__skill-tree-guide" aria-hidden="true" />
        ))}
        <button
          className="custom-sheet__skill-tree-toggle"
          style={{ visibility: row.hasChildren ? 'visible' : 'hidden' }}
          onClick={() => row.hasChildren && onToggleExpand(row.key)}
        >
          {row.isOpen ? '▾' : '▸'}
        </button>
        {editing ? (
          <>
            <input
              type="text"
              className="custom-sheet__skill-tree-edit-input"
              value={editingLabel}
              autoFocus
              onChange={e => setEditingLabel(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onConfirmEdit(row.key);
                if (e.key === 'Escape') onCancelEdit();
              }}
            />
            {field.assignAttrToSkill && (
              <select
                className="custom-sheet__skill-attr-select"
                value={editingAttr}
                onChange={e => setEditingAttr(e.target.value)}
              >
                <option value="">{t('customSheet.attrNone')}</option>
                {attrFields.map(f => <option key={f.key} value={f.key}>{f.abbr || f.label}</option>)}
              </select>
            )}
          </>
        ) : (
          <span className={`custom-sheet__skill-tree-node-label${row.custom ? ' custom-sheet__skill-tree-node-label--custom' : ''}`}>
            {displayLabel}
          </span>
        )}
      </span>

      <input
        type="number"
        className="custom-sheet__skill-val-input"
        value={skills[row.key]?.base ?? 0}
        onChange={onChange ? e => onChange.skill(row.key, e.target.value) : undefined}
        readOnly={readOnly}
        min={0}
      />

      {showStar && renderStar(row.key)}
      {showRoll && renderRoll(row)}

      {showActions && (
        <span className="custom-sheet__skill-tree-row-actions">
          {editing ? (
            <>
              <button
                className="custom-sheet__skill-tree-add-confirm"
                onClick={() => onConfirmEdit(row.key)}
                disabled={!editingLabel.trim()}
              >✓</button>
              <button className="custom-sheet__skill-tree-add-cancel" onClick={onCancelEdit}>✕</button>
            </>
          ) : (
            <>
              {onAddUnder && (
                <button
                  className="custom-sheet__skill-tree-add-inline"
                  onClick={() => onAddUnder(row.key)}
                  title={t('customSheet.addChildSkill')}
                >+</button>
              )}
              {row.custom && onStartEdit && (
                <button
                  className="custom-sheet__skill-tree-edit"
                  onClick={() => onStartEdit(row.key)}
                  title={t('customSheet.editSkill')}
                >
                  <EditIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
                </button>
              )}
              {row.custom && onRemove && (
                <button
                  className="custom-sheet__skill-tree-del"
                  onClick={() => onRemove(row.key)}
                  title={t('customSheet.removeSkill')}
                >
                  <DeleteIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
                </button>
              )}
            </>
          )}
        </span>
      )}
    </div>
  );
}

export default SkillTreeRow;
```

Kosz dostaje `DeleteIcon`, nie znak `×` jak dziś. Powód: po FEATURE-219 wszystkie afordancje karty to ikony MUI o jednym rozmiarze, a `×` jest glifem tekstowym i nie da się go z nimi zrównać.

- [ ] **Step 2: Utwórz `SkillTree.jsx`**

```jsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  siblingItems, sortItems, subtreeSize, splitBranchesWeighted,
  flattenTree, treeGridTemplate,
} from '../skillLayout';
import { genId } from '../../../utils/surrogateKeys';
import SkillFieldHeader from './SkillFieldHeader';
import SkillTreeRow from './SkillTreeRow';

// The skill_tree field: a header bar plus one row per visible node, optionally split into two
// columns of whole branches.
//
// `showStar` / `showRoll` / `showActions` arrive as booleans separate from renderStar / renderRoll:
// each reserves a grid track, and the rule for reserving one ("a live handler OR the creator's
// showAffordances") is the sheet's affordance policy. A tree that inferred the reservation from
// whether a render prop returned something would hand the creator a different row width than the
// game — the bug FEATURE-212 was about.
//
// `editingPath` is a prop rather than local state because skill_table edits through the same value:
// two independent states would let a table row and a tree node be edited at once.
function SkillTree({
  field,
  skills,
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

  // Only the exceptions are stored: a branch nobody has touched is open.
  const [expanded,        setExpanded]        = useState({});
  const [addingUnderPath, setAddingUnderPath] = useState(null);
  const [addingLabel,     setAddingLabel]     = useState('');
  const [addingAttr,      setAddingAttr]      = useState('');
  // A rename is buffered rather than written through on every keystroke, unlike the table's:
  // a tree rename is confirmed with ✓ or Enter and can be abandoned with ✕.
  const [editingLabel,    setEditingLabel]    = useState('');
  const [editingAttr,     setEditingAttr]     = useState('');

  const showDev    = !!field.showDevelopment;
  const attrFields = Object.values(attrByKey);

  const gridTemplate = treeGridTemplate({
    showDevelopment: showDev,
    showStar,
    showRoll,
    showActions,
  });

  // The tree root is a container, not a skill: the creator only edits tree.children, so the root
  // has no GM-given name and its key belongs in no skill path. Rendering it as a row would store a
  // value under the bare root key with no field.key prefix — an orphan the backend cannot resolve
  // to a roll (FEATURE-160).
  const rootItems = sortItems(
    siblingItems(field.key, field.tree?.children || [], customSkillNodes),
    !!field.sortAlphabetically,
  );

  // Branch order is never touched — only where the single cut falls. The weight counts every node
  // in a branch regardless of whether it is currently expanded: weighing only visible rows would
  // throw branches between columns under the player's fingers each time they collapsed something.
  // A stable layout beats a perfectly even one.
  const branchWeight = (item) => item.node
    ? subtreeSize(item.node, `${field.key}.${item.node.key}`, customSkillNodes)
    : subtreeSize({ key: item.customKey }, item.customKey, customSkillNodes);
  const columns = field.twoColumns ? splitBranchesWeighted(rootItems, branchWeight) : null;

  const flattenOpts = {
    expanded,
    sort: !!field.sortAlphabetically,
    addingUnderPath,
  };

  const toggleExpand = (key) => setExpanded(prev => ({ ...prev, [key]: prev[key] === false }));

  const openAddForm = (parentPath) => {
    setAddingUnderPath(parentPath);
    setAddingLabel('');
    setAddingAttr('');
  };

  const confirmAdd = (parentPath) => {
    const trimmed = addingLabel.trim();
    if (!trimmed) return;
    onAddCustomSkill(`${parentPath}.${genId('skill')}`, {
      label: trimmed,
      ...(addingAttr ? { linkedAttr: addingAttr } : {}),
    });
    setAddingLabel('');
    setAddingAttr('');
    setAddingUnderPath(null);
  };

  const cancelAdd = () => { setAddingLabel(''); setAddingAttr(''); setAddingUnderPath(null); };

  const startEdit = (key) => {
    const node = customSkillNodes[key] || {};
    setEditingPath(key);
    setEditingLabel(node.label || '');
    setEditingAttr(node.linkedAttr || '');
  };

  const confirmEdit = (key) => {
    const trimmed = editingLabel.trim();
    if (trimmed && onUpdateCustomSkill) {
      onUpdateCustomSkill(key, {
        ...customSkillNodes[key],
        label: trimmed,
        ...(editingAttr ? { linkedAttr: editingAttr } : { linkedAttr: undefined }),
      });
    }
    setEditingPath(null);
    setEditingLabel('');
    setEditingAttr('');
  };

  const cancelEdit = () => { setEditingPath(null); setEditingLabel(''); setEditingAttr(''); };

  const renderAddForm = (parentPath, depth) => (
    <div
      key={`${parentPath}::add`}
      className="custom-sheet__skill-tree-add-form"
      style={{ paddingLeft: depth * 16 + 8 }}
    >
      <input
        type="text"
        className="custom-sheet__skill-tree-add-input"
        value={addingLabel}
        autoFocus
        onChange={e => setAddingLabel(e.target.value)}
        placeholder={t('customSheet.skillNamePlaceholder')}
        onKeyDown={e => {
          if (e.key === 'Enter') confirmAdd(parentPath);
          if (e.key === 'Escape') cancelAdd();
        }}
      />
      {field.assignAttrToSkill && (
        <select
          className="custom-sheet__skill-attr-select"
          value={addingAttr}
          onChange={e => setAddingAttr(e.target.value)}
        >
          <option value="">{t('customSheet.attrNone')}</option>
          {attrFields.map(f => <option key={f.key} value={f.key}>{f.abbr || f.label}</option>)}
        </select>
      )}
      <button
        className="custom-sheet__skill-tree-add-confirm"
        onClick={() => confirmAdd(parentPath)}
        disabled={!addingLabel.trim()}
      >✓</button>
      <button className="custom-sheet__skill-tree-add-cancel" onClick={cancelAdd}>✕</button>
    </div>
  );

  const renderRow = (row) => row.kind === 'addForm'
    ? renderAddForm(row.parentPath, row.depth)
    : (
      <SkillTreeRow
        key={row.key}
        row={row}
        field={field}
        gridTemplate={gridTemplate}
        showDevelopment={showDev}
        showStar={showStar}
        showRoll={showRoll}
        showActions={showActions}
        skills={skills}
        attrByKey={attrByKey}
        developmentSkills={developmentSkills}
        onToggleDevelopment={onToggleDevelopment}
        onChange={onChange}
        readOnly={readOnly}
        editing={row.custom && editingPath === row.key}
        editingLabel={editingLabel}
        setEditingLabel={setEditingLabel}
        editingAttr={editingAttr}
        setEditingAttr={setEditingAttr}
        onStartEdit={onUpdateCustomSkill ? startEdit : null}
        onConfirmEdit={confirmEdit}
        onCancelEdit={cancelEdit}
        onToggleExpand={toggleExpand}
        onAddUnder={showActions && onAddCustomSkill ? (key) => {
          openAddForm(key);
          setExpanded(prev => ({ ...prev, [key]: true }));
        } : null}
        onRemove={onRemoveCustomSkill}
        renderStar={renderStar}
        renderRoll={renderRoll}
        showTooltip={showTooltip}
        hideTooltip={hideTooltip}
      />
    );

  const header = (
    <SkillFieldHeader
      gridTemplate={gridTemplate}
      showDevelopment={showDev}
      hasAdvances={false}
      showTooltip={showTooltip}
      hideTooltip={hideTooltip}
    />
  );

  return (
    <div className="custom-sheet__field custom-sheet__field--skill-tree">
      <div className="custom-sheet__section-title">{field.label}</div>
      <div className={`custom-sheet__skill-tree${columns ? ' custom-sheet__skill-tree--two-col' : ''}`}>
        {columns
          ? columns.map((colItems, i) => (
              <div key={i} className="custom-sheet__skill-col">
                {header}
                {flattenTree(field.key, colItems, customSkillNodes, flattenOpts).map(renderRow)}
              </div>
            ))
          : (
            <>
              {header}
              {flattenTree(field.key, rootItems, customSkillNodes, flattenOpts).map(renderRow)}
            </>
          )}
      </div>
      {/* The add button and its form belong to the field, not to a column: the --two-col modifier
          turns the tree container into a flex row, so a child there would render as a third column
          beside the two branch columns instead of underneath both. The wrapping field div is a
          flex column, so this sibling lands under both for free. */}
      {showActions && onAddCustomSkill && (
        addingUnderPath === field.key
          ? renderAddForm(field.key, 0)
          : <button
              className="custom-sheet__skill-tree-add-btn"
              style={{ paddingLeft: 8 }}
              onClick={() => openAddForm(field.key)}
            >+ {t('customSheet.addSkill')}</button>
      )}
    </div>
  );
}

export default SkillTree;
```

- [ ] **Step 3: Zamień `case 'skill_tree'` w `CustomSheetBody.jsx`**

Dodaj import obok pozostałych z `./fields/`:

```jsx
import SkillTree from './fields/SkillTree';
```

Cały `case 'skill_tree': { … }` zastąp tym:

```jsx
      case 'skill_tree': {
        // Reserve a track only when something can actually render into it. These three flags are
        // the sheet's affordance policy, which is why SkillTree takes them as booleans instead of
        // inferring them from the render props below.
        const showRoll    = !!field.rollable && (!!onRoll || showAffordances);
        const showStar    = !field.hideFavorites && (!!onToggleFavorite || showAffordances);
        const showActions = !!field.playerCanAddSkills && (!!onAddCustomSkill || showAffordances);

        return (
          <SkillTree
            key={field.key}
            field={field}
            skills={skills}
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

- [ ] **Step 4: Usuń z `CustomSheetBody.jsx` wszystko, co obsługiwało drzewo**

Skasuj (wraz z komentarzami): `renderAddForm`, `renderSiblings`, `renderCustomNode`, `renderTreeNode`, `confirmAdd`, `cancelAdd`, `startEdit`, `confirmEdit`, `cancelEdit` oraz stany `expanded`, `addingUnderPath`, `addingLabel`, `addingAttr`, `editingLabel`, `editingAttr`.

**Zostają:** `editingPath` i `setEditingPath` — czyta je tabela.

- [ ] **Step 5: Sprawdź, że nic osieroconego nie zostało**

Run: `cd warhammer-battle-helper-front/src && grep -n "expanded\|addingUnderPath\|addingLabel\|addingAttr\|editingLabel\|editingAttr\|siblingItems\|sortItems\|subtreeSize\|splitBranchesWeighted\|genId\|EditIcon" systems/custom/CustomSheetBody.jsx`
Expected: brak wyników. Każda z tych nazw po Tasku 3 należy już wyłącznie do `SkillTree`/`SkillTreeRow`. Usuń też puste pozycje w importach z `./skillLayout`, `../../utils/surrogateKeys` i `@mui/icons-material` — CRA zgłasza nieużywane jako ostrzeżenia, a ostrzeżenie w wyjściu testów jest usterką.

- [ ] **Step 6: Uruchom testy i zaktualizuj snapshoty**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='CustomSheetBody|skillLayout' -u`
Expected: PASS. Snapshoty `domShape` **zmienią się istotnie** — inaczej niż w FEATURE-219 drzewo naprawdę zmienia kształt DOM, więc nieruszony snapshot nie jest tu dowodem niczego.

Jeśli padnie `CustomSheetBody.skillTree.test.jsx`, **nie** poprawiaj testu bez zrozumienia: on sprawdza zachowanie widoczne z zewnątrz (rozwijanie, dodawanie, kasowanie), które ma zostać identyczne. Padnięcie znaczy, że spłaszczenie coś zmieniło.

- [ ] **Step 7: Obejrzyj różnicę w snapshocie**

Run: `git diff warhammer-battle-helper-front/src/systems/custom/__snapshots__/`
Expected: w gałęzi drzewa znika `custom-sheet__skill-tree-group` i `custom-sheet__skill-tree-node-row`, pojawia się `custom-sheet__skill-field-header` i `custom-sheet__skill-tree-row` z `grid-template-columns`. Gałąź tabeli i pola niezwiązane z drzewem **nie mogą** się zmienić.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src
git commit -m "refactor: FEATURE-220 move the skill tree into its own components

The recursion rendered each node wrapping its own descendants, so the
value column walked right with every level and no flat list existed for
a header to sit above. Rows come from flattenTree now; the toggle moved
into the name cell so it travels with the indent.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Skórka CSS

**Files:**
- Modify: `warhammer-battle-helper-front/src/style.css` (sekcja „Skill tree")

**Interfaces:**
- Consumes: klasy wypisywane przez `SkillTree` i `SkillTreeRow` (Task 3).
- Produces: końcowy wygląd; żaden kod JS tego nie czyta.

- [ ] **Step 1: Kontener bez odstępów**

Zastąp regułę `.custom-sheet__skill-tree`:

```css
.custom-sheet__skill-tree {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0;
}
```

Reguła `.custom-sheet__skill-tree--two-col` (z komentarzem o podwojonym selektorze) zostaje bez zmian.

- [ ] **Step 2: Wiersz, pasma, hover**

Usuń `.custom-sheet__skill-tree-node-row`, `.custom-sheet__skill-tree-node-row:hover` oraz `.custom-sheet__skill-tree-node-row--custom` (kreskowana krecha — jej miejsce zajmują prowadnice). W to miejsce:

```css
/* One grid per tree row, its columns handed in from JS (treeGridTemplate) so a field's header and
   its rows can never disagree about where a column starts. There is no track for the toggle: it
   sits inside the name cell, behind the depth guides, because its position depends on the row's
   depth. */
.custom-sheet__skill-tree-row {
    display: grid;
    align-items: center;
    gap: 8px;
    padding: 2px 4px;
    min-height: 26px;
    border-bottom: 1px solid rgba(201, 151, 91, 0.28);
    transition: background 0.12s;
}

/* Depth bands. Emitted only for a row that has children, so the tint answers "does this expand",
   which nothing else on the row answers — depth itself is already told by the indent and the
   guides. Level 3 and deeper reuse level 2's shade; three levels is the real case and a fourth
   shade would be a distinction nobody reads. */
.custom-sheet__skill-tree-row--d0 { background: rgba(201, 151, 91, 0.22); }
.custom-sheet__skill-tree-row--d1 { background: rgba(201, 151, 91, 0.13); }
.custom-sheet__skill-tree-row--d2 { background: rgba(201, 151, 91, 0.06); }

/* Brown, not the table's gold. The table hovers at rgba(201,151,91,0.14), which here sits exactly
   between the depth-0 and depth-1 bands — hovering a leaf would read as a change of level. Two
   different signals must not speak in the same colour. Declared after the bands so it wins at
   equal specificity. */
.custom-sheet__skill-tree-row:hover {
    background: rgba(122, 92, 66, 0.18);
}
```

- [ ] **Step 3: Komórka nazwy, prowadnice, trójkącik**

```css
/* The name cell carries the whole tree structure: one guide per ancestor level, then the toggle,
   then the label. Everything right of it stays in its grid track at any depth — which is the
   entire point of the change. */
.custom-sheet__skill-tree-namecell {
    display: flex;
    align-items: center;
    align-self: stretch;
    min-width: 0;
}

.custom-sheet__skill-tree-guide {
    display: inline-block;
    width: 16px;
    align-self: stretch;
    flex-shrink: 0;
    border-left: 1px solid rgba(122, 92, 66, 0.28);
}
```

Reguła `.custom-sheet__skill-tree-toggle` zostaje — dopisz jej tylko `flex-shrink: 0`, jeśli go nie ma.

- [ ] **Step 4: Nazwa i wartość**

```css
.custom-sheet__skill-tree-node-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.88rem;
    color: #3a2f1f;
    padding-left: 2px;
}

.custom-sheet__skill-tree-node-label--custom {
    font-style: italic;
    color: #5a4a35;
}

/* Anchored under the tree's row class for the same reason the table anchors its own: both fields
   render .custom-sheet__skill-val-input, and since FEATURE-219 this anchoring is the only thing
   keeping their looks apart. */
.custom-sheet__skill-tree-row .custom-sheet__skill-val-input {
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
    -moz-appearance: textfield;
}

.custom-sheet__skill-tree-row .custom-sheet__skill-val-input::-webkit-outer-spin-button,
.custom-sheet__skill-tree-row .custom-sheet__skill-val-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

/* A borderless cell has no focus affordance of its own, so the ring is the whole signal — the same
   decision the table's cells carry. */
.custom-sheet__skill-tree-row .custom-sheet__skill-val-input:focus {
    outline: 2px solid #7a5c42;
    outline-offset: -2px;
    background: rgba(255, 255, 255, 0.55);
}
```

- [ ] **Step 5: Tor akcji**

```css
.custom-sheet__skill-tree-row-actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
}
```

Istniejące `.custom-sheet__skill-tree-add-inline`, `-add-confirm` i `-add-cancel` zostają bez zmian.

`.custom-sheet__skill-tree-del` (ok. linii 8818) ma dziś `font-size: 1rem; line-height: 1;` — zapis pod glif tekstowy `×`. Kosz jest teraz ikoną MUI o rozmiarze z `AFFORDANCE_ICON_SIZE`, więc obie deklaracje wylatują, a w ich miejsce wchodzi to, co ma już `-edit` tuż obok:

```css
.custom-sheet__skill-tree-del {
    background: none;
    border: none;
    color: #b57a5a;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    padding: 0 3px;
    border-radius: 3px;
    transition: color 0.12s, background 0.12s;
    flex-shrink: 0;
}
```

`:hover` tej klasy zostaje bez zmian.

- [ ] **Step 6: Uruchom testy**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='CustomSheetBody|skillLayout'`
Expected: PASS, bez aktualizacji snapshotów. **jsdom nie wczytuje `style.css`**, więc ten przebieg potwierdza wyłącznie, że nie ruszyłeś JS — nie mówi nic o wyglądzie.

- [ ] **Step 7: Audyt kolejności**

Przejrzyj swój diff jako arkusz, nie jako łatkę. Dla każdej pary reguł o równej specyficzności, gdzie jedna uszczegóławia drugą, potwierdź, że uszczegółowienie stoi **później** w pliku. Wypisz pary i numery linii w raporcie. Co najmniej te: pasma vs `:hover`; `.custom-sheet__skill-tree-row .custom-sheet__skill-val-input` vs jej `:focus`.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/style.css
git commit -m "feat: FEATURE-220 skin the skill tree

Depth bands on the rows that actually expand, guides down the name cell,
and the value column borderless like the table's. Hover is brown, not
the table's gold: gold lands exactly between the first two bands, so
hovering a leaf would have read as a change of level.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Weryfikacja w przeglądarce

jsdom nie wczytuje `style.css` i nie liczy layoutu, więc **żaden test nie sprawdził wyglądu**. W FEATURE-219 ten krok wyłapał rozjechane rozmiary ikon, czego nie dało się ani przetestować, ani wyczytać z arkusza — każdy rozmiar z osobna wyglądał sensownie.

**Files:** żadnych zmian w kodzie, chyba że coś wyjdzie.

- [ ] **Step 1: Uruchom stack**

Run: `docker compose up -d` z katalogu głównego repo, potem otwórz `http://localhost:3000`.

- [ ] **Step 2: Przejdź listę kontrolną**

Na karcie z polem `skill_tree`:

1. drzewo trzypoziomowe — trzy odcienie pasm; czwarty poziom w odcieniu trzeciego;
2. liść na tym samym poziomie co kategoria — nazwy wyrównane, liść bez pasma;
3. zwijanie i rozwijanie na każdym poziomie;
4. dodanie węzła pod **zwiniętą** gałęzią — gałąź ma się odsłonić, a formularz być widoczny;
5. hover na liściu i na kategorii — nie może wyglądać jak zmiana poziomu;
6. dwie kolumny (`twoColumns`) — gałąź nierozcięta, każda kolumna z własnym nagłówkiem;
7. sortowanie alfabetyczne — rodzeństwo przeplecione, wcięcia nienaruszone;
8. długa nazwa na trzecim poziomie — wielokropek, kolumna wartości stoi;
9. tor akcji 64px — `+`, ołówek i kosz mieszczą się bez zawijania (to było wyliczenie, nie pomiar);
10. zmiana nazwy węzła gracza: ołówek, Enter, ✕, oraz że wartość i kostka nie znikają w trybie edycji;
11. Tab po kolumnie wartości — widać, gdzie jest fokus.

- [ ] **Step 3: Kreator**

Otwórz `TemplateBuilder` na tym samym polu. Drzewo musi wyglądać identycznie jak w grze — ta sama szerokość wierszy, gwiazdka i kostka obecne jako nieaktywne. Różnica w szerokości = któraś z flag `showStar`/`showRoll`/`showActions` nie uwzględnia `showAffordances` (FEATURE-212).

- [ ] **Step 4: Zrzuty**

Minimum dwa: drzewo trzypoziomowe i to samo w dwóch kolumnach. Po akceptacji użytkownika zadanie zamknięte.

---

## Podsumowanie pokrycia spec-a

| Wymaganie ze spec-a | Zadanie |
|---|---|
| `flattenTree` jako czysta funkcja, z zachowaniami 1:1 | 1 |
| `treeGridTemplate`, bez toru na trójkącik, akcje 64px | 1 |
| Dwie kolumny: najpierw podział gałęzi, potem spłaszczenie | 1 (test), 3 (użycie) |
| Nagłówek wspólny, przemianowany | 2 |
| Trójkącik w komórce nazwy, liść rezerwuje jego miejsce | 3 |
| Prowadnice głębokości | 3 (JSX), 4 (CSS) |
| Pasma tylko dla węzła z dziećmi, zacisk na poziomie 3 | 3 (klasa), 4 (odcienie) |
| Hover brązowy, nie złoty | 4 |
| Węzeł gracza traci kreskowaną krechę, zostaje kursywa | 3, 4 |
| Reguły wartości zakotwiczone w klasie wiersza drzewa | 4 |
| Stan: `expanded` i dodawanie do `SkillTree`, `editingPath` propsem | 3 |
| Flagi afordancji liczone przez rodzica | 3 |
| Brak nowych kluczy i18n | 2, 3 (używają istniejących) |
| Weryfikacja ręczna | 5 |

Odstępstwa od spec-a, świadome i opisane w Tasku 3:

1. Wiersz w trybie edycji **zachowuje** wartość, gwiazdkę i kostkę. W siatce ich tory i tak są zarezerwowane, więc chowanie zostawiłoby dziury.
2. Kosz dostaje `DeleteIcon` zamiast glifu `×`. Po FEATURE-219 wszystkie afordancje karty to ikony MUI o jednym rozmiarze, a glifu tekstowego nie da się z nimi zrównać.
3. **Ołówek i kosz chowają się razem z `+`**, bo wszystkie trzy siedzą teraz w jednym torze bramkowanym przez `showActions` (czyli `playerCanAddSkills`). Dziś w drzewie pokazują się niezależnie — MG może wyłączyć dodawanie, a gracz nadal zmieni nazwę istniejącego własnego węzła. To nie jest przeoczenie: **tabela zachowuje się dokładnie tak od FEATURE-219** (`SkillTableRow`: `showActions && (… row.custom && onUpdateCustomSkill …)`), więc drzewo przestaje być wyjątkiem. Skutek do odnotowania: wyłączenie flagi zamraża istniejące węzły gracza zamiast je kasować — dane zostają i wracają po ponownym włączeniu.
