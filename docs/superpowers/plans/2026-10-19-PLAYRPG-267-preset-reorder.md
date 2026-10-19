# PLAYRPG-267 Preset Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GM zmienia kolejność predefiniowanych umiejętności (`skill_table.skills`), broni (`weapons_table.presetWeapons`) i wierszy (`data_table.presetRows`) przeciąganiem uchwytu; wzorzec DnD staje się wspólnym modułem.

**Architecture:** Nowy headless moduł `components/common/sortable/` (`SortableList` = DndContext+sensory+SortableContext+`reorderById`; `useSortableItem` = `useSortable` → `{rootProps, gripProps, isDragging}`; `DragGrip` = przycisk-uchwyt z `forwardRef`). Istniejące `AttrRowsEditor` i `TableColumnsEditor` przechodzą na moduł; `SkillOptionsEditor` i `TablePresetsEditor` dostają DnD przez ten sam moduł. Prop `sortedOnSheet` pokazuje adnotację, gdy arkusz i tak sortuje alfabetycznie.

**Tech Stack:** React, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (już w zależnościach), i18next, Jest/RTL (CRA).

**Spec:** `docs/superpowers/specs/PLAYRPG-267.md`

## Global Constraints

- Praca na `main`, bez worktree. Przed każdym commitem sprawdź gałąź w tym samym poleceniu: `git branch --show-current && git commit ...`.
- Komentarze w kodzie wyłącznie po angielsku.
- Żadnych stringów w JSX — tylko `t('klucz')`, klucze w `locales/en/translation.json` i `locales/pl/translation.json` równolegle.
- Ikony tylko z `@mui/icons-material`.
- Nowa zależność npm zabroniona (wymaga przebudowy wolumenu kontenera) — `lockToVerticalAxis` zostaje inline w `utils/sortableList.js`.
- `CSS.Translate`, nigdy `CSS.Transform` (skala deformuje elementy różnej wysokości).
- Tylko uchwyt startuje drag (`setActivatorNodeRef`); `PointerSensor` z `activationConstraint: { distance: 5 }` + `KeyboardSensor` z `sortableKeyboardCoordinates`.
- Modyfikator CSS deklaruj **po** klasie bazowej w `style.css` (inaczej martwy).
- Usuwaj martwy kod/CSS/testy w tej samej zmianie.
- Testy frontu: `CI=true npm test -- --watchAll=false --testPathPattern=<nazwa>` z `warhammer-battle-helper-front/`. Baseline fail: `App.test.js` (axios ESM) — nie regresja.
- Każdy commit kończy się liniami:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj
  ```

## File Structure

| Plik | Odpowiedzialność |
|---|---|
| Create `src/components/common/sortable/SortableList.jsx` | DndContext + sensory + SortableContext; `onReorder(next)` tylko przy realnej zmianie |
| Create `src/components/common/sortable/useSortableItem.js` | `useSortable` → propsy roota (ref + Translate) i uchwytu |
| Create `src/components/common/sortable/DragGrip.jsx` | przycisk-uchwyt `creator__drag-grip` z `forwardRef` |
| Create `src/components/common/sortable/SortableList.test.jsx` | logika `onDragEnd` |
| Create `src/components/common/sortable/useSortableItem.test.jsx` | translate-not-scale (przeniesiony z `TableColumnsEditor.dragScale.test.jsx`) |
| Delete `src/components/creator/TableColumnsEditor.dragScale.test.jsx` | zastąpiony testem hooka |
| Modify `src/components/creator/AttrRowsEditor.jsx` | migracja na moduł |
| Modify `src/components/creator/TableColumnsEditor.jsx` | migracja na moduł |
| Modify `src/components/creator/TemplateBuilder.jsx` | `SortableSkillRow` + DnD w `SkillOptionsEditor`; `sortedOnSheet` dla obu edytorów |
| Modify `src/components/creator/TablePresetsEditor.jsx` | `SortablePreset` + DnD + adnotacja |
| Create `src/components/creator/TablePresetsEditor.test.jsx` | uchwyty + adnotacja |
| Create `src/components/creator/TemplateBuilder.reorderHint.test.jsx` | okablowanie `sortedOnSheet` w `PropertyPanel` |
| Modify `src/components/creator/TemplateBuilder.skillDefault.test.jsx` | uchwyty + adnotacja `SkillOptionsEditor` |
| Modify `src/style.css` | offset wiersza dodawania, grupa start w pasku akcji presetu |
| Modify `src/locales/en/translation.json`, `src/locales/pl/translation.json` | nowe klucze + teksty tutorialu |

Wszystkie ścieżki `src/...` są względem `warhammer-battle-helper-front/`.

---

### Task 1: Wspólny moduł sortable

**Files:**
- Create: `warhammer-battle-helper-front/src/components/common/sortable/SortableList.jsx`
- Create: `warhammer-battle-helper-front/src/components/common/sortable/useSortableItem.js`
- Create: `warhammer-battle-helper-front/src/components/common/sortable/DragGrip.jsx`
- Test: `warhammer-battle-helper-front/src/components/common/sortable/SortableList.test.jsx`
- Test: `warhammer-battle-helper-front/src/components/common/sortable/useSortableItem.test.jsx`

**Interfaces:**
- Consumes: `reorderById(items, activeId, overId, idOf)`, `lockToVerticalAxis` z `src/utils/sortableList.js` (bez zmian).
- Produces:
  - `default export SortableList({ items: Array, idOf?: (item) => string = item => item.id, onReorder: (next: Array) => void, children })`
  - `default export useSortableItem(id: string) => { rootProps: { ref, style: { transform, transition } }, gripProps: { ref, ...attributes, ...listeners }, isDragging: boolean }`
  - `default export DragGrip` — `forwardRef`, props `{ label: string, ...gripProps }`, renderuje `<button type="button" className="creator__drag-grip" aria-label={label}>`

- [ ] **Step 1: Write the failing tests**

`src/components/common/sortable/SortableList.test.jsx`:

```jsx
import React from 'react';
import { render } from '@testing-library/react';
import SortableList from './SortableList';

// jsdom cannot run a real drag, so DndContext is replaced by a stub that hands its onDragEnd to
// the test, which then plays the event dnd-kit would fire on drop.
let mockDragEnd;
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ onDragEnd, children }) => { mockDragEnd = onDragEnd; return children; },
  };
});

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

const setup = (props = {}) => {
  const onReorder = jest.fn();
  render(<SortableList items={items} onReorder={onReorder} {...props}><div /></SortableList>);
  return onReorder;
};

test('a drop on another item reports the reordered list', () => {
  const onReorder = setup();
  mockDragEnd({ active: { id: 'a' }, over: { id: 'c' } });
  expect(onReorder).toHaveBeenCalledWith([{ id: 'b' }, { id: 'c' }, { id: 'a' }]);
});

// No move means no template save — the caller must not be woken up.
test('a drop outside the list or on itself reports nothing', () => {
  const onReorder = setup();
  mockDragEnd({ active: { id: 'a' }, over: null });
  mockDragEnd({ active: { id: 'b' }, over: { id: 'b' } });
  expect(onReorder).not.toHaveBeenCalled();
});

test('items are matched by the id idOf names', () => {
  const cols = [{ key: 'x' }, { key: 'y' }];
  const onReorder = jest.fn();
  render(<SortableList items={cols} idOf={c => c.key} onReorder={onReorder}><div /></SortableList>);
  mockDragEnd({ active: { id: 'y' }, over: { id: 'x' } });
  expect(onReorder).toHaveBeenCalledWith([{ key: 'y' }, { key: 'x' }]);
});
```

`src/components/common/sortable/useSortableItem.test.jsx`:

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import useSortableItem from './useSortableItem';
import DragGrip from './DragGrip';

// While an item is dragged over a neighbour of a different height, dnd-kit's sortable strategy
// reports a transform with scaleY ≠ 1 to morph the dragged item into the slot's size. Items in the
// creator's lists differ in height, so applying that scale squashed or stretched them mid-drag.
// Only the translation may reach the DOM. jsdom cannot run a real drag, so useSortable is stubbed
// to report exactly that mid-drag transform.
jest.mock('@dnd-kit/sortable', () => {
  const actual = jest.requireActual('@dnd-kit/sortable');
  return {
    ...actual,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      setActivatorNodeRef: () => {},
      transform: { x: 0, y: 24, scaleX: 1, scaleY: 0.4 },
      transition: undefined,
      isDragging: true,
    }),
  };
});

function Item() {
  const { rootProps, gripProps, isDragging } = useSortableItem('a');
  return (
    <div {...rootProps} data-testid="item" data-dragging={isDragging}>
      <DragGrip label="Move" {...gripProps} />
    </div>
  );
}

test('a dragged item moves but never changes size', () => {
  render(<Item />);
  const item = screen.getByTestId('item');
  expect(item.style.transform).toContain('translate3d(0px, 24px, 0)');
  expect(item.style.transform).not.toContain('scale');
  expect(item).toHaveAttribute('data-dragging', 'true');
});

test('the grip is a labelled non-submit button', () => {
  render(<Item />);
  const grip = screen.getByLabelText('Move');
  expect(grip.tagName).toBe('BUTTON');
  expect(grip).toHaveAttribute('type', 'button');
  expect(grip).toHaveClass('creator__drag-grip');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='common/sortable'`
Expected: FAIL — `Cannot find module './SortableList'` / `'./useSortableItem'`.

- [ ] **Step 3: Implement the module**

`src/components/common/sortable/useSortableItem.js`:

```js
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// useSortableItem wires one item of a SortableList. It is headless: the caller spreads rootProps
// on the node that moves and gripProps on the grip, wherever its layout puts it — in front of a
// row, in a card's head, in a card's action bar. Only the grip starts a drag, because the rest of
// an item is inputs and a whole-item drag would fight text selection. Class names stay with the
// caller; isDragging tells it when to lift the item.
export default function useSortableItem(id) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return {
    rootProps: {
      ref: setNodeRef,
      // Translate, not Transform: the sortable strategy also reports a scale that morphs the
      // dragged item into the size of the slot it hovers, which squashes or stretches items of
      // unequal height. Items only swap places; they never change size.
      style: { transform: CSS.Translate.toString(transform), transition },
    },
    gripProps: { ref: setActivatorNodeRef, ...attributes, ...listeners },
    isDragging,
  };
}
```

`src/components/common/sortable/DragGrip.jsx`:

```jsx
import React, { forwardRef } from 'react';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

// The grip that picks an item up. forwardRef carries useSortableItem's activator ref to the
// button: without it the ref is dropped silently and dnd-kit falls back to the whole item as the
// activator, so keyboard drops return focus to the item instead of the grip.
const DragGrip = forwardRef(function DragGrip({ label, ...rest }, ref) {
  return (
    <button type="button" ref={ref} className="creator__drag-grip" aria-label={label} {...rest}>
      <DragIndicatorIcon style={{ fontSize: 14 }} />
    </button>
  );
});

export default DragGrip;
```

`src/components/common/sortable/SortableList.jsx`:

```jsx
import React from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { reorderById, lockToVerticalAxis } from '../../../utils/sortableList';

// A vertical drag-to-reorder list. Children are the items, each wired with useSortableItem under
// the id idOf gives it. onReorder receives the whole reordered array — never indices — and only
// when something actually moved, so a drop in place never costs a template save.
export default function SortableList({ items, idOf = item => item.id, onReorder, children }) {
  // distance: a press on the grip that never moves 5px stays a click. The keyboard sensor lets
  // the grip be picked up with Space and moved with the arrow keys.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = ({ active, over }) => {
    const next = reorderById(items, active.id, over?.id, idOf);
    if (next !== items) onReorder(next);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[lockToVerticalAxis]} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(idOf)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}
```

Also update the header comment in `src/utils/sortableList.js` line 3 to name every user:

```js
// Helpers behind components/common/sortable (the creator's drag-to-reorder lists).
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='common/sortable|sortableList'`
Expected: PASS (5 new tests + existing `sortableList` tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git add warhammer-battle-helper-front/src/components/common/sortable warhammer-battle-helper-front/src/utils/sortableList.js && git branch --show-current && git commit -m "feat: PLAYRPG-267 shared sortable list module

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 2: Migracja `AttrRowsEditor` i `TableColumnsEditor`

Czysty refaktor: DOM, klasy i etykiety bez zmian; istniejące testy przechodzą bez edycji asercji.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/AttrRowsEditor.jsx`
- Modify: `warhammer-battle-helper-front/src/components/creator/TableColumnsEditor.jsx`
- Delete: `warhammer-battle-helper-front/src/components/creator/TableColumnsEditor.dragScale.test.jsx`

**Interfaces:**
- Consumes: `SortableList`, `useSortableItem`, `DragGrip` z Task 1.
- Produces: nic nowego (publiczne API obu edytorów bez zmian).

- [ ] **Step 1: Run the existing tests as the baseline**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='AttrRowsEditor|TableColumnsEditor|TemplateBuilder.attrTable|TemplateBuilder.weaponColumns'`
Expected: PASS. Zapisz liczbę testów.

- [ ] **Step 2: Migrate `AttrRowsEditor.jsx`**

Zastąp importy dnd-kit/ikony uchwytu/sortableList (linie 5–22) tym:

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { genId } from '../../utils/surrogateKeys';
import SortableList from '../common/sortable/SortableList';
import useSortableItem from '../common/sortable/useSortableItem';
import DragGrip from '../common/sortable/DragGrip';
```

Zastąp `SortableAttrRow` (komentarz od „One row of the editor” do końca funkcji):

```jsx
// One row of the editor. It is its own grid element (not a fragment of a shared grid) because the
// row moves as a single node under the drag transform.
function SortableAttrRow({ row, children, handleLabel }) {
  const { rootProps, gripProps, isDragging } = useSortableItem(row.id);
  return (
    <div {...rootProps} className={`creator__attr-rows-row${isDragging ? ' creator__drag-item--dragging' : ''}`}>
      <DragGrip label={handleLabel} {...gripProps} />
      {children}
    </div>
  );
}
```

W `AttrRowsEditor` usuń `sensors` i `handleDragEnd` (wraz z komentarzem „distance: …”), a blok `<DndContext …><SortableContext …> … </SortableContext></DndContext>` zamień na:

```jsx
          <SortableList items={list} onReorder={onChange}>
            {list.map((row, i) => (
              <SortableAttrRow key={row.id} row={row} handleLabel={aria('creator.attrRowsReorder', row)}>
                {/* the seven existing inputs/buttons, unchanged */}
              </SortableAttrRow>
            ))}
          </SortableList>
```

Zawartość `SortableAttrRow` (sześć inputów + przycisk usuwania) przenieś dosłownie, bez zmian.

- [ ] **Step 3: Migrate `TableColumnsEditor.jsx`**

Zastąp linie importów 6–14 (`DragIndicatorIcon`, dnd-kit, `CSS`, `sortableList`) tym:

```jsx
import SortableList from '../common/sortable/SortableList';
import useSortableItem from '../common/sortable/useSortableItem';
import DragGrip from '../common/sortable/DragGrip';
```

Zastąp `SortableColumn`:

```jsx
// One column card. The whole card moves under the drag transform; only the grip in its head starts
// a drag, because the rest of the card is inputs — the same rule as AttrRowsEditor's rows.
function SortableColumn({ id, gripLabel, head, children }) {
  const { rootProps, gripProps, isDragging } = useSortableItem(id);
  return (
    <div {...rootProps} className={`creator__table-col${isDragging ? ' creator__drag-item--dragging' : ''}`}>
      <div className="creator__table-col-head">
        <DragGrip label={gripLabel} {...gripProps} />
        {head}
      </div>
      {children}
    </div>
  );
}
```

W `TableColumnsEditor` usuń `sensors` i `handleDragEnd` (z komentarzem „distance: …”), a `<DndContext …><SortableContext …>` / zamknięcia zamień na:

```jsx
      <SortableList items={cols} idOf={c => c.key} onReorder={commit}>
        {cols.map((col, i) => (
          <SortableColumn
            /* existing props and children, unchanged */
          >
          </SortableColumn>
        ))}
      </SortableList>
```

`onReorder={commit}` — przeciąganie musi dalej iść przez `commit`, który wykrywa przekazanie roli kolumny umiejętności.

- [ ] **Step 4: Delete the moved test**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git rm warhammer-battle-helper-front/src/components/creator/TableColumnsEditor.dragScale.test.jsx
```

- [ ] **Step 5: Verify no leftovers and tests pass**

Run: `cd warhammer-battle-helper-front && grep -n "dnd-kit\|DragIndicator\|sortableList" src/components/creator/AttrRowsEditor.jsx src/components/creator/TableColumnsEditor.jsx`
Expected: brak wyników.

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='AttrRowsEditor|TableColumnsEditor|TemplateBuilder.attrTable|TemplateBuilder.weaponColumns|common/sortable'`
Expected: PASS; liczba testów = baseline − 1 (dragScale) + 5 (Task 1).

- [ ] **Step 6: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git add warhammer-battle-helper-front/src/components/creator/AttrRowsEditor.jsx warhammer-battle-helper-front/src/components/creator/TableColumnsEditor.jsx && git branch --show-current && git commit -m "refactor: PLAYRPG-267 move attr rows and table columns onto the sortable module

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 3: DnD predefiniowanych umiejętności (`SkillOptionsEditor`)

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (`SkillOptionsEditor` ~linia 248–330; użycie ~linia 882)
- Modify: `warhammer-battle-helper-front/src/style.css` (po `.creator__options-add`, ~linia 10839)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `.../pl/translation.json` (sekcja `creator`, obok `skillAddAria`)
- Test: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.skillDefault.test.jsx`
- Test: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.reorderHint.test.jsx` (create)

**Interfaces:**
- Consumes: `SortableList`, `useSortableItem`, `DragGrip` (Task 1).
- Produces: `SkillOptionsEditor` dostaje prop `sortedOnSheet?: boolean = false`. Klucze i18n `creator.skillReorder`, `creator.reorderSortedHint` (ten drugi używa też Task 4).

- [ ] **Step 1: Add i18n keys**

`locales/en/translation.json`, w `creator` zaraz po `"skillAddAria": "Add skill",`:

```json
    "skillReorder": "Move skill",
    "reorderSortedHint": "The sheet sorts this list alphabetically — the order set here applies once sorting is turned off.",
```

`locales/pl/translation.json`, zaraz po `"skillAddAria": "Dodaj umiejętność",`:

```json
    "skillReorder": "Przesuń umiejętność",
    "reorderSortedHint": "Karta sortuje tę listę alfabetycznie — ustawiona tu kolejność zadziała po wyłączeniu sortowania.",
```

- [ ] **Step 2: Write the failing tests**

Dopisz na końcu `TemplateBuilder.skillDefault.test.jsx`:

```jsx
describe('reordering', () => {
  const two = [
    { id: 'skill_a', label: 'Athletics', attr: '' },
    { id: 'skill_b', label: '', attr: '' },
  ];

  test('every skill has a labelled drag handle, the add row has none', () => {
    setup({ skills: two });
    expect(screen.getByLabelText(`${i18n.t('creator.skillReorder')} – Athletics`)).toBeInTheDocument();
    // An unnamed skill still gets a handle, labelled without the dash.
    expect(screen.getAllByLabelText(i18n.t('creator.skillReorder'))).toHaveLength(1);
  });

  test('the sorted-on-sheet hint shows only when the sheet sorts', () => {
    const { unmount } = render(<SkillOptionsEditor label="Skills" skills={two} onChange={() => {}} />);
    expect(screen.queryByText(i18n.t('creator.reorderSortedHint'))).not.toBeInTheDocument();
    unmount();
    render(<SkillOptionsEditor label="Skills" skills={two} onChange={() => {}} sortedOnSheet />);
    expect(screen.getByText(i18n.t('creator.reorderSortedHint'))).toBeInTheDocument();
  });
});
```

Utwórz `TemplateBuilder.reorderHint.test.jsx`:

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import { makeDefaultField, PropertyPanel } from './TemplateBuilder';

// Importing TemplateBuilder pulls in api/axios and, through the system registry, axios itself —
// the ESM import jest cannot parse. Mocking the instance is enough to load the module.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const t = i18n.t.bind(i18n);
const hint = () => screen.queryByText(t('creator.reorderSortedHint'));

const renderPanel = (field) => render(
  <PropertyPanel field={field} onChange={() => {}} onDelete={() => {}} numberFields={[]} numericFields={[]} sections={[]} />
);

test('a skill table sorted on the sheet tells the GM the order is set aside', () => {
  renderPanel({ ...makeDefaultField('skill_table', t), skills: [{ id: 'skill_a', label: 'A' }], sortAlphabetically: true });
  expect(hint()).toBeInTheDocument();
});

test('an unsorted skill table shows no hint', () => {
  renderPanel({ ...makeDefaultField('skill_table', t), skills: [{ id: 'skill_a', label: 'A' }] });
  expect(hint()).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='skillDefault|reorderHint'`
Expected: FAIL — brak etykiety „Move skill – Athletics” i brak tekstu adnotacji.

- [ ] **Step 4: Implement**

W `TemplateBuilder.jsx` dodaj importy obok pozostałych importów z `./` / `../`:

```jsx
import SortableList from '../common/sortable/SortableList';
import useSortableItem from '../common/sortable/useSortableItem';
import DragGrip from '../common/sortable/DragGrip';
```

Nad `export function SkillOptionsEditor` dodaj:

```jsx
// One skill row. The row moves under the drag transform; the grip in front of it is the only
// part that starts a drag, so the label and default inputs stay selectable.
function SortableSkillRow({ id, gripLabel, children }) {
  const { rootProps, gripProps, isDragging } = useSortableItem(id);
  return (
    <div {...rootProps} className={`creator__option-row${isDragging ? ' creator__drag-item--dragging' : ''}`}>
      <DragGrip label={gripLabel} {...gripProps} />
      {children}
    </div>
  );
}
```

Uzupełnij komentarz nad `SkillOptionsEditor` o jedno zdanie na końcu:

```jsx
// Rows are reordered by their grip; sortedOnSheet says the sheet sorts them alphabetically anyway,
// which the editor states rather than hiding the grips — the order is kept for when sorting is off.
```

Zmień sygnaturę:

```jsx
export function SkillOptionsEditor({ label, skills, onChange, assignAttrToSkill = false, numberFields = [], baseDerived = false, sortedOnSheet = false }) {
```

Zastąp blok `<div className="creator__options-list"> … </div>`:

```jsx
      <div className="creator__options-list">
        <SortableList items={list} onReorder={onChange}>
          {list.map((opt, i) => (
            <SortableSkillRow
              key={opt.id}
              id={opt.id}
              gripLabel={opt.label ? `${t('creator.skillReorder')} – ${opt.label}` : t('creator.skillReorder')}
            >
              {/* the existing label input, default input, attr select and delete button, unchanged */}
            </SortableSkillRow>
          ))}
        </SortableList>
      </div>
```

Zawartość dawnego `<div key={opt.id} className="creator__option-row">` (input label, input default, select attr, przycisk usuwania) przenieś dosłownie jako dzieci `SortableSkillRow`.

Wiersz dodawania: `<div className="creator__options-add">` → `<div className="creator__options-add creator__options-add--grip-offset">`.

Zaraz po zamknięciu wiersza dodawania (przed zamykającym `</div>` edytora):

```jsx
      {sortedOnSheet && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontStyle: 'italic' }}>
          {t('creator.reorderSortedHint')}
        </Typography>
      )}
```

W `PropertyPanel` (użycie `<SkillOptionsEditor` dla `skill_table`) dodaj prop:

```jsx
              sortedOnSheet={!!field.sortAlphabetically}
```

W `style.css` zaraz **po** regule `.creator__options-add { … }`:

```css
/* The grip in front of each sortable row has no counterpart in the add row; this offset (grip
   width + row gap) keeps the add row's inputs in line with the rows above. */
.creator__options-add--grip-offset {
    padding-left: 18px;
}

.creator__option-row > .creator__drag-grip {
    width: 14px;
    flex-shrink: 0;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='skillDefault|reorderHint|skillFlags|TemplateBuilder'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git add warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx warhammer-battle-helper-front/src/components/creator/TemplateBuilder.skillDefault.test.jsx warhammer-battle-helper-front/src/components/creator/TemplateBuilder.reorderHint.test.jsx warhammer-battle-helper-front/src/style.css warhammer-battle-helper-front/src/locales && git branch --show-current && git commit -m "feat: PLAYRPG-267 drag reorder of preset skills

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 4: DnD predefiniowanych broni i wierszy (`TablePresetsEditor`)

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TablePresetsEditor.jsx`
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (dwa użycia `<TablePresetsEditor`, ~linie 919 i 954)
- Modify: `warhammer-battle-helper-front/src/style.css` (po `.creator__table-preset-actions`, ~linia 10779)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `.../pl/translation.json` (obok `tablePresetAlwaysOn`)
- Test: `warhammer-battle-helper-front/src/components/creator/TablePresetsEditor.test.jsx` (create)
- Test: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.reorderHint.test.jsx`

**Interfaces:**
- Consumes: `SortableList`, `useSortableItem`, `DragGrip` (Task 1); klucz `creator.reorderSortedHint` (Task 3); `sortColumnKey(field)` z `src/systems/custom/rowTableLayout.js` (już importowany w `TemplateBuilder.jsx`).
- Produces: `TablePresetsEditor` dostaje prop `sortedOnSheet?: boolean = false`. Klucz `creator.tablePresetReorder` z interpolacją `{{n}}`.

- [ ] **Step 1: Add i18n key**

`en`, zaraz po `"tablePresetAlwaysOn": "Always on the sheet",`:

```json
    "tablePresetReorder": "Move preset {{n}}",
```

`pl`, zaraz po `"tablePresetAlwaysOn": "Zawsze na karcie",`:

```json
    "tablePresetReorder": "Przesuń pozycję {{n}}",
```

- [ ] **Step 2: Write the failing tests**

Utwórz `TablePresetsEditor.test.jsx`:

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import TablePresetsEditor from './TablePresetsEditor';

const columns = [{ key: 'c1', label: 'Name', type: 'text', options: [], optionsFromSkills: false }];
const presets = [
  { id: 'preset_a', cells: { c1: 'Sword' }, alwaysOn: false },
  { id: 'preset_b', cells: { c1: 'Axe' }, alwaysOn: true },
];
const labels = { title: 'Presets', hint: 'Hint', noColumns: 'No columns', add: 'Add' };

const renderEditor = (props = {}) =>
  render(<TablePresetsEditor columns={columns} presets={presets} onChange={() => {}} labels={labels} {...props} />);

test('every preset has a numbered drag handle', () => {
  renderEditor();
  expect(screen.getByLabelText(i18n.t('creator.tablePresetReorder', { n: 1 }))).toBeInTheDocument();
  expect(screen.getByLabelText(i18n.t('creator.tablePresetReorder', { n: 2 }))).toBeInTheDocument();
});

test('the sorted-on-sheet hint shows only when the sheet sorts', () => {
  const { unmount } = renderEditor();
  expect(screen.queryByText(i18n.t('creator.reorderSortedHint'))).not.toBeInTheDocument();
  unmount();
  renderEditor({ sortedOnSheet: true });
  expect(screen.getByText(i18n.t('creator.reorderSortedHint'))).toBeInTheDocument();
});
```

Jeśli test padnie na `SyntaxError: Cannot use import statement outside a module` z `axios`, dodaj na górze ten sam blok `jest.mock('axios', …)` co w `TemplateBuilder.reorderHint.test.jsx`.

Dopisz na końcu `TemplateBuilder.reorderHint.test.jsx`:

```jsx
const textCol = { key: 'c1', label: 'Name', type: 'text', options: [], optionsFromSkills: false };
const numberCol = { key: 'c2', label: 'Weight', type: 'number', options: [], optionsFromSkills: false };
const preset = { id: 'preset_a', cells: {}, alwaysOn: false };

test('a sorted data table with a text column shows the hint', () => {
  renderPanel({ ...makeDefaultField('data_table', t), columns: [textCol], presetRows: [preset], sortAlphabetically: true });
  expect(hint()).toBeInTheDocument();
});

// sortColumnKey finds no text column to sort by, so the sheet keeps the GM's order despite the
// flag — the hint would be false.
test('a sorted data table without a text column shows no hint', () => {
  renderPanel({ ...makeDefaultField('data_table', t), columns: [numberCol], presetRows: [preset], sortAlphabetically: true });
  expect(hint()).not.toBeInTheDocument();
});

test('a sorted weapons table shows the hint under its preset weapons', () => {
  renderPanel({ ...makeDefaultField('weapons_table', t), columns: [textCol], presetWeapons: [preset], sortAlphabetically: true });
  expect(hint()).toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='TablePresetsEditor|reorderHint'`
Expected: FAIL — brak uchwytów „Move preset 1” i adnotacji w tabelach.

- [ ] **Step 4: Implement**

W `TablePresetsEditor.jsx` dodaj importy:

```jsx
import SortableList from '../common/sortable/SortableList';
import useSortableItem from '../common/sortable/useSortableItem';
import DragGrip from '../common/sortable/DragGrip';
```

Nad `function TablePresetsEditor` dodaj:

```jsx
// One preset card. The whole card moves under the drag transform; the grip sits at the start of
// the action bar, next to the "always on" switch, so the card needs no extra head row.
function SortablePreset({ id, gripLabel, alwaysOn, remove, children }) {
  const { rootProps, gripProps, isDragging } = useSortableItem(id);
  return (
    <div {...rootProps} className={`creator__table-preset${isDragging ? ' creator__drag-item--dragging' : ''}`}>
      {children}
      <div className="creator__table-preset-actions">
        <div className="creator__table-preset-actions-start">
          <DragGrip label={gripLabel} {...gripProps} />
          {alwaysOn}
        </div>
        {remove}
      </div>
    </div>
  );
}
```

Dopisz do komentarza nad `TablePresetsEditor` zdanie:

```jsx
// Presets are reordered by their grip; sortedOnSheet says the sheet sorts the table anyway.
```

Sygnatura:

```jsx
function TablePresetsEditor({ columns, presets, onChange, skillOptions = [], icon, labels, renderPresetExtra = null, sortedOnSheet = false }) {
```

Zastąp zawartość gałęzi `else` (`<div className="creator__table-presets"> … </div>`):

```jsx
        <div className="creator__table-presets">
          <SortableList items={presets} onReorder={onChange}>
            {presets.map((preset, i) => (
              <SortablePreset
                key={preset.id}
                id={preset.id}
                gripLabel={t('creator.tablePresetReorder', { n: i + 1 })}
                alwaysOn={(
                  <FormControlLabel
                    control={<Switch size="small" checked={!!preset.alwaysOn} onChange={e => update(i, { alwaysOn: e.target.checked })} />}
                    label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem' }}>{t('creator.tablePresetAlwaysOn')}</Typography>}
                  />
                )}
                remove={(
                  <button className="creator__option-del" onClick={() => remove(i)} title={t('creator.sectionDelete')}>
                    <DeleteIcon style={{ fontSize: 14 }} />
                  </button>
                )}
              >
                <div className="creator__table-preset-fields">
                  {cols.map(c => (
                    <label key={c.key} className="creator__table-preset-field">
                      <span className="creator__table-preset-field-label">{c.label}</span>
                      <CellInput
                        column={c}
                        value={(preset.cells && preset.cells[c.key]) || ''}
                        skillOptions={skillOptions}
                        onChange={val => updateCell(i, c.key, val)}
                        classes={PRESET_INPUT_CLASSES}
                      />
                    </label>
                  ))}
                </div>

                {renderPresetExtra && renderPresetExtra(preset, patch => update(i, patch))}
              </SortablePreset>
            ))}
          </SortableList>
          <button className="creator__tree-add-root" onClick={add}>
            <AddIcon style={{ fontSize: 14 }} /> {labels.add}
          </button>
          {sortedOnSheet && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontStyle: 'italic' }}>
              {t('creator.reorderSortedHint')}
            </Typography>
          )}
        </div>
```

W `TemplateBuilder.jsx` do obu `<TablePresetsEditor` (bronie i `data_table`) dodaj prop:

```jsx
                sortedOnSheet={!!sortColumnKey(field)}
```

W `style.css` zaraz **po** regule `.creator__table-preset-actions { … }`:

```css
/* The actions bar spreads its two ends apart; the grip and the "always on" switch form the start
   so the switch stays next to the grip instead of drifting to the middle. */
.creator__table-preset-actions-start {
    display: flex;
    align-items: center;
    gap: 6px;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='TablePresetsEditor|reorderHint|TemplateBuilder|WeaponsTable|DataTable'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git add warhammer-battle-helper-front/src/components/creator/TablePresetsEditor.jsx warhammer-battle-helper-front/src/components/creator/TablePresetsEditor.test.jsx warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx warhammer-battle-helper-front/src/components/creator/TemplateBuilder.reorderHint.test.jsx warhammer-battle-helper-front/src/style.css warhammer-battle-helper-front/src/locales && git branch --show-current && git commit -m "feat: PLAYRPG-267 drag reorder of preset weapons and rows

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 5: Tutorial

**Files:**
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json` (`tutorial.creatorField.content.body`, ~linia 1167)
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json` (to samo, ~linia 1167)

**Interfaces:**
- Consumes: nic.
- Produces: nic (selektory i kroki bez zmian).

- [ ] **Step 1: Update texts**

`en`, w `tutorial.creatorField.content.body` zamień trzy wartości:

```json
          "skill_table": "The skills on the list with an optional starting value, optionally linked to an attribute, and whether players may add their own. Drag the grip to set their order.",
          "weapons_table": "The columns (one may supply the attack skill), the damage formula and the preset weapons the GM provides. Drag the grip to reorder columns and presets.",
          "data_table": "The columns — including long text shown in an expandable row — and preset rows, always on the sheet or offered as a list. Drag the grip to reorder columns and presets."
```

`pl`:

```json
          "skill_table": "Umiejętności na liście z opcjonalną wartością startową, opcjonalnie powiązane z atrybutem, oraz to, czy gracze mogą dodawać własne. Kolejność ustawisz, przeciągając uchwyt.",
          "weapons_table": "Kolumny (jedna może wskazywać umiejętność ataku), formuła obrażeń i predefiniowane bronie od MG. Kolumny i predefiniowane pozycje ułożysz, przeciągając uchwyt.",
          "data_table": "Kolumny — także długi tekst pokazywany w rozwijanym wierszu — oraz predefiniowane wiersze, zawsze na karcie albo jako lista do wyboru. Kolumny i predefiniowane pozycje ułożysz, przeciągając uchwyt."
```

- [ ] **Step 2: Verify JSON and tour tests**

Run: `cd warhammer-battle-helper-front && node -e "JSON.parse(require('fs').readFileSync('src/locales/en/translation.json'));JSON.parse(require('fs').readFileSync('src/locales/pl/translation.json'));console.log('ok')" && CI=true npm test -- --watchAll=false --testPathPattern='tourTranslations|creatorTour'`
Expected: `ok`, PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git add warhammer-battle-helper-front/src/locales && git branch --show-current && git commit -m "docs: PLAYRPG-267 creator tutorial mentions drag reorder

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 6: Pełna weryfikacja

**Files:** brak zmian (chyba że weryfikacja coś wykaże).

- [ ] **Step 1: i18n parity**

Uruchom skill `i18n-sync` (część mechaniczna — diff kluczy en/pl). Expected: brak rozjazdów dla `skillReorder`, `tablePresetReorder`, `reorderSortedHint`.

- [ ] **Step 2: Full frontend suite + lint**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: wszystko PASS poza baseline `App.test.js` (axios ESM).

Run: `cd warhammer-battle-helper-front && npx eslint src/components/common/sortable src/components/creator/AttrRowsEditor.jsx src/components/creator/TableColumnsEditor.jsx src/components/creator/TablePresetsEditor.jsx src/components/creator/TemplateBuilder.jsx`
Expected: brak błędów.

- [ ] **Step 3: Dead code check**

Run: `cd warhammer-battle-helper-front && grep -n "useSortable\b\|CSS.Translate\|SortableContext" src/components/creator/AttrRowsEditor.jsx src/components/creator/TableColumnsEditor.jsx src/components/creator/TablePresetsEditor.jsx src/components/creator/TemplateBuilder.jsx`
Expected: brak wyników. (`DiceConfigBuilder.jsx` — poziomy sortable kostek z własnym wyglądem przeciągania — i drag sekcji w `TemplateBuilder.jsx` przez `useDraggable` są poza zakresem i zostają.)

- [ ] **Step 4: Manual browser check (user)**

W kreatorze przeciągnąć: umiejętność w `skill_table`, broń w `weapons_table`, wiersz w `data_table`, kolumnę tabeli, wiersz `attr_table`. Sprawdzić kolejność na arkuszu gracza przy wyłączonym sortowaniu; przy włączonym — adnotację w kreatorze. Sprawdzić wyrównanie wiersza dodawania umiejętności z wierszami powyżej.
