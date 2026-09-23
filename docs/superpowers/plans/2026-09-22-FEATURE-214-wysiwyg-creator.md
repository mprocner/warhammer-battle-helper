# FEATURE-214 — Kreator WYSIWYG — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Widok edycji kreatora staje się wyrenderowaną kartą postaci — jeden renderer, narzędzia edycji jako warstwa chrome na wierzchu.

**Architecture:** `CustomSheetBody` dostaje opcjonalny prop `renderChrome`; bez niego renderuje dokładnie jak dziś (zero zmian w sesji gracza), z nim opakowuje każdy węzeł w pozycjonowany wrapper i wstrzykuje w niego chrome dostarczone przez kreator. DnD porzuca `SortableContext` na rzecz jednego droppable'a i czystych funkcji liczących miejsce wstawienia z prostokątów zmierzonych raz, na starcie przeciągania.

**Tech Stack:** React 18, `@dnd-kit/core` (bez `@dnd-kit/sortable`), MUI, i18next, CRA + Jest + Testing Library.

**Spec:** `docs/superpowers/specs/FEATURE-214.md`

## Global Constraints

- Komentarze w kodzie **zawsze po angielsku**. Dokumentacja i ta rozmowa po polsku.
- Żadnych stringów wprost w JSX — wyłącznie `t('klucz')`, klucze angielskie, tłumaczenia równolegle w `src/locales/en/translation.json` i `src/locales/pl/translation.json`.
- Ikony wyłącznie z `@mui/icons-material`.
- Tooltipy: nigdy MUI `<Tooltip>` — portal przez `createPortal` do `document.body`, klasy `.portal-tooltip` / `.portal-tooltip__arrow`.
- CSS w `src/style.css`, konwencja BEM.
- Martwy kod, CSS i klucze i18n usuwamy w tej samej zmianie, w której przestają być używane.
- Backend bez zmian.
- Uruchamianie testów zawsze z katalogu `warhammer-battle-helper-front/`:
  `CI=true npm test -- --watchAll=false --testPathPattern=<wzorzec>`
  Gołe `npx jest` nie działa — konfiguracją zarządza CRA.
- Znany baseline fail: `App.test.js` (axios ESM). To **nie** jest regresja.
- Kolory karty (jasne tło): tekst `#3a2f1f`, ramki `#c4a882`, akcent `#c9975b`, ciemny brąz `#7a5c42`.
- `moveNode` używa **indeksu po usunięciu** (post-removal) — patrz komentarz w `utils/templateSections.js:160`.

---

## Struktura plików

| Plik | Odpowiedzialność | Los |
|---|---|---|
| `src/systems/custom/CustomSheetBody.jsx` | wygląd karty + szew `renderChrome` + ścieżki | modyfikacja |
| `src/systems/custom/CustomSheetBody.domShape.test.jsx` | snapshot charakteryzacyjny DOM bez chrome | nowy |
| `src/systems/custom/CustomSheetBody.chromeSeam.test.jsx` | kontrakt szwu | nowy |
| `src/utils/sheetDnd.js` | `measureNodes`, `insertionAt`, `toMoveArgs`, `ghostRectFor` | nowy |
| `src/utils/sheetDnd.test.js` | testy jednostkowe powyższych | nowy |
| `src/components/creator/FieldChrome.jsx` | chrome pola | nowy |
| `src/components/creator/SectionChrome.jsx` | chrome sekcji | nowy |
| `src/components/creator/EditablePlaceholder.jsx` | placeholdery pustych węzłów | nowy |
| `src/components/creator/PropertyPopup.jsx` | `DraggablePopup` + `PropertyPanel`/`SectionPropertyPanel` | nowy |
| `src/components/creator/TemplateBuilder.jsx` | stan, zaznaczenie, DnD, autosave | duża modyfikacja |
| `src/components/creator/TemplatePreview.jsx` + test | — | **usuwany** |
| `src/utils/templateSections.js` | operacje na drzewie | usunięcie sentineli |
| `src/style.css` | style chrome; usunięcie `.creator__canvas-*`, `.creator__prev-*` | modyfikacja |
| `src/locales/{en,pl}/translation.json` | klucze | modyfikacja |

**Czego plan NIE zmienia:** `PropertyPanel` i `SectionPropertyPanel` (treść), `moveNode` / `canDropInto` (istnieją, 84 testy w `utils/templateSections.test.js`), backend, zakładka „Ogólne".

---

## Task 1: Snapshot charakteryzacyjny DOM karty

Sieć bezpieczeństwa **przed** dotknięciem `CustomSheetBody`. Musi powstać na niezmienionym kodzie — snapshot zdjęty po refaktorze utrwaliłby także błędne wyjście.

**Files:**
- Create: `src/systems/custom/CustomSheetBody.domShape.test.jsx`

**Interfaces:**
- Consumes: nic.
- Produces: plik snapshotu `src/systems/custom/__snapshots__/CustomSheetBody.domShape.test.jsx.snap`, który Task 2 musi utrzymać zielony bez aktualizacji.

- [ ] **Step 1: Napisz test snapshotowy**

`src/systems/custom/CustomSheetBody.domShape.test.jsx`:

```jsx
import React from 'react';
import { render } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

// Characterization test for FEATURE-214. The creator gains an optional `renderChrome` seam;
// without it the markup must stay byte-for-byte what the session renders today, because this
// component draws every custom character sheet in every game. Text-and-role queries cannot
// catch a stray wrapper: the grid children of `.custom-sheet__fields--N-col` ARE the fields,
// so one extra div silently turns the wrapper into the grid cell and the column maths stops
// applying to what the player sees. Only the DOM shape itself shows that.
//
// This snapshot is taken BEFORE the seam is added. Never refresh it while adding the seam —
// a snapshot refreshed alongside the change it is meant to police proves nothing.
const sections = [
  { id: 'sec_root', title: 'Cechy', columns: 3, fields: [
    { key: 'attr_ws', type: 'attr', label: 'Walka wręcz', abbr: 'WW', min: 1, max: 100, rollable: true },
    { key: 'num_gold', type: 'number', label: 'Złoto', step: 1 },
    { key: 'lbl_note', type: 'label', text: 'Notatka' },
    { key: 'txt_bio', type: 'text_long', label: 'Historia' },
    { key: 'chk_dead', type: 'checkbox', label: 'Martwy' },
    { key: 'sel_race', type: 'select', label: 'Rasa', options: ['Człowiek', 'Elf'] },
    { key: 'prg_hp', type: 'progress', label: 'Rany', max: 20 },
  ] },
  { id: 'sec_gear', title: 'Ekwipunek', columns: 2, fields: [
    { key: 'sec_weapons', type: 'section', label: '', section: {
      id: 'sec_weapons', title: 'Broń', columns: 1, fields: [
        { key: 'wpn_table', type: 'weapons_table', label: 'Bronie', columns: [], rows: [] },
      ],
    } },
    { key: 'tree_skills', type: 'skill_tree', label: 'Umiejętności',
      tree: { id: 'root', children: [{ id: 'n1', label: 'Skradanie', children: [] }] } },
  ] },
];

describe('CustomSheetBody DOM shape (no chrome)', () => {
  test('markup of a representative template is unchanged', () => {
    const { container } = render(<CustomSheetBody sections={sections} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  test('every field is a DIRECT child of its section grid', () => {
    const { container } = render(<CustomSheetBody sections={sections} />);
    const grid = container.querySelector('.custom-sheet__fields--3-col');
    expect(grid).toBeInTheDocument();
    // Direct-child selector on purpose: this is the assertion a wrapper breaks.
    expect(grid.querySelectorAll(':scope > .custom-sheet__field').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Uruchom test — musi przejść i zapisać snapshot**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.domShape`

Oczekiwane: PASS. Uwaga: pod `CI=true` Jest **nie zapisuje** nowych snapshotów. Pierwsze uruchomienie zrób bez `CI`:
`npx cross-env CI= npm test -- --watchAll=false --testPathPattern=CustomSheetBody.domShape --ci=false`
albo prościej: `CI= npm test -- --watchAll=false --testPathPattern=CustomSheetBody.domShape` i wyjdź klawiszem `q`.

Potwierdź, że powstał plik `src/systems/custom/__snapshots__/CustomSheetBody.domShape.test.jsx.snap`.

- [ ] **Step 3: Uruchom ponownie pod CI, żeby potwierdzić stabilność**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.domShape`
Oczekiwane: PASS, `2 passed`.

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.domShape.test.jsx \
        warhammer-battle-helper-front/src/systems/custom/__snapshots__/CustomSheetBody.domShape.test.jsx.snap
git commit -m "test: FEATURE-214 characterization snapshot of the custom sheet DOM

Taken before the renderChrome seam so the refactor has something to violate.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Szew `renderChrome` i ścieżki w `CustomSheetBody`

**Files:**
- Modify: `src/systems/custom/CustomSheetBody.jsx:159` (sygnatura), `:459` (`renderField`), `:948` (`renderSection`), `:965` (render korzeni)
- Create: `src/systems/custom/CustomSheetBody.chromeSeam.test.jsx`
- Modify: `src/style.css` (nowa klasa `.custom-sheet__editable`)

**Interfaces:**
- Consumes: snapshot z Taska 1.
- Produces:
  - `CustomSheetBody({ ..., renderChrome = null })`
  - `renderChrome(node, path)` → `ReactNode | null`; `node` to `SectionDef` (korzeń) albo `FieldDef`; `path` to `number[]` w konwencji `utils/templateSections.js`.
  - klasa DOM `custom-sheet__editable` na wrapperze każdego węzła w trybie chrome.

- [ ] **Step 1: Napisz test kontraktu szwu (musi paść)**

`src/systems/custom/CustomSheetBody.chromeSeam.test.jsx`:

```jsx
import React from 'react';
import { render } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

const sections = [
  { id: 'sec_root', title: 'Cechy', columns: 2, fields: [
    { key: 'attr_ws', type: 'attr', label: 'WW' },
    { key: 'sec_in', type: 'section', label: '', section: {
      id: 'sec_in', title: 'Wewnątrz', columns: 1, fields: [
        { key: 'num_gold', type: 'number', label: 'Złoto' },
      ],
    } },
  ] },
];

describe('CustomSheetBody renderChrome seam', () => {
  test('without the prop it adds nothing — no wrapper element appears', () => {
    const { container } = render(<CustomSheetBody sections={sections} />);
    expect(container.querySelector('.custom-sheet__editable')).toBeNull();
  });

  test('with the prop every node gets one wrapper and one chrome call', () => {
    const seen = [];
    const { container } = render(
      <CustomSheetBody
        sections={sections}
        renderChrome={(node, path) => {
          seen.push({ id: node.key ?? node.id, path: path.join('.') });
          return <b data-testid="chrome" data-path={path.join('.')} />;
        }}
      />
    );
    // Root section, its two children, and the nested section's single child.
    expect(seen).toEqual([
      { id: 'sec_root', path: '0' },
      { id: 'attr_ws',  path: '0.0' },
      { id: 'sec_in',   path: '0.1' },
      { id: 'num_gold', path: '0.1.0' },
    ]);
    expect(container.querySelectorAll('.custom-sheet__editable')).toHaveLength(4);
    expect(container.querySelectorAll('[data-testid="chrome"]')).toHaveLength(4);
  });

  test('a nested section is wrapped once, not twice', () => {
    const { container } = render(
      <CustomSheetBody sections={sections} renderChrome={() => <b />} />
    );
    const nested = container.querySelector('.custom-sheet__section--nested');
    // Its own wrapper is the parent; a second wrapper would sit between them.
    expect(nested.parentElement).toHaveClass('custom-sheet__editable');
    expect(nested.querySelector(':scope > .custom-sheet__editable')).toBeNull();
  });

  test('chrome returning null leaves a wrapper but no extra content', () => {
    const { container } = render(
      <CustomSheetBody sections={sections} renderChrome={() => null} />
    );
    expect(container.querySelectorAll('.custom-sheet__editable')).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Uruchom — musi paść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.chromeSeam`
Oczekiwane: FAIL — `seen` puste, brak `.custom-sheet__editable`.

- [ ] **Step 3: Dodaj prop i helper `withChrome`**

W `src/systems/custom/CustomSheetBody.jsx`, w sygnaturze (linia ~159) dopisz ostatni prop:

```jsx
  onToggleFavorite = null,
  renderChrome = null,
}) {
```

Zaraz za `const readOnly = !onChange;` dodaj:

```jsx
  // The creator's edit view is this very component plus a decoration layer. `renderChrome` is
  // the only seam it needs: given a node and its path, the creator returns the affordances
  // (drag handle, edit button, duplicate-key badge) and this component positions them by
  // wrapping the node. With no prop the markup is exactly what the session has always
  // rendered — that byte-for-byte guarantee is what keeps a creator-only feature from
  // reaching every player's sheet. CustomSheetBody.domShape.test.jsx polices it.
  const withChrome = (node, path, element) => {
    if (!renderChrome || !element) return element;
    return (
      <div className="custom-sheet__editable" key={node.key ?? node.id}>
        {element}
        {renderChrome(node, path)}
      </div>
    );
  };
```

- [ ] **Step 4: Przeprowadź `path` przez `renderField` i `renderSection`**

Zmień sygnaturę `renderField` (linia ~459):

```jsx
  const renderField = (field, path) => {
```

W gałęzi `case SECTION_TYPE:` (linia ~936) przekaż ścieżkę dalej:

```jsx
      case SECTION_TYPE:
        return field.section ? renderSection(field.section, true, path) : null;
```

Zmień `renderSection` (linia ~948) — dochodzi `path`, a mapowanie dzieci przechodzi przez `withChrome`:

```jsx
  // renderSection draws one section and recurses through renderField into nested ones.
  // `nested` is a boolean rather than a depth number on purpose: the styling has exactly two
  // states (root and nested), and depth is unbounded, so a depth-indexed class would need an
  // arbitrary cap that the model does not have.
  //
  // `path` is this section's own address in the same number[] form utils/templateSections.js
  // uses. It is threaded rather than recomputed so the creator's chrome, the tree operations
  // and the drag-and-drop index all speak one vocabulary.
  const renderSection = (section, nested, path) => (
    <div
      key={section.id}
      className={`custom-sheet__section${nested ? ' custom-sheet__section--nested' : ''}`}
    >
      {section.title && (
        <div className={`custom-sheet__section-heading${nested ? ' custom-sheet__section-heading--nested' : ''}`}>
          {section.title}
        </div>
      )}
      <div className={`custom-sheet__fields custom-sheet__fields--${section.columns || 1}-col`}>
        {(section.fields || []).map((child, i) =>
          withChrome(child, [...path, i], renderField(child, [...path, i]))
        )}
      </div>
    </div>
  );
```

Zmień render korzeni (linia ~965):

```jsx
      <div className="custom-sheet__sections">
        {(sections || []).map((section, i) =>
          withChrome(section, [i], renderSection(section, false, [i]))
        )}
      </div>
```

- [ ] **Step 5: Uruchom test szwu — musi przejść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.chromeSeam`
Oczekiwane: PASS, `4 passed`.

- [ ] **Step 6: Uruchom WSZYSTKIE testy `CustomSheetBody` — snapshot musi zostać zielony BEZ aktualizacji**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody`
Oczekiwane: PASS we wszystkich plikach, w tym `CustomSheetBody.domShape`.

Jeśli snapshot padnie — **nie uruchamiaj `-u`**. Padnięcie znaczy, że gałąź bez chrome zmieniła kształt DOM, czyli dokładnie regresję, przed którą ten test stoi. Znajdź wrapper, który wyciekł do gałęzi bez `renderChrome`.

- [ ] **Step 7: Dodaj styl wrappera**

W `src/style.css`, w sekcji `.custom-sheet__field` (~linia 7775), dopisz **przed** nią:

```css
/* ── Creator edit chrome ─────────────────────────────────────────────────────
   Present only when CustomSheetBody gets a renderChrome prop, i.e. inside the
   creator. The wrapper takes over the grid-cell role from the field it holds, so
   `min-width: 0` restores what the grid's own minmax(0, 1fr) guarantees — without
   it the cell's automatic minimum size lets wide content push columns apart. No
   sheet field uses grid-column spanning, so nothing else moves. */
.custom-sheet__editable {
    position: relative;
    min-width: 0;
}
```

- [ ] **Step 8: Uruchom cały zestaw testów systemu custom**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern="systems/custom"`
Oczekiwane: PASS.

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx \
        warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.chromeSeam.test.jsx \
        warhammer-battle-helper-front/src/style.css
git commit -m "feat: FEATURE-214 renderChrome seam and node paths in CustomSheetBody

Optional decoration seam for the creator's edit view. Without the prop the
markup is unchanged, which the characterization snapshot enforces.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `insertionAt` i `toMoveArgs` — decyzja o miejscu wstawienia

Czyste funkcje prostokątów. Żadnego DOM — w jsdom `getBoundingClientRect` zwraca zera, więc cała logika dropu musi żyć poza warstwą mierzącą.

**Files:**
- Create: `src/utils/sheetDnd.js`
- Create: `src/utils/sheetDnd.test.js`

**Interfaces:**
- Produces:
  - `GAP = 8`
  - `insertionAt(pointer, nodes) → { parentPath: number[], index: number } | null`
    — `pointer` = `{ x, y }`; `nodes` = tablica `{ path: number[], rect: {top,left,width,height}, container: boolean }`; `index` jest **wizualny (przed usunięciem)**.
  - `toMoveArgs(fromPath, target) → { toParentPath: number[], toIndex: number }` — przelicza indeks wizualny na **post-removal**, którego wymaga `moveNode`.

- [ ] **Step 1: Napisz testy (muszą paść)**

`src/utils/sheetDnd.test.js`:

```js
import { insertionAt, toMoveArgs, GAP } from './sheetDnd';

// Rect helper: sheet coordinates are viewport coordinates, y grows downwards.
const r = (left, top, width, height) => ({ left, top, width, height });

// One root section (container) at 0, holding three fields side by side in one row.
const rowTree = () => ([
  { path: [0],    rect: r(0, 0, 300, 100), container: true },
  { path: [0, 0], rect: r(10, 20, 80, 40), container: false },
  { path: [0, 1], rect: r(98, 20, 80, 40), container: false },
  { path: [0, 2], rect: r(186, 20, 80, 40), container: false },
]);

// One root section holding two stacked fields (single column).
const columnTree = () => ([
  { path: [0],    rect: r(0, 0, 300, 200), container: true },
  { path: [0, 0], rect: r(10, 20, 280, 40), container: false },
  { path: [0, 1], rect: r(10, 68, 280, 40), container: false },
]);

describe('insertionAt — horizontal axis (fields in one row)', () => {
  test('pointer left of a field centre inserts before it', () => {
    expect(insertionAt({ x: 110, y: 40 }, rowTree()))
      .toEqual({ parentPath: [0], index: 1 });
  });

  test('pointer right of a field centre inserts after it', () => {
    expect(insertionAt({ x: 170, y: 40 }, rowTree()))
      .toEqual({ parentPath: [0], index: 2 });
  });

  test('pointer past the last field inserts at the end', () => {
    expect(insertionAt({ x: 260, y: 40 }, rowTree()))
      .toEqual({ parentPath: [0], index: 3 });
  });
});

describe('insertionAt — vertical axis (stacked fields)', () => {
  test('pointer above a field centre inserts before it', () => {
    expect(insertionAt({ x: 100, y: 30 }, columnTree()))
      .toEqual({ parentPath: [0], index: 0 });
  });

  test('pointer below a field centre inserts after it', () => {
    expect(insertionAt({ x: 100, y: 55 }, columnTree()))
      .toEqual({ parentPath: [0], index: 1 });
  });
});

describe('insertionAt — containers', () => {
  test('pointer inside a section but over no child appends to that section', () => {
    expect(insertionAt({ x: 150, y: 90 }, rowTree()))
      .toEqual({ parentPath: [0], index: 3 });
  });

  test('an empty section accepts the first child', () => {
    const nodes = [{ path: [0], rect: r(0, 0, 300, 100), container: true }];
    expect(insertionAt({ x: 150, y: 50 }, nodes))
      .toEqual({ parentPath: [0], index: 0 });
  });

  test('the deepest container under the pointer wins', () => {
    const nodes = [
      { path: [0],       rect: r(0, 0, 300, 200), container: true },
      { path: [0, 0],    rect: r(10, 20, 280, 120), container: true },
      { path: [0, 0, 0], rect: r(20, 30, 100, 40), container: false },
    ];
    // Inside the nested section, below its only child.
    expect(insertionAt({ x: 150, y: 120 }, nodes))
      .toEqual({ parentPath: [0, 0], index: 1 });
  });

  test('pointer outside every node returns null', () => {
    expect(insertionAt({ x: 900, y: 900 }, rowTree())).toBeNull();
  });
});

describe('toMoveArgs — post-removal index', () => {
  test('moving forward inside the same list shifts the index down by one', () => {
    expect(toMoveArgs([0, 0], { parentPath: [0], index: 2 }))
      .toEqual({ toParentPath: [0], toIndex: 1 });
  });

  test('moving backward inside the same list keeps the index', () => {
    expect(toMoveArgs([0, 2], { parentPath: [0], index: 1 }))
      .toEqual({ toParentPath: [0], toIndex: 1 });
  });

  test('dropping into a different list keeps the index', () => {
    expect(toMoveArgs([0, 0], { parentPath: [1], index: 2 }))
      .toEqual({ toParentPath: [1], toIndex: 2 });
  });

  test('dropping onto its own position is a no-op index', () => {
    expect(toMoveArgs([0, 1], { parentPath: [0], index: 1 }))
      .toEqual({ toParentPath: [0], toIndex: 1 });
  });
});

describe('GAP', () => {
  test('matches the sheet grid gap in style.css', () => {
    expect(GAP).toBe(8);
  });
});
```

- [ ] **Step 2: Uruchom — musi paść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=sheetDnd`
Oczekiwane: FAIL — `Cannot find module './sheetDnd'`.

- [ ] **Step 3: Zaimplementuj `sheetDnd.js`**

`src/utils/sheetDnd.js`:

```js
/**
 * Drop-position maths for the creator's WYSIWYG sheet.
 *
 * Every decision here is a pure function of rectangles, for two reasons.
 *
 * Correctness: the layout must not move while a drag is in progress. A CSS grid row is as tall
 * as its tallest cell, so sliding a 200px text area into a row of 40px attributes would change
 * that row's height, push everything below it, put a different element under the pointer and
 * flip the decision that caused the shift — the decision chasing the geometry it changed. The
 * edit view therefore previews a drop with an out-of-flow ghost (see ghostRectFor) and never
 * displaces anything, which is what makes measuring legal AND lets us measure once, at
 * dragStart, instead of on every pointer move.
 *
 * Testability: jsdom has no layout. getBoundingClientRect returns zeros, window.PointerEvent
 * does not exist and document.elementFromPoint is missing, so anything decided inside a DOM
 * handler cannot be tested at all. Keeping the decision here leaves the measuring layer thin
 * enough to verify in a browser instead.
 */

// The sheet grid's gap, from `.custom-sheet__fields--N-col` in style.css. Duplicated as a
// constant because the ghost has to reason about the space between cells, and a test asserts
// the two stay equal.
export const GAP = 8;

const right  = (rect) => rect.left + rect.width;
const bottom = (rect) => rect.top + rect.height;

const contains = (rect, p) =>
  p.x >= rect.left && p.x <= right(rect) && p.y >= rect.top && p.y <= bottom(rect);

const isChildOf = (path, parentPath) =>
  path.length === parentPath.length + 1 &&
  parentPath.every((seg, i) => path[i] === seg);

// childrenOf returns a container's direct children in model order. Sorting by the last path
// segment rather than by position keeps the index meaningful when a row wraps.
const childrenOf = (nodes, parentPath) =>
  nodes
    .filter((n) => isChildOf(n.path, parentPath))
    .sort((a, b) => a.path[a.path.length - 1] - b.path[b.path.length - 1]);

/**
 * insertionAt decides where a dragged node would land.
 *
 * @param {{x:number,y:number}} pointer
 * @param {Array<{path:number[],rect:{top,left,width,height},container:boolean}>} nodes
 * @returns {{parentPath:number[],index:number}|null} index is the VISUAL index, i.e. it counts
 *   the dragged node if it is still in that list. Pass it through toMoveArgs before moveNode.
 */
export function insertionAt(pointer, nodes) {
  if (!pointer || !Array.isArray(nodes) || nodes.length === 0) return null;

  const hits = nodes.filter((n) => contains(n.rect, pointer));
  if (hits.length === 0) return null;

  // Deepest wins. A field sits inside its section's rect, so both match; the field is the
  // more specific answer, exactly as with hover chrome.
  const deepest = hits.reduce((a, b) => (b.path.length > a.path.length ? b : a));

  if (!deepest.container) {
    const parentPath = deepest.path.slice(0, -1);
    const index = deepest.path[deepest.path.length - 1];
    const after = isAfterMidpoint(pointer, deepest, nodes, parentPath, index);
    return { parentPath, index: after ? index + 1 : index };
  }

  // A container under the pointer with no child under it means "append to this container".
  return { parentPath: deepest.path, index: childrenOf(nodes, deepest.path).length };
}

// isAfterMidpoint picks the axis from the siblings' own geometry: a neighbour sharing this
// node's `top` is beside it, so the meaningful midpoint is horizontal; otherwise the list reads
// top-to-bottom. Measuring the axis instead of assuming it is what makes one rule serve both a
// 1-column flex list and a wrapping 6-column grid.
function isAfterMidpoint(pointer, node, nodes, parentPath, index) {
  const siblings = childrenOf(nodes, parentPath);
  const neighbour = siblings[index + 1] || siblings[index - 1];
  const horizontal = !!neighbour && neighbour.rect.top === node.rect.top;
  return horizontal
    ? pointer.x > node.rect.left + node.rect.width / 2
    : pointer.y > node.rect.top + node.rect.height / 2;
}

/**
 * toMoveArgs converts a visual insertion point into moveNode's arguments.
 *
 * moveNode takes a POST-REMOVAL index: it addresses the target list as it looks once the
 * dragged node is gone (see utils/templateSections.js). insertionAt counts the list as it looks
 * on screen, with the node still in it. The two differ by exactly one whenever the node is
 * moving forward within its own list — the classic off-by-one of every reorder implementation.
 */
export function toMoveArgs(fromPath, target) {
  const { parentPath, index } = target;
  const fromParent = fromPath.slice(0, -1);
  const fromIndex = fromPath[fromPath.length - 1];
  const sameList =
    fromParent.length === parentPath.length &&
    fromParent.every((seg, i) => parentPath[i] === seg);
  const toIndex = sameList && index > fromIndex ? index - 1 : index;
  return { toParentPath: parentPath, toIndex };
}
```

- [ ] **Step 4: Uruchom testy — muszą przejść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=sheetDnd`
Oczekiwane: PASS, `14 passed`.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/sheetDnd.js \
        warhammer-battle-helper-front/src/utils/sheetDnd.test.js
git commit -m "feat: FEATURE-214 pure drop-position maths for the WYSIWYG sheet

insertionAt picks the deepest node under the pointer and reads the axis from
sibling geometry; toMoveArgs converts its visual index to moveNode's
post-removal convention.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `measureNodes` i `ghostRectFor`

**Files:**
- Modify: `src/utils/sheetDnd.js`
- Modify: `src/utils/sheetDnd.test.js`

**Interfaces:**
- Consumes: `GAP`, `childrenOf` z Taska 3.
- Produces:
  - `measureNodes(entries) → Array<{path, rect, container}>` — `entries` to `Array<{path, container, el: HTMLElement}>`.
  - `ghostRectFor(target, draggedRect, nodes) → {top,left,width,height} | null`

- [ ] **Step 1: Dopisz testy (muszą paść)**

Na końcu `src/utils/sheetDnd.test.js` dopisz:

```js
import { ghostRectFor, measureNodes } from './sheetDnd';

describe('ghostRectFor', () => {
  const nodes = [
    { path: [0],    rect: r(0, 0, 300, 100), container: true },
    { path: [0, 0], rect: r(10, 20, 80, 40), container: false },
    { path: [0, 1], rect: r(98, 20, 80, 40), container: false },
  ];
  const dragged = r(0, 0, 80, 120);

  test('takes the column position and width of the field it displaces, and the dragged height', () => {
    expect(ghostRectFor({ parentPath: [0], index: 1 }, dragged, nodes))
      .toEqual({ top: 20, left: 98, width: 80, height: 120 });
  });

  test('appending where the row still has space places the ghost beside the last field', () => {
    expect(ghostRectFor({ parentPath: [0], index: 2 }, dragged, nodes))
      .toEqual({ top: 20, left: 98 + 80 + GAP, width: 80, height: 120 });
  });

  test('appending where the row is full places the ghost on the next line', () => {
    const full = [
      { path: [0],    rect: r(0, 0, 180, 100), container: true },
      { path: [0, 0], rect: r(10, 20, 80, 40), container: false },
      { path: [0, 1], rect: r(98, 20, 80, 40), container: false },
    ];
    expect(ghostRectFor({ parentPath: [0], index: 2 }, dragged, full))
      .toEqual({ top: 20 + 40 + GAP, left: 10, width: 80, height: 120 });
  });

  test('an empty container gets a ghost the width of the container', () => {
    const empty = [{ path: [0], rect: r(0, 0, 300, 100), container: true }];
    expect(ghostRectFor({ parentPath: [0], index: 0 }, dragged, empty))
      .toEqual({ top: 0, left: 0, width: 300, height: 120 });
  });

  test('an unknown target returns null', () => {
    expect(ghostRectFor({ parentPath: [9], index: 0 }, dragged, nodes)).toBeNull();
  });
});

describe('measureNodes', () => {
  test('reads each element rect once and keeps path and container flag', () => {
    const el = (rect) => ({ getBoundingClientRect: () => rect });
    const out = measureNodes([
      { path: [0], container: true, el: el(r(0, 0, 300, 100)) },
      { path: [0, 0], container: false, el: el(r(10, 20, 80, 40)) },
    ]);
    expect(out).toEqual([
      { path: [0], container: true, rect: r(0, 0, 300, 100) },
      { path: [0, 0], container: false, rect: r(10, 20, 80, 40) },
    ]);
  });

  test('skips entries whose element is gone', () => {
    expect(measureNodes([{ path: [0], container: true, el: null }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Uruchom — musi paść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=sheetDnd`
Oczekiwane: FAIL — `ghostRectFor is not a function`.

- [ ] **Step 3: Dopisz implementację**

Na końcu `src/utils/sheetDnd.js`:

```js
/**
 * measureNodes takes one layout reading of every node. Called once, on dragStart, because the
 * layout is frozen for the whole drag — so this is the entire DOM contact of the drag system.
 *
 * It is a standalone, callable function rather than an inline read inside the drag handler on
 * purpose: a space-reserving placeholder would need the very same reading taken more often,
 * and that must be a change of call frequency, not a rewrite of the handler.
 */
export function measureNodes(entries) {
  return (entries || [])
    .filter((e) => e && e.el)
    .map(({ path, container, el }) => {
      const { top, left, width, height } = el.getBoundingClientRect();
      return { path, container, rect: { top, left, width, height } };
    });
}

/**
 * ghostRectFor gives the out-of-flow preview its box: where the dragged node would sit.
 *
 * The cell does not exist yet, so the box is inferred from the neighbour it displaces — its
 * column position and width — combined with the dragged node's own height. That approximation
 * is the price of never reflowing: a preview that reserved real space would change the very
 * rectangles insertionAt was measured against.
 */
export function ghostRectFor(target, draggedRect, nodes) {
  if (!target || !draggedRect) return null;
  const container = (nodes || []).find(
    (n) => n.path.length === target.parentPath.length &&
           n.path.every((seg, i) => target.parentPath[i] === seg)
  );
  if (!container) return null;

  const children = childrenOf(nodes, target.parentPath);
  const height = draggedRect.height;

  if (children.length === 0) {
    const { top, left, width } = container.rect;
    return { top, left, width, height };
  }

  const displaced = children[target.index];
  if (displaced) {
    return { top: displaced.rect.top, left: displaced.rect.left, width: displaced.rect.width, height };
  }

  // Appending: continue the last row if another cell of that width still fits, otherwise
  // start a new line under it.
  const last = children[children.length - 1];
  const nextLeft = right(last.rect) + GAP;
  const fitsInRow = nextLeft + last.rect.width <= right(container.rect);
  return fitsInRow
    ? { top: last.rect.top, left: nextLeft, width: last.rect.width, height }
    : { top: bottom(last.rect) + GAP, left: children[0].rect.left, width: last.rect.width, height };
}
```

- [ ] **Step 4: Uruchom testy — muszą przejść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=sheetDnd`
Oczekiwane: PASS, `21 passed`.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/sheetDnd.js \
        warhammer-battle-helper-front/src/utils/sheetDnd.test.js
git commit -m "feat: FEATURE-214 one-shot node measurement and out-of-flow ghost rect

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Komponenty chrome i ich style

**Files:**
- Create: `src/components/creator/FieldChrome.jsx`
- Create: `src/components/creator/SectionChrome.jsx`
- Create: `src/components/creator/EditablePlaceholder.jsx`
- Create: `src/components/creator/FieldChrome.test.jsx`
- Modify: `src/style.css`
- Modify: `src/locales/en/translation.json`, `src/locales/pl/translation.json`

**Interfaces:**
- Consumes: `withChrome` z Taska 2 (wywołuje te komponenty).
- Produces:
  - `<FieldChrome field selected duplicateKey onSelect onEdit dragRef dragProps />`
  - `<SectionChrome section selected onSelect onEdit onAddField dragRef dragProps />`
  - `<EditablePlaceholder node />` — zwraca `null`, gdy węzeł nie jest pusty.

- [ ] **Step 1: Dodaj klucze i18n**

`src/locales/en/translation.json`, w obiekcie `creator`:

```json
    "chromeEdit": "Edit",
    "chromeDrag": "Drag",
    "chromeAddField": "Add field",
    "placeholderLabelText": "Label text",
    "placeholderEmptySection": "Add a field or drag one here",
    "placeholderNoLabel": "—",
    "previewToggle": "Clean preview",
    "tabSheet": "Sheet",
```

`src/locales/pl/translation.json`, w obiekcie `creator`:

```json
    "chromeEdit": "Edytuj",
    "chromeDrag": "Przeciągnij",
    "chromeAddField": "Dodaj pole",
    "placeholderLabelText": "Tekst etykiety",
    "placeholderEmptySection": "Dodaj pole lub przeciągnij tutaj",
    "placeholderNoLabel": "—",
    "previewToggle": "Czysty podgląd",
    "tabSheet": "Karta",
```

- [ ] **Step 2: Napisz test chrome (musi paść)**

`src/components/creator/FieldChrome.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import FieldChrome from './FieldChrome';
import SectionChrome from './SectionChrome';

const field = { key: 'attr_ws', type: 'attr', label: 'WW' };
const section = { id: 'sec_a', title: 'Cechy', columns: 2, fields: [] };

describe('FieldChrome', () => {
  test('offers a drag handle and an edit button', () => {
    render(<FieldChrome field={field} onSelect={() => {}} onEdit={() => {}} />);
    expect(screen.getByLabelText('Drag')).toBeInTheDocument();
    expect(screen.getByLabelText('Edit')).toBeInTheDocument();
  });

  test('the edit button opens properties without going through selection', () => {
    const onEdit = jest.fn();
    const onSelect = jest.fn();
    render(<FieldChrome field={field} onSelect={onSelect} onEdit={onEdit} />);
    fireEvent.click(screen.getByLabelText('Edit'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('a duplicate key is flagged permanently, not only on hover', () => {
    const { container } = render(
      <FieldChrome field={field} duplicateKey onSelect={() => {}} onEdit={() => {}} />
    );
    const badge = container.querySelector('.creator__chrome-dupe');
    expect(badge).toBeInTheDocument();
    // The badge lives outside the hover-gated pill so CSS cannot hide it.
    expect(badge.closest('.creator__chrome')).toBeNull();
  });

  test('selection is reflected on the outline element', () => {
    const { container } = render(
      <FieldChrome field={field} selected onSelect={() => {}} onEdit={() => {}} />
    );
    expect(container.querySelector('.creator__chrome-outline--selected')).toBeInTheDocument();
  });
});

describe('SectionChrome', () => {
  test('adds an add-field button next to drag and edit', () => {
    render(<SectionChrome section={section} onSelect={() => {}} onEdit={() => {}} onAddField={() => {}} />);
    expect(screen.getByLabelText('Drag')).toBeInTheDocument();
    expect(screen.getByLabelText('Edit')).toBeInTheDocument();
    expect(screen.getByLabelText('Add field')).toBeInTheDocument();
  });

  test('add-field does not select the section', () => {
    const onAddField = jest.fn();
    const onSelect = jest.fn();
    render(<SectionChrome section={section} onSelect={onSelect} onEdit={() => {}} onAddField={onAddField} />);
    fireEvent.click(screen.getByLabelText('Add field'));
    expect(onAddField).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Uruchom — musi paść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=FieldChrome`
Oczekiwane: FAIL — `Cannot find module './FieldChrome'`.

- [ ] **Step 4: Zaimplementuj `FieldChrome.jsx`**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditIcon from '@mui/icons-material/Edit';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

// Edit affordances for one leaf field, injected by CustomSheetBody's renderChrome seam.
//
// Everything here is absolutely positioned inside the field's own bounds. A toolbar above the
// field would either push the grid (and the render would stop being faithful exactly while the
// GM is checking it) or cover the neighbour in the row above — the sheet is a 2D grid of up to
// six columns, so unlike Notion's single-column blocks there is no gutter and no free space.
//
// The pill sits in the TOP-RIGHT corner while SectionChrome takes the top-left: a nested
// section and its first child start at the same point, so one shared corner would overlap at
// every level of nesting.
function FieldChrome({ field, selected = false, duplicateKey = false, onSelect, onEdit, dragRef, dragProps }) {
  const { t } = useTranslation();
  return (
    <>
      <div
        className={`creator__chrome-outline${selected ? ' creator__chrome-outline--selected' : ''}`}
        onClick={e => { e.stopPropagation(); onSelect(); }}
      />
      {duplicateKey && (
        // Outside the hover-gated pill on purpose: a duplicate key means two fields share one
        // value in Character.Stats, and a warning the GM has to hover to find is a warning the
        // GM will not see.
        <div className="creator__chrome-dupe" title={t('creator.duplicateKeyWarn')}>
          <WarningAmberIcon style={{ fontSize: 12 }} />
        </div>
      )}
      <div className="creator__chrome creator__chrome--field">
        <span
          ref={dragRef}
          className="creator__chrome-btn creator__chrome-btn--drag"
          aria-label={t('creator.chromeDrag')}
          {...dragProps}
        >
          <DragIndicatorIcon style={{ fontSize: 13 }} />
        </span>
        <button
          className="creator__chrome-btn"
          aria-label={t('creator.chromeEdit')}
          onClick={e => { e.stopPropagation(); onEdit(); }}
        >
          <EditIcon style={{ fontSize: 13 }} />
        </button>
      </div>
    </>
  );
}

export default FieldChrome;
```

- [ ] **Step 5: Zaimplementuj `SectionChrome.jsx`**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';

// Edit affordances for a section, at every depth.
//
// Positioned against the SECTION BOX, never against its heading: CustomSheetBody renders the
// heading only when section.title is set, and a title-less section is a normal state in the
// creator (makeDefaultSection starts with title: ''). Anchoring to the heading would leave
// exactly those sections without a drag handle and without "add field".
//
// Top-LEFT corner, opposite FieldChrome — see the note there.
function SectionChrome({ section, selected = false, onSelect, onEdit, onAddField, dragRef, dragProps }) {
  const { t } = useTranslation();
  return (
    <>
      <div
        className={`creator__chrome-outline creator__chrome-outline--section${selected ? ' creator__chrome-outline--selected' : ''}`}
        onClick={e => { e.stopPropagation(); onSelect(); }}
      />
      <div className="creator__chrome creator__chrome--section">
        <span
          ref={dragRef}
          className="creator__chrome-btn creator__chrome-btn--drag"
          aria-label={t('creator.chromeDrag')}
          {...dragProps}
        >
          <DragIndicatorIcon style={{ fontSize: 13 }} />
        </span>
        <button
          className="creator__chrome-btn"
          aria-label={t('creator.chromeEdit')}
          onClick={e => { e.stopPropagation(); onEdit(); }}
        >
          <EditIcon style={{ fontSize: 13 }} />
        </button>
        <button
          className="creator__chrome-btn"
          aria-label={t('creator.chromeAddField')}
          onClick={e => { e.stopPropagation(); onAddField(); }}
        >
          <AddIcon style={{ fontSize: 13 }} />
        </button>
      </div>
    </>
  );
}

export default SectionChrome;
```

- [ ] **Step 6: Zaimplementuj `EditablePlaceholder.jsx`**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { SECTION_TYPE, sectionOf, isContainer } from '../../utils/templateSections';

// Edit-only stand-ins for nodes that render to nothing.
//
// An empty label, an empty section and a weapons table with no rows occupy zero pixels on a
// real sheet, so in a WYSIWYG editor they would be unhoverable and unreachable. The stand-ins
// live HERE rather than in CustomSheetBody so the session's markup stays byte-for-byte what it
// has always been.
//
// They are never filled with sample values. Fake numbers would be indistinguishable from the
// real starting values the Go plugin assigns (plugin.go:83), and an attr field with a 1-10
// range would get a value outside its own range or a silently clamped one — either way the GM
// would draw the wrong conclusion about a mechanism that does work.
function EditablePlaceholder({ node }) {
  const { t } = useTranslation();

  if (isContainer(node)) {
    const def = sectionOf(node);
    if (def && (def.fields || []).length === 0) {
      return <div className="creator__ph creator__ph--section">{t('creator.placeholderEmptySection')}</div>;
    }
    return null;
  }
  if (node.type === SECTION_TYPE) return null;
  if (node.type === 'label' && !node.text) {
    return <div className="creator__ph creator__ph--inline">{t('creator.placeholderLabelText')}</div>;
  }
  if (node.type === 'weapons_table' && (node.rows || []).length === 0) {
    return <div className="creator__ph creator__ph--row" />;
  }
  if (!node.label && node.type !== 'label') {
    return <div className="creator__ph creator__ph--inline">{t('creator.placeholderNoLabel')}</div>;
  }
  return null;
}

export default EditablePlaceholder;
```

- [ ] **Step 7: Dodaj style chrome**

W `src/style.css`, zaraz po bloku `.custom-sheet__editable` z Taska 2:

```css
/* The outline is a separate, non-interactive overlay rather than a border on the wrapper:
   a border would take up space and shift the very layout the GM is judging. */
.creator__chrome-outline {
    position: absolute;
    inset: -2px;
    border: 1.5px solid transparent;
    border-radius: 5px;
    pointer-events: auto;
    background: transparent;
    z-index: 1;
}

.custom-sheet__editable:hover > .creator__chrome-outline {
    border-color: rgba(201, 151, 91, 0.55);
}

.creator__chrome-outline--selected,
.custom-sheet__editable:hover > .creator__chrome-outline--selected {
    border-color: #7a5c42;
    border-width: 2px;
}

.creator__chrome {
    position: absolute;
    top: -8px;
    display: flex;
    gap: 1px;
    padding: 1px;
    border-radius: 5px;
    background: #f4e8d8;
    border: 1px solid #c4a882;
    box-shadow: 0 1px 4px rgba(58, 47, 31, 0.25);
    opacity: 0;
    transition: opacity 90ms ease;
    pointer-events: none;
    z-index: 3;
}

.creator__chrome--field   { right: -4px; }
.creator__chrome--section { left: -4px; }

.custom-sheet__editable:hover > .creator__chrome {
    opacity: 1;
    pointer-events: auto;
}

/* Deepest node wins. Hover propagates through every DOM ancestor, and FEATURE-211 made the
   nesting depth unbounded — a field five levels deep would light six pills whose corners stack
   into a staircase at the same spot. `:has()` states the rule declaratively; doing it with
   mouseenter/mouseleave would mean per-field React state and a re-render for every pixel the
   mouse travels across a forty-field sheet. */
.custom-sheet__editable:has(.custom-sheet__editable:hover) > .creator__chrome {
    opacity: 0;
    pointer-events: none;
}

.creator__chrome-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #7a5c42;
    cursor: pointer;
}

.creator__chrome-btn:hover { background: rgba(201, 151, 91, 0.3); }
.creator__chrome-btn--drag { cursor: grab; }

.creator__chrome-dupe {
    position: absolute;
    bottom: -6px;
    right: -4px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #b3261e;
    color: #fff9f0;
    z-index: 4;
}

/* Edit-only stand-ins for nodes that render to nothing. Dimmed and italic so they can never
   be mistaken for data. */
.creator__ph {
    font-family: 'Crimson Text', serif;
    font-style: italic;
    color: rgba(58, 47, 31, 0.4);
    pointer-events: none;
}

.creator__ph--inline { font-size: 12px; }

.creator__ph--section {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 56px;
    border: 1.5px dashed rgba(201, 151, 91, 0.6);
    border-radius: 6px;
    font-size: 12px;
}

.creator__ph--row {
    height: 22px;
    border-radius: 4px;
    background: rgba(201, 151, 91, 0.18);
}
```

- [ ] **Step 8: Uruchom testy — muszą przejść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=FieldChrome`
Oczekiwane: PASS, `6 passed`.

- [ ] **Step 9: Sprawdź spójność i18n**

Run: `cd warhammer-battle-helper-front && node -e "const en=require('./src/locales/en/translation.json').creator, pl=require('./src/locales/pl/translation.json').creator; const miss=Object.keys(en).filter(k=>!(k in pl)); console.log(miss.length?('BRAK w pl: '+miss.join(', ')):'OK');"`
Oczekiwane: `OK`.

- [ ] **Step 10: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator/FieldChrome.jsx \
        warhammer-battle-helper-front/src/components/creator/SectionChrome.jsx \
        warhammer-battle-helper-front/src/components/creator/EditablePlaceholder.jsx \
        warhammer-battle-helper-front/src/components/creator/FieldChrome.test.jsx \
        warhammer-battle-helper-front/src/style.css \
        warhammer-battle-helper-front/src/locales/en/translation.json \
        warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat: FEATURE-214 chrome components and edit-only placeholders

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Właściwości w `DraggablePopup`

Robione przed przebudową canvasu, żeby popup dało się zweryfikować na jeszcze działającym widoku.

**Files:**
- Create: `src/components/creator/PropertyPopup.jsx`
- Modify: `src/components/creator/TemplateBuilder.jsx` (prawy `<aside>` → popup)
- Modify: `src/style.css` (usunięcie `.creator__props-aside`)

**Interfaces:**
- Produces: `<PropertyPopup open node isSection ... onClose />`

- [ ] **Step 1: Zaimplementuj `PropertyPopup.jsx`**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import DraggablePopup from '../common/DraggablePopup';

// Properties live in a movable popup rather than a docked panel because of plain arithmetic:
// palette 200px + panel 400px + canvas padding 48px = 648px of chrome, which on a 1440px
// laptop leaves 792px for a sheet whose default width is 900px (SHEET_WIDTH_DEFAULT). A docked
// panel would squeeze the render exactly while the GM is judging it, and a WYSIWYG editor that
// cannot show a faithful default-width sheet has eaten its own premise.
//
// The panel CONTENTS are unchanged — this is a different container, not a redesign.
function PropertyPopup({ open, title, onClose, children }) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <DraggablePopup title={title || t('creator.propsClickHint')} onClose={onClose} initialWidth={420}>
      <div className="creator__props-popup-body">{children}</div>
    </DraggablePopup>
  );
}

export default PropertyPopup;
```

- [ ] **Step 2: Podepnij w `TemplateBuilder.jsx`**

Dodaj import:

```jsx
import PropertyPopup from './PropertyPopup';
```

Dodaj stan obok `selected` (przy `const [selected, setSelected] = useState(null);`):

```jsx
  // Selection and properties are deliberately separate. A click selects (it makes the node the
  // palette's target); only the chrome's edit button opens properties. Were selection to open
  // the popup, the dominant flow — select a section, then click the palette a few times to add
  // fields — would keep the popup hanging over the very sheet being built.
  const [editingPath, setEditingPath] = useState(null);
```

Zamień cały blok `<aside className="creator__props-aside"> … </aside>` na:

```jsx
        <PropertyPopup
          open={editingPath !== null}
          title={editingIsSection ? t('creator.sectionProperties') : t('creator.fieldProperties')}
          onClose={() => setEditingPath(null)}
        >
          {editingNode && !editingIsSection ? (
            <PropertyPanel
              field={editingNode}
              onChange={patch => updateNode(editingPath, patch)}
              numberFields={numberFields}
              sections={sections}
            />
          ) : editingSectionDef ? (
            <SectionPropertyPanel
              section={editingSectionDef}
              onChange={patch => updateNode(editingPath, patch)}
              onDelete={() => { removeNode(editingPath); setEditingPath(null); }}
              index={editingPath[editingPath.length - 1]}
              siblingCount={locate(sections, editingPath)?.siblings.length ?? 0}
              onMove={dir => moveWithinParent(editingPath, dir)}
            />
          ) : null}
        </PropertyPopup>
```

Obok istniejących `selectedNode` / `selectedIsSection` dodaj odpowiedniki dla edycji:

```jsx
  const editingNode = editingPath !== null ? nodeAt(sections, editingPath) : null;
  const editingIsSection = editingPath !== null
    && (editingPath.length === 1 || editingNode?.type === SECTION_TYPE);
  const editingSectionDef = editingIsSection ? sectionOf(editingNode) : null;
```

- [ ] **Step 3: Dodaj klucze i18n dla tytułów popupu**

`en`: `"fieldProperties": "Field properties", "sectionProperties": "Section properties"`
`pl`: `"fieldProperties": "Właściwości pola", "sectionProperties": "Właściwości sekcji"`

- [ ] **Step 4: Dodaj styl ciała popupu i usuń styl dokowanego panelu**

W `src/style.css` usuń cały blok `.creator__props-aside` (~linia 9259) i dodaj:

```css
.creator__props-popup-body {
    padding: 12px;
    color: #3a2f1f;
}
```

- [ ] **Step 5: Uruchom testy kreatora**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=creator`
Oczekiwane: PASS (bez `TemplatePreview`, który usuwamy dopiero w Tasku 9 — na tym etapie nadal zielony).

- [ ] **Step 6: Weryfikacja w przeglądarce — z-index**

Uruchom aplikację, otwórz kreator (MUI `Dialog fullScreen`, z-index 1300), kliknij przycisk edycji.
Oczekiwane: popup **nad** dialogiem, przeciągalny, zamykalny.
Jeśli popup jest pod spodem — podnieś `z-index` kontenera `DraggablePopup` powyżej 1300 i odnotuj to w commicie.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator/PropertyPopup.jsx \
        warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx \
        warhammer-battle-helper-front/src/style.css \
        warhammer-battle-helper-front/src/locales/en/translation.json \
        warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat: FEATURE-214 move creator properties into a draggable popup

Frees the 400px the docked panel took from the sheet render.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Widok edycji = żywa karta

**Files:**
- Modify: `src/components/creator/TemplateBuilder.jsx`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `renderChrome` (Task 2), `FieldChrome`/`SectionChrome`/`EditablePlaceholder` (Task 5), `PropertyPopup` (Task 6).
- Produces: `buildChrome(node, path)` wewnątrz `TemplateBuilder`; przełącznik `cleanPreview`.

- [ ] **Step 1: Zastąp canvas kafelkowy żywą kartą**

W `TemplateBuilder.jsx` zamień zawartość `<main className="creator__canvas-area">` (blok z `DndKitContext` i `SectionCanvas`) na:

```jsx
        <main className="creator__sheet-area" onClick={() => { setSelected(null); setAddingToPath(null); }}>
          {sections.length === 0 ? (
            <div className="creator__canvas-empty">
              <AccountTreeIcon sx={{ fontSize: 48, opacity: 0.2, mb: 1, color: '#7a5c42' }} />
              <Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '1.1rem', fontStyle: 'italic', opacity: 0.5, color: '#3d2b1a' }}>
                {t('creator.canvasStart')}
              </Typography>
              <button className="creator__add-section-btn" style={{ marginTop: 24 }} onClick={e => { e.stopPropagation(); addSection(); }}>
                <AddIcon style={{ fontSize: 16 }} /> {t('creator.addSection')}
              </button>
            </div>
          ) : (
            <div onClick={e => e.stopPropagation()}>
              {/* The real session wrapper, not a preview-only one. The old preview tab had its
                  own chrome and therefore no width cap, which is precisely what hid
                  FEATURE-212's content-width bug; mounting anything else here would reopen
                  that gap. */}
              <div className="custom-sheet" style={{ maxWidth: clampSheetWidth(settings.sheetWidth) }}>
                <CustomSheetBody
                  sections={sections}
                  renderChrome={cleanPreview ? null : buildChrome}
                />
              </div>
              <button className="creator__add-section-btn" onClick={addSection}>
                <AddIcon style={{ fontSize: 16 }} /> {t('creator.addSection')}
              </button>
            </div>
          )}
        </main>
```

- [ ] **Step 2: Dodaj `buildChrome` i stan podglądu**

Obok pozostałego stanu:

```jsx
  const [cleanPreview, setCleanPreview] = useState(false);
```

Przed `return` w `TemplateBuilder`:

```jsx
  // The creator's half of the renderChrome contract: given a node and its path, return the
  // affordances CustomSheetBody will position inside that node's wrapper.
  const buildChrome = useCallback((node, path) => {
    const isSection = path.length === 1 || node.type === SECTION_TYPE;
    const common = {
      selected: samePath(selected, path),
      onSelect: () => setSelected(path),
      onEdit: () => setEditingPath(path),
    };
    return (
      <>
        <EditablePlaceholder node={node} />
        {isSection ? (
          <SectionChrome
            section={sectionOf(node)}
            onAddField={() => setAddingToPath(path)}
            {...common}
          />
        ) : (
          <FieldChrome
            field={node}
            duplicateKey={duplicateKeys?.has(node.key)}
            {...common}
          />
        )}
      </>
    );
  }, [selected, duplicateKeys]);
```

Dodaj importy:

```jsx
import CustomSheetBody from '../../systems/custom/CustomSheetBody';
import FieldChrome from './FieldChrome';
import SectionChrome from './SectionChrome';
import EditablePlaceholder from './EditablePlaceholder';
```

(`collectSkillOptions` i `renderDamageFormula` są już importowane z tego samego modułu — dopisz `CustomSheetBody` jako import domyślny osobną linią.)

- [ ] **Step 3: Zwęź paletę i dodaj przełącznik podglądu**

W `style.css` zmień szerokość palety:

```css
.creator__palette {
    width: 56px;
```

i dodaj regułę rozwijania:

```css
/* A 56px rail leaves no room for the target hint, so the palette's target is shown ON the
   sheet instead — the selected section carries the outline. */
.creator__palette:hover { width: 200px; }
.creator__palette { transition: width 120ms ease; }
.creator__palette:not(:hover) .creator__palette-info,
.creator__palette:not(:hover) .creator__palette-group-label,
.creator__palette:not(:hover) .creator__palette-title { display: none; }

.creator__sheet-area {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
    background: rgba(232, 220, 196, 0.35);
    position: relative;
}
```

W topbarze, obok wskaźnika zapisu, dodaj przełącznik:

```jsx
            <IconButton
              onClick={() => setCleanPreview(v => !v)}
              size="small"
              aria-label={t('creator.previewToggle')}
            >
              {cleanPreview ? <VisibilityOffIcon /> : <VisibilityIcon />}
            </IconButton>
```

z importami:

```jsx
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
```

- [ ] **Step 4: Zmień zakładki z trzech na dwie**

Usuń przycisk zakładki `preview` i strzałkę przed nim. Zmień etykietę zakładki `fields`:

```jsx
                  <span className="creator__tab-num">2</span>
                  {t('creator.tabSheet')}
```

Usuń gałąź `: activeTab === 'preview' ? <TemplatePreview … />` z `DialogContent`.

- [ ] **Step 5: Uruchom testy kreatora**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=creator`
Oczekiwane: `TemplateBuilder.sheetWidth` PASS; `TemplatePreview` może teraz paść — usuwamy go w Tasku 9.

- [ ] **Step 6: Weryfikacja w przeglądarce**

Otwórz kreator, zakładka „Karta". Sprawdź:
- karta renderuje się jak w sesji (limit szerokości działa),
- hover pola pokazuje pigułkę w prawym górnym rogu, hover sekcji w lewym górnym,
- najechanie na pole **nie** zapala chrome jego przodków,
- klik zaznacza (obwódka), nie otwiera popupu,
- przycisk edycji otwiera popup,
- przełącznik oka gasi całe chrome.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx \
        warhammer-battle-helper-front/src/style.css
git commit -m "feat: FEATURE-214 edit view renders the live character sheet

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: DnD na żywej karcie

**Files:**
- Modify: `src/components/creator/TemplateBuilder.jsx`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `measureNodes`, `insertionAt`, `toMoveArgs`, `ghostRectFor` (Taski 3–4); `moveNode`, `canDropInto` (istnieją).
- Produces: przeciąganie węzłów na karcie z duchem poza przepływem.

- [ ] **Step 1: Zbieraj referencje węzłów**

W `TemplateBuilder`:

```jsx
  // path -> element, filled by the chrome layer as each node mounts. This is the only DOM the
  // drag system touches, and it is read exactly once per drag (see handleDragStart).
  const nodeEls = useRef(new Map());
  const registerNode = useCallback((path, container, el) => {
    const key = path.join('.');
    if (el) nodeEls.current.set(key, { path, container, el });
    else nodeEls.current.delete(key);
  }, []);
```

W `buildChrome` przekaż `dragRef` przez `useDraggable` i zarejestruj węzeł na wrapperze przez `ref` outline'u:

```jsx
    const dragId = path.join('.');
```

i dodaj do `common`: `dragId`, `registerNode`.

- [ ] **Step 2: Zamień `DndKitContext` na jeden droppable**

```jsx
  const [dragState, setDragState] = useState(null); // { fromPath, rects, draggedRect, target }

  const handleDragStart = ({ active }) => {
    const fromPath = String(active.id).split('.').map(Number);
    // One reading for the whole drag: nothing in the sheet moves while dragging, so measuring
    // again would only cost work and invite the layout/decision feedback loop back in.
    const rects = measureNodes([...nodeEls.current.values()]);
    const dragged = rects.find(n => n.path.join('.') === active.id);
    setDragState({ fromPath, rects, draggedRect: dragged?.rect ?? null, target: null, scrollTop0: scrollRef.current?.scrollTop ?? 0 });
  };

  const handleDragMove = ({ activatorEvent, delta }) => {
    setDragState(prev => {
      if (!prev) return prev;
      // Rects were captured in viewport coordinates at dragStart. Scrolling the sheet moves
      // every one of them by the same amount; dnd-kit used to track this for us when each node
      // was its own droppable, so with a single droppable the correction is ours. Omitting it
      // is insidious: the drag is perfect until the first scroll, then lands consistently high.
      const scrolled = (scrollRef.current?.scrollTop ?? 0) - prev.scrollTop0;
      const pointer = {
        x: activatorEvent.clientX + delta.x,
        y: activatorEvent.clientY + delta.y + scrolled,
      };
      const target = insertionAt(pointer, prev.rects);
      return { ...prev, target };
    });
  };

  const handleDragEnd = () => {
    setDragState(prev => {
      if (prev?.target && canDropInto(sections, prev.fromPath, prev.target.parentPath)) {
        const { toParentPath, toIndex } = toMoveArgs(prev.fromPath, prev.target);
        commit(moveNode(sections, prev.fromPath, toParentPath, toIndex), null);
      }
      return null;
    });
  };
```

Owiń kartę w `<DndKitContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onDragCancel={() => setDragState(null)}>` i dodaj `<DragOverlay>` z przeciąganym polem.

- [ ] **Step 3: Narysuj ducha**

W `creator__sheet-area`, po karcie:

```jsx
              {ghostRect && (
                <div className="creator__drop-ghost" style={ghostRect}>
                  <CustomSheetBody sections={[ghostSection]} />
                </div>
              )}
```

gdzie `ghostRect` liczy `ghostRectFor(dragState.target, dragState.draggedRect, dragState.rects)`, a `ghostSection` to jednopolowa sekcja z przeciąganym węzłem.

Styl:

```css
/* Out of flow on purpose: a preview that reserved real space would change the very rectangles
   the drop decision was measured against. */
.creator__drop-ghost {
    position: fixed;
    opacity: 0.35;
    pointer-events: none;
    border: 1.5px dashed #7a5c42;
    border-radius: 6px;
    z-index: 2;
}
```

- [ ] **Step 4: Usuń nieużywany import `@dnd-kit/sortable`**

Z `TemplateBuilder.jsx` usuń cały import `SortableContext`, `useSortable`, `verticalListSortingStrategy`, `rectSortingStrategy` oraz `CSS` z `@dnd-kit/utilities`, jeśli przestał być używany.

- [ ] **Step 5: Uruchom testy**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern="creator|sheetDnd|templateSections"`
Oczekiwane: PASS poza `TemplatePreview` (usuwany w Tasku 9).

- [ ] **Step 6: Weryfikacja w przeglądarce — lista obowiązkowa**

- drop do sekcji pustej,
- drop do sekcji zagnieżdżonej na głębokości ≥3,
- drop węzła w samego siebie i we własnego potomka — odrzucony, bez zmiany,
- przeciąganie z przewinięciem karty w trakcie — duch i wynik zgodne,
- pole wysokie (`text_long`) przeciągane między niskie — brak migotania,
- karta szersza niż okno.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx \
        warhammer-battle-helper-front/src/style.css
git commit -m "feat: FEATURE-214 drag and drop on the live sheet

One droppable, rects measured once at drag start, out-of-flow ghost preview.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Sprzątanie

**Files:**
- Delete: `src/components/creator/TemplatePreview.jsx`, `src/components/creator/TemplatePreview.test.jsx`
- Modify: `src/components/creator/TemplateBuilder.jsx`, `src/utils/templateSections.js`, `src/utils/templateSections.test.js`, `src/style.css`, oba pliki `translation.json`

- [ ] **Step 1: Usuń martwe komponenty i funkcje**

```bash
cd warhammer-battle-helper-front
rm src/components/creator/TemplatePreview.jsx src/components/creator/TemplatePreview.test.jsx
```

Z `TemplateBuilder.jsx` usuń: `FieldCard`, `SectionCanvas`, `DropZone`, `redirectIntoTarget`, `collisionDetection`, `handleDragOver`, `intoTargetId`, `besideTargetId`, import `TemplatePreview`.

Z `utils/templateSections.js` usuń: `dropSentinelId`, `dropHeaderId`, `dropTargetOf`, `dropIntent` oraz stałe prefiksów. Z `utils/templateSections.test.js` usuń odpowiadające im bloki `describe`.

- [ ] **Step 2: Usuń martwy CSS**

Z `src/style.css` usuń wszystkie reguły `.creator__canvas-field*`, `.creator__section` (wersje kreatora), `.creator__drop-zone*`, `.creator__prev-*`, `.creator__fields-grid*`, `.creator__inline-picker` (jeśli zastąpione przez chrome sekcji), `.creator__add-field-btn`.

Weryfikacja, że nic nie zostało osierocone:

```bash
cd warhammer-battle-helper-front
for c in creator__canvas-field creator__drop-zone creator__prev-sheet creator__fields-grid; do
  echo "$c -> $(grep -rl "$c" src --include='*.jsx' --include='*.js' | wc -l) użyć w JS"
done
```
Oczekiwane: wszędzie `0`.

- [ ] **Step 3: Usuń martwe klucze i18n**

Z `src/locales/en/translation.json` i `src/locales/pl/translation.json` usuń z obiektu `creator`:
`canvasStepChip`, `dropZone`, `previewNoSections`, `previewSubtitle`, `previewDefaultName`, `tabPreview`, `tabFields`.

- [ ] **Step 4: Sprawdź, że żaden usunięty klucz nie jest już używany**

```bash
cd warhammer-battle-helper-front
for k in canvasStepChip dropZone previewNoSections previewSubtitle previewDefaultName tabPreview tabFields; do
  echo "$k -> $(grep -r "creator.$k" src --include='*.jsx' --include='*.js' | wc -l)"
done
```
Oczekiwane: wszędzie `0`.

- [ ] **Step 5: Uruchom pełny zestaw testów**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Oczekiwane: wszystko zielone poza znanym baseline failem `App.test.js` (axios ESM).

- [ ] **Step 6: Lint**

Run: `cd warhammer-battle-helper-front && npx eslint src --ext .js,.jsx`
Oczekiwane: brak błędów. Szczególnie `no-unused-vars` po usunięciach.

- [ ] **Step 7: Commit**

```bash
git add -A warhammer-battle-helper-front/src
git commit -m "refactor: FEATURE-214 remove the tile canvas, preview tab and sortable drop zones

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Weryfikacja końcowa

- [ ] **Step 1: Pełny zestaw testów**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Zanotuj dokładną liczbę `passed`/`failed`. Jedyny dopuszczalny fail: `App.test.js`.

- [ ] **Step 2: Snapshot karty nadal zielony bez aktualizacji**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.domShape`
Oczekiwane: PASS. To dowód, że karta w sesji gracza nie zmieniła się przez cały feature.

- [ ] **Step 3: Sesja gracza w przeglądarce**

Otwórz istniejącą grę z szablonem custom i kartę postaci gracza. Sprawdź: układ, szerokość, rzuty, tabela broni, drzewo umiejętności, sekcje zagnieżdżone — bez zmian względem `main`.

- [ ] **Step 4: Przejście kreatora od zera**

Nowy szablon → dodaj sekcję → dodaj 5 pól z palety pod rząd bez zamykania niczego → zagnieźdź sekcję → przeciągnij pole między sekcjami → zmień szerokość karty w zakładce Ogólne → wróć na „Kartę" i potwierdź, że limit szerokości działa → przełącz czysty podgląd.

- [ ] **Step 5: Commit dokumentacji, jeśli coś odbiegło od specyfikacji**

Jeśli implementacja wymusiła odstępstwo (np. podniesienie `z-index`, fallback zamiast `:has()`), dopisz je do `docs/superpowers/specs/FEATURE-214.md` i zacommituj razem z uzasadnieniem.

---

## Self-review — pokrycie specyfikacji

| Wymaganie ze specyfikacji | Task |
|---|---|
| Szew `renderChrome`, render bajt w bajt bez propa | 1, 2 |
| Ścieżki `number[]` w rendererze | 2 |
| Prawdziwy wrapper `.custom-sheet` z limitem szerokości | 7 |
| Klik = zaznaczenie, przycisk = właściwości | 5, 6, 7 |
| Chrome w przeciwnych narożnikach | 5 |
| Najgłębszy wygrywa, przez `:has()` | 5 |
| Placeholdery tylko-w-edycji | 5 |
| `⚠ dup` stale widoczny; usunięcie badge'y rollable/short-card/tag typu | 5, 9 |
| Właściwości w `DraggablePopup` | 6 |
| Paleta 56px, cel czytelny z karty | 7 |
| Podgląd jako przełącznik, dwie zakładki | 7 |
| Jeden droppable, pomiar raz, brak `SortableContext` | 8 |
| `insertionAt`, `toMoveArgs`, `ghostRectFor`, `measureNodes` | 3, 4 |
| Korekta o `scrollTop` | 8 |
| Duch poza przepływem | 8 |
| Pomiar jako wywoływalna funkcja | 4 |
| Odrzucenie dropu w siebie/potomka | 8 (przez istniejące `canDropInto`) |
| Sprzątanie komponentów, CSS, i18n | 9 |
| Weryfikacja w przeglądarce | 6, 7, 8, 10 |
