# BUG-195 — Scalenie narzędzi PAN i Select — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zastąpić dwa narzędzia manipulacji tokenami (PAN + Select) jednym, opartym na jednym stanie zaznaczenia, dostępnym dla MG i gracza.

**Architecture:** `editingLayer` przestaje przyjmować `null` — zawsze jest stringiem, domyślnie `'select'`. `selectedTokens: [{kind,id}]` zostaje jedynym stanem zaznaczenia; `activeTokenId` i `selectedImageId` znikają, a „token z rozsuniętym pierścieniem" to po prostu jedyny element zaznaczenia. Reguła kliknięcia i predykat chrome'u wyjeżdżają do czystych funkcji w `utils/`, żeby oba hosty tokenów (postać i obraz) czytały dokładnie tę samą logikę.

**Tech Stack:** React 18 (CRA), `@mui/icons-material@7.3.4`, i18next, Jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-13-BUG-195-merge-pan-select-design.md`

## Global Constraints

- Testy uruchamiasz **wyłącznie** przez `CI=true npm test -- --watchAll=false` z katalogu `warhammer-battle-helper-front/`. Pojedynczy plik: `--testPathPattern=<nazwa>`. Gołe `npx jest` **nie działa** — konfiguracją zarządza CRA.
- Baseline fail: `App.test.js` (axios ESM). **To nie jest regres.** Każdy inny fail jest.
- Ikony **wyłącznie** z `@mui/icons-material`. `ArrowSelectorToolIcon` **nie istnieje** w wersji 7.3.4 — nie próbuj go importować.
- Żadnych stringów w JSX — wszystko przez `t('klucz')`. Klucze angielskie, tłumaczenia równolegle w `src/locales/en/translation.json` i `src/locales/pl/translation.json`.
- Martwy kod usuwasz **w tej samej zmianie**, która go osierociła — nieużywane importy, klasy CSS, klucze i18n, propy. Nie zostawiaj „na potem".
- Zakres jest **wyłącznie frontendowy**. Żadnych zmian w `warhammer-battle-helper-backend/`.
- Po scaleniu `editingLayer === null` nie istnieje nigdzie w `src/`. Wartość `null` tego propa to błąd, nie stan domyślny.

---

### Task 1: Model trybu — `'select'` zamiast `null`

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/sceneModes.js:1-17,35-36`
- Modify: `warhammer-battle-helper-front/src/hooks/useFogTools.js:9`
- Test: `warhammer-battle-helper-front/src/components/scene/sceneModes.test.js`

**Interfaces:**
- Consumes: nic (pierwszy task).
- Produces: `SCENE_MODES` bez wpisu `null`, z pierwszym wpisem `{ value: 'select', Icon: NearMeIcon, labelKey: 'scenes.selectLayer' }` (bez `gmOnly`). `modesForRole(true)` → `['select','measure','fog','drawing']`, `modesForRole(false)` → `['select','measure','drawing']`. `modeLabelKey(x)` dla nieznanej wartości zwraca `'scenes.selectLayer'`. `useFogTools()` startuje z `editingLayer === 'select'`.

- [x] **Step 1: Przepisz testy trybów na nową listę**

Zastąp w `sceneModes.test.js` bloki `modesForRole`, `nextMode` i `modeLabelKey` (reszta pliku — `cycleNext`, `isModeCycleClick` — zostaje **bez zmian**):

```js
describe('modesForRole', () => {
  it('gives the GM every mode in toolbar order', () => {
    expect(modesForRole(true).map(m => m.value))
      .toEqual(['select', 'measure', 'fog', 'drawing']);
  });

  it('gives the player everything except the GM-only modes', () => {
    // Select is no longer gmOnly — it is the only manipulation tool, so the player needs it.
    expect(modesForRole(false).map(m => m.value))
      .toEqual(['select', 'measure', 'drawing']);
  });

  it('derives the GM list from SCENE_MODES rather than a hardcoded copy', () => {
    expect(modesForRole(true)).toHaveLength(SCENE_MODES.length);
  });

  it('has no null mode — there is always a tool selected', () => {
    expect(SCENE_MODES.map(m => m.value)).not.toContain(null);
  });
});

describe('nextMode', () => {
  it('walks the full GM cycle and wraps', () => {
    expect(nextMode('select', true)).toBe('measure');
    expect(nextMode('measure', true)).toBe('fog');
    expect(nextMode('fog', true)).toBe('drawing');
    expect(nextMode('drawing', true)).toBe('select');
  });

  it('walks the full player cycle and wraps', () => {
    expect(nextMode('select', false)).toBe('measure');
    expect(nextMode('measure', false)).toBe('drawing');
    expect(nextMode('drawing', false)).toBe('select');
  });

  it('resets a player stranded in a GM-only mode', () => {
    expect(nextMode('fog', false)).toBe('select');
  });
});

describe('modeLabelKey', () => {
  it('maps a mode value to its i18n key', () => {
    expect(modeLabelKey('select')).toBe('scenes.selectLayer');
    expect(modeLabelKey('fog')).toBe('scenes.fogLayer');
  });

  it('falls back to the default mode for an unknown value', () => {
    expect(modeLabelKey('nope')).toBe('scenes.selectLayer');
  });
});
```

- [x] **Step 2: Uruchom testy i potwierdź, że padają**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=sceneModes`
Expected: FAIL — `expect(received).toEqual(expected)`, otrzymane `[null, 'select', 'measure', 'fog', 'drawing']`.

- [x] **Step 3: Zmień listę trybów**

W `sceneModes.js` podmień importy ikon i listę:

```js
import NearMeIcon from '@mui/icons-material/NearMe';
import StraightenIcon from '@mui/icons-material/Straighten';
import CloudIcon from '@mui/icons-material/Cloud';
import EditIcon from '@mui/icons-material/Edit';

// Single source of truth for scene modes (`editingLayer`). Both the toolbar
// buttons and the middle-click cycle read this list, so adding a mode here is
// the only change a new mode needs — the button appears and the cycle picks it
// up with no other edits.
//
// There is no "no tool" mode: `editingLayer` is always one of these values. Select is the default
// and the only manipulation tool — it replaced the old Pan mode, whose job (dragging the map with
// the left button) moved to the right-button drag in useRightDragPan.
export const SCENE_MODES = [
  { value: 'select',  Icon: NearMeIcon,      labelKey: 'scenes.selectLayer'               },
  { value: 'measure', Icon: StraightenIcon,  labelKey: 'scenes.measureLayer'              },
  { value: 'fog',     Icon: CloudIcon,       labelKey: 'scenes.fogLayer',    gmOnly: true },
  { value: 'drawing', Icon: EditIcon,        labelKey: 'scenes.drawingLayer'              },
];
```

Usunięte importy: `PanToolIcon`, `HighlightAltIcon` — obie ikony nie są już używane w tym pliku.

Zmień też fallback w `modeLabelKey`:

```js
export const modeLabelKey = (value) =>
  SCENE_MODES.find(m => m.value === value)?.labelKey || 'scenes.selectLayer';
```

- [x] **Step 4: Ustaw domyślny tryb w stanie**

W `hooks/useFogTools.js` zmień dwie linie (`:9` i `:11`):

```js
  // editingLayer is never null — Select is the default tool (see sceneModes.js).
  const [editingLayer, setEditingLayer] = useState('select');
  const [fogCoverMode, setFogCoverMode] = useState(false);
  // Tokens is the armed layer at start: Select needs it armed to manipulate character tokens at
  // all, so any other default would leave the GM unable to move a token until they touched the
  // layer bar.
  const [imageEditLayer, setImageEditLayer] = useState('tokens');
```

- [x] **Step 5: Uruchom testy i potwierdź, że przechodzą**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=sceneModes`
Expected: PASS, wszystkie bloki.

- [x] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/sceneModes.js \
        warhammer-battle-helper-front/src/components/scene/sceneModes.test.js \
        warhammer-battle-helper-front/src/hooks/useFogTools.js
git commit -m "refactor: BUG-195 drop the null scene mode, Select becomes the default"
```

---

### Task 2: Czysta reguła kliknięcia w zaznaczenie

**Files:**
- Create: `warhammer-battle-helper-front/src/utils/tokenSelection.js`
- Test: `warhammer-battle-helper-front/src/utils/tokenSelection.test.js`

**Interfaces:**
- Consumes: nic.
- Produces: `nextSelection(prev, token, additive)` — `prev: Array<{kind:'char'|'image', id:string}>`, `token: {kind, id}`, `additive: boolean`, zwraca nową tablicę. Konsument: `toggleTokenSelected` w `DndContext.jsx` (Task 4).

- [x] **Step 1: Napisz test**

Utwórz `warhammer-battle-helper-front/src/utils/tokenSelection.test.js`:

```js
import { nextSelection } from './tokenSelection';

const a = { kind: 'char', id: 'a' };
const b = { kind: 'char', id: 'b' };
const img = { kind: 'image', id: 'a' }; // same id as `a`, different kind — must not be confused

describe('nextSelection — plain click', () => {
  it('selects a token when nothing is selected', () => {
    expect(nextSelection([], a, false)).toEqual([a]);
  });

  it('clears the selection when clicking the only selected token', () => {
    // This is how a ring gets collapsed without hunting for empty grid.
    expect(nextSelection([a], a, false)).toEqual([]);
  });

  it('narrows a group down to the clicked member', () => {
    expect(nextSelection([a, b], a, false)).toEqual([a]);
  });

  it('replaces the group with a token from outside it', () => {
    expect(nextSelection([a, b], { kind: 'char', id: 'c' }, false))
      .toEqual([{ kind: 'char', id: 'c' }]);
  });

  it('does not confuse an image with a character sharing its id', () => {
    expect(nextSelection([a], img, false)).toEqual([img]);
  });
});

describe('nextSelection — shift click', () => {
  it('adds a token to the selection', () => {
    expect(nextSelection([a], b, true)).toEqual([a, b]);
  });

  it('removes a token already in the selection', () => {
    expect(nextSelection([a, b], a, true)).toEqual([b]);
  });

  it('removes the last token, leaving an empty selection', () => {
    expect(nextSelection([a], a, true)).toEqual([]);
  });

  it('never collapses the selection the way a plain click does', () => {
    expect(nextSelection([a, b], b, true)).toEqual([a]);
  });
});

describe('nextSelection — purity', () => {
  it('does not mutate the previous selection', () => {
    const prev = [a, b];
    nextSelection(prev, a, false);
    expect(prev).toEqual([a, b]);
  });
});
```

- [x] **Step 2: Uruchom test i potwierdź, że pada**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=tokenSelection`
Expected: FAIL — `Cannot find module './tokenSelection'`.

- [x] **Step 3: Napisz implementację**

Utwórz `warhammer-battle-helper-front/src/utils/tokenSelection.js`:

```js
// The one rule for what a click does to the token selection. Pure, so both token hosts
// (MapCharacterToken, SceneImage) and the tests agree on it without touching React state.
//
// Selection is a list because a marquee picks many at once; a single click is just the
// one-element case. `kind` is part of the identity — an image and a character can carry the
// same id.
//
// A plain click on the ONLY selected token clears the selection: that is how the expanded ring
// gets collapsed without hunting for empty grid (the behaviour the old Pan tool had). On any
// other token it narrows to that one, which is what makes "click one of five" and "click a
// sixth" behave identically.
const keyOf = (t) => `${t.kind}:${t.id}`;

export function nextSelection(prev, token, additive) {
  const key = keyOf(token);
  const has = prev.some(t => keyOf(t) === key);
  if (additive) {
    return has ? prev.filter(t => keyOf(t) !== key) : [...prev, token];
  }
  if (has && prev.length === 1) return [];
  return [token];
}
```

- [x] **Step 4: Uruchom test i potwierdź, że przechodzi**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=tokenSelection`
Expected: PASS, 10 testów.

- [x] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/tokenSelection.js \
        warhammer-battle-helper-front/src/utils/tokenSelection.test.js
git commit -m "feat: BUG-195 add the single click-to-select rule as a pure function"
```

---

### Task 3: `canManipulateToken` — jedna gałąź zamiast trzech

**Files:**
- Modify: `warhammer-battle-helper-front/src/utils/tokenManipulation.js` (cały plik)
- Test: `warhammer-battle-helper-front/src/utils/tokenManipulation.test.js` (cały plik)

**Interfaces:**
- Consumes: `SCENE_MODES` z Taska 1 (wartości `editingLayer`).
- Produces: `canManipulateToken({ allowed, locked, editingLayer, imageEditLayer, selected })` → `boolean`. **Zmiana sygnatury:** parametry `activeTool`, `activeSelected`, `groupSelected` i `multiSelectActive` **znikają**; zastępuje je jeden `selected`, który znaczy „to jest jedyny zaznaczony token". Konsumenci (`MapCharacterToken.jsx:165`, `SceneImage.jsx:535`) aktualizowani w Tasku 5.

- [x] **Step 1: Przepisz test na nową sygnaturę**

Zastąp **całą** zawartość `utils/tokenManipulation.test.js`:

```js
import { canManipulateToken } from './tokenManipulation';

// Base: an unlocked token the user may edit, in the default tool, on the armed tokens layer,
// but not selected.
const base = {
  allowed: true,
  locked: false,
  editingLayer: 'select',
  imageEditLayer: 'tokens',
  selected: false,
};

describe('canManipulateToken', () => {
  it('shows handles for the lone selected token', () => {
    expect(canManipulateToken({ ...base, selected: true })).toBe(true);
  });

  it('hides handles when nothing is selected', () => {
    expect(canManipulateToken({ ...base })).toBe(false);
  });

  it('hides handles when another image layer is armed', () => {
    // Characters live on the tokens layer; with bg/gm armed they are backdrop for the marquee.
    expect(canManipulateToken({
      ...base, selected: true, imageEditLayer: 'background',
    })).toBe(false);
  });

  describe('gates that override everything', () => {
    it('hides handles without permission', () => {
      expect(canManipulateToken({ ...base, allowed: false, selected: true })).toBe(false);
    });

    it('hides handles on a locked token', () => {
      expect(canManipulateToken({ ...base, locked: true, selected: true })).toBe(false);
    });
  });

  describe('tool tabs that own the pointer', () => {
    it.each(['measure', 'fog', 'drawing'])('hides handles in %s mode', (layer) => {
      expect(canManipulateToken({ ...base, editingLayer: layer, selected: true })).toBe(false);
    });
  });

  describe('defaults', () => {
    it('denies everything when called with no arguments', () => {
      expect(canManipulateToken()).toBe(false);
    });
  });
});
```

- [x] **Step 2: Uruchom test i potwierdź, że pada**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=tokenManipulation`
Expected: FAIL — pierwszy przypadek zwraca `false`, bo stara implementacja czyta `groupSelected`, a nie `selected`.

- [x] **Step 3: Przepisz predykat**

Zastąp **całą** zawartość `utils/tokenManipulation.js`:

```js
// Decides whether a map token shows its manipulation chrome (resize handles + rotate handle).
// Shared by BOTH token kinds so the two hosts can never drift apart — this rule previously lived
// as two hand-synced inline conditions, one per tool, which is exactly how Select mode ended up
// without handles (BUG-195).
//
// `selected` means "this token is the ONLY one selected". Chrome belongs to a lone token:
// rotating a group would move each token's centre, which is a different operation (see the spec).
// The hosts derive it from the single selection state, so there is nothing left to keep in sync.
export function canManipulateToken({
  allowed = false,
  locked = false,
  editingLayer = 'select',
  imageEditLayer = 'tokens',
  selected = false,
} = {}) {
  if (!allowed || locked) return false;
  // measure / fog / drawing own the pointer — no manipulation chrome there.
  if (editingLayer !== 'select') return false;
  // Characters live on the tokens layer; with another layer armed they are marquee backdrop.
  return imageEditLayer === 'tokens' && selected;
}
```

- [x] **Step 4: Uruchom test i potwierdź, że przechodzi**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=tokenManipulation`
Expected: PASS, 9 testów.

- [x] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/tokenManipulation.js \
        warhammer-battle-helper-front/src/utils/tokenManipulation.test.js
git commit -m "refactor: BUG-195 collapse canManipulateToken to a single selection rule"
```

---

### Task 4: Jeden stan zaznaczenia w `DndContext`

Task bez testów jednostkowych — `DndContext.jsx` nie ma pokrycia i ten plan tego nie zmienia (patrz „Testy" w specu). Weryfikacja: pełny przebieg suite (nie może pojawić się nowy fail) plus ręczny przebieg na końcu Taska 8.

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/DndContext.jsx` — linie `94-99`, `104-119`, `152-190`, `295-299`, `340-357`, `373-383`, `385-388`, `1117`
- Modify: `warhammer-battle-helper-front/src/components/GameSession.jsx:1084`

**Interfaces:**
- Consumes: `nextSelection` z Taska 2.
- Produces: `SceneViewport` **przestaje** dostawać propy `activeTokenId`, `onSelectCharacter`, `selectedImageId`, `onSelectImage`. `onToggleTokenSelected(kind, id, additive)` zostaje jedyną drogą zaznaczania i niesie bramkę własności. `onBackgroundClick` czyści całe zaznaczenie.

- [x] **Step 1: Usuń oba stare stany i ich efekty**

W `DndContext.jsx` usuń deklaracje `activeTokenId` i `selectedImageId` (`:94-99`), zostawiając wyłącznie:

```js
  // The one selection state for map tokens: list of {kind:'image'|'char', id}. A one-element
  // selection is what used to be the "active token" — its ring expands and it shows manipulation
  // chrome. Local UI state, never persisted.
  const [selectedTokens, setSelectedTokens] = useState([]);
```

Usuń w całości trzy efekty, które obsługiwały tamte stany:
- `:104-112` — czyszczenie `selectedImageId` po usunięciu obrazu przez WS (zastępuje go istniejący efekt „Drop tokens that no longer exist", `:131-142`, który robi to samo dla obu rodzajów)
- `:114-119` — `if (!(editingLayer === null || activeTool === 'pan')) setSelectedImageId(null)`
- `:295-299` — czyszczenie `activeTokenId`, gdy postać zniknęła ze sceny (pokrywa go ten sam efekt `:131-142`)

- [x] **Step 2: Usuń osobny handler Delete dla obrazu i dodaj bramkę roli do grupowego**

Usuń w całości efekt `:152-168` (Delete dla `selectedImageId`).

W efekcie grupowym (`:170-191`) zmień pierwszą linię warunku:

```js
  // Delete / Backspace removes all selected tokens (images deleted, characters removed from grid).
  // Skips locked images. Ignored while typing.
  // GM only: Select is no longer a GM-only mode, so the mode check alone no longer gates this.
  useEffect(() => {
    if (!isGM || editingLayer !== 'select' || !selectedTokens.length) return;
```

Dopisz `isGM` do tablicy zależności tego efektu.

- [x] **Step 3: Zastąp oba handlery zaznaczania jednym, z bramką własności**

Usuń `handleSelectToken` (`:340-349`) i `handleSelectImage` (`:352-356`). Przenieś ich bramkę własności do `toggleTokenSelected` (`:373-383`), podmieniając całe ciało:

```js
  // Click / Shift-click on a token — the only way a token enters or leaves the selection.
  // nextSelection owns the rule; this only adds the ownership gate, which used to live in
  // handleSelectToken. FightArea screens this too — defense in depth, matching the existing
  // double-guard pattern.
  const toggleTokenSelected = useCallback((kind, id, additive) => {
    if (kind === 'char' && gameId && token && !isGM && !isOwnCharacter(id)) return;
    setSelectedTokens(prev => nextSelection(prev, { kind, id }, additive));
  }, [gameId, token, isGM, isOwnCharacter]);
```

Dodaj import na górze pliku, obok pozostałych importów z `utils/`:

```js
import { nextSelection } from '../utils/tokenSelection';
```

- [x] **Step 4: Przepnij czyszczenie zaznaczenia i propy**

Zamień `clearActiveToken` (`:385-388`) na:

```js
  // Clear the selection — fired when clicking anywhere on the map outside a token (background
  // image, empty grid).
  const clearSelection = useCallback(() => {
    setSelectedTokens([]);
  }, []);
```

W wywołaniu `<SceneViewport …>` (`:1117`) usuń cztery propy: `activeTokenId={activeTokenId}`, `onSelectCharacter={handleSelectToken}`, `selectedImageId={selectedImageId}`, `onSelectImage={handleSelectImage}`. Podmień `onBackgroundClick={clearActiveToken}` na `onBackgroundClick={clearSelection}`.

- [x] **Step 5: Przybij warstwę `tokens` dla gracza**

W `GameSession.jsx:1084` (przekazanie do `DragAndDropContext`):

```jsx
            // Players have no layer bar, and Select needs the tokens layer armed to touch a
            // character token at all — so their armed layer is fixed.
            imageEditLayer={isGM ? imageEditLayer : 'tokens'}
```

Użyj dokładnie tej formy komentarza. `{/* … */}` **między propami jest błędem składni** (`Unexpected token, expected "..."`); `//` w tym miejscu parsuje się poprawnie.

Uwaga: `GameSession.jsx:1127` przekazuje `imageEditLayer` do panelu MG — **zostaw bez zmian**.

- [x] **Step 6: Uruchom pełny suite**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: jedyny fail to `App.test.js` (axios ESM). Jeśli padnie cokolwiek innego — to regres tego taska.

- [x] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/DndContext.jsx \
        warhammer-battle-helper-front/src/components/GameSession.jsx
git commit -m "refactor: BUG-195 collapse the two token selection states into one"
```

---

### Task 5: Hosty tokenów czytają jeden stan

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/MapTokensLayer.jsx:8-18,37-38,61,75`
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneLayer.jsx:6,36-37`
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneImage.jsx:18,24-26,318-339,455,535-543`
- Modify: `warhammer-battle-helper-front/src/components/scene/MapCharacterToken.jsx:16,85-88,161-174,227-247,257`

**Interfaces:**
- Consumes: `canManipulateToken` z Taska 3 (nowa sygnatura), `isTokenSelected(kind, id)` i `multiSelectActive` (już przekazywane do obu warstw).
- Produces: `SceneImage` i `MapCharacterToken` **tracą** prop `selected` i `onSelectImage` / `onSelect` — wyliczają „jedyny zaznaczony" lokalnie z `multiSelected && !multiSelectActive`.

- [x] **Step 1: Przestań przekazywać stare propy z warstw**

W `MapTokensLayer.jsx` usuń z sygnatury `selectedImageId`, `onSelectImage`, `activeTokenId`, `onSelectCharacter`, a z renderowania `SceneImage` linie `selected={selectedImageId === item.data.id}` i `onSelectImage={onSelectImage}`, z `MapCharacterToken` linie `selected={activeTokenId === item.data.character.id}` i `onSelect={onSelectCharacter}`.

W `SceneLayer.jsx` usuń z sygnatury `selectedImageId`, `onSelectImage`, a z renderowania `SceneImage` linie `selected={selectedImageId === image.id}` i `onSelectImage={onSelectImage}`.

- [x] **Step 2: Wylicz „jedyny zaznaczony" w `SceneImage`**

W `SceneImage.jsx` usuń `selected = false` i `onSelectImage` z listy propów (`:18`) i dodaj tuż pod destrukturyzacją:

```js
  // The one-element selection is what used to be "the active image": its ring expands and it
  // shows manipulation chrome. Derived, never a separate prop — that split is what BUG-195 fixed.
  const selected = multiSelected && !multiSelectActive;
```

Uprość `canDragImage` (`:26`) — gałąź `tokens` w trybie PAN znika, bo warstwa `tokens` uzbrojona to już `isLayerArmed`:

```js
  const canDragImage = isGM && !image.locked && isLayerArmed;
```

- [x] **Step 3: Uprość kliknięcie i kursor w `SceneImage`**

Zastąp `handleClick` (`:318-339`) wersją bez gałęzi PAN:

```js
  const handleClick = useCallback((e) => {
    // The rotate handle stops propagation on mousedown, so the native click that follows a
    // rotation must not fall through to select/deselect logic.
    if (consumeJustFinished()) return;
    if (editingLayer !== 'select') return;
    if (!isGM || !onToggleSelect || image.locked) return;
    // Only the armed layer is selectable — a backdrop image on another layer (e.g. the background
    // map while editing tokens) is not a candidate, so let the press pass through to the marquee.
    if (image.layer !== imageEditLayer) return;
    e.stopPropagation();
    // A group drag ends with a native click too; if the pointer moved, this was a drag — skip the
    // toggle (else a multi-token drag would collapse the selection down to just this token).
    const press = groupPressRef.current;
    groupPressRef.current = null;
    if (press && Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) > 3) return;
    onToggleSelect('image', image.id, e.shiftKey);
  }, [isGM, editingLayer, onToggleSelect, image.locked, image.layer, image.id, imageEditLayer, consumeJustFinished]);
```

Uprość kursor (`:455`) — fallback `pointer` czytał `editingLayer === null`:

```js
            cursor: canDragImage ? (isDragging ? 'grabbing' : 'grab') : 'default',
```

Zaktualizuj wywołanie predykatu (`:535-543`):

```jsx
          {isToken && canManipulateToken({
            allowed: isGM,
            locked: image.locked,
            editingLayer,
            imageEditLayer,
            selected,
          }) && (
```

Usuń `activeTool` z listy propów `SceneImage` i z wszystkich tablic zależności w tym pliku — po tej zmianie nic go już nie czyta.

- [x] **Step 4: To samo w `MapCharacterToken`**

Usuń `selected = false` i `onSelect` z propów (`:16`), dodaj pod destrukturyzacją:

```js
  // See SceneImage: the lone selected token is the one with an expanded ring and chrome.
  const selected = multiSelected && !multiSelectActive;
```

W `handleMouseDown` zastąp wczesny return dla measure (`:87`) returnem dla każdego trybu poza Select — fog i drawing też nie mogą ciągnąć tokena, a ich warstwy i tak przechwytują wskaźnik:

```js
    // Only the Select tool manipulates tokens. measure lays out a ruler, fog and drawing own the
    // pointer through their own canvases.
    if (editingLayer !== 'select') return;
```

Blok `if (editingLayer === 'select') { … }` przestaje potrzebować warunku — rozpakuj go, zostawiając ciało bez zmian.

Zastąp cały `handleClick` (`:227-247`). Znika gałąź `measure` i końcowe `onSelect?.(character)`, a bramka roli zmienia się z `isGM` na własność — gracz musi móc zaznaczyć własny token:

```js
  const handleClick = (e) => {
    if (movedRef.current) return; // drag, not a click
    // The rotate handle stops propagation on mousedown, so the native click that follows a
    // rotation must not fall through to select/deselect logic.
    if (consumeJustFinished()) return;
    if (editingLayer !== 'select') return;
    // Ownership, not role: a player selects their own token, the GM selects any. DndContext
    // re-checks this (defense in depth, matching the existing double-guard pattern).
    if (!canDrag || !onToggleSelect) return;
    // Characters are only selectable when the tokens layer is armed (matching the marquee scope);
    // otherwise they're backdrop and the press falls through to the marquee.
    if (imageEditLayer !== 'tokens') return;
    e.stopPropagation();
    // A group drag ends with a native click too; if the pointer moved, this was a drag — skip the
    // toggle (else a multi-token drag would collapse the selection down to just this token).
    const press = groupPressRef.current;
    groupPressRef.current = null;
    if (press && Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) > 3) return;
    onToggleSelect('char', character.id, e.shiftKey);
  };
```

Zaktualizuj wywołanie predykatu (`:165-174`):

```js
  const showHandles = canManipulateToken({
    allowed: isGM || canDrag,
    locked: false, // character placements have no lock concept
    editingLayer,
    imageEditLayer,
    selected,
  });
```

Uprość `dragEnabledNow` (`:257`):

```js
  const dragEnabledNow = canDrag && editingLayer === 'select' && imageEditLayer === 'tokens';
```

Usuń `activeTool` z propów i zależności w tym pliku.

- [x] **Step 5: Uruchom pełny suite**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: jedyny fail to `App.test.js`.

- [x] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/MapTokensLayer.jsx \
        warhammer-battle-helper-front/src/components/scene/SceneLayer.jsx \
        warhammer-battle-helper-front/src/components/scene/SceneImage.jsx \
        warhammer-battle-helper-front/src/components/scene/MapCharacterToken.jsx
git commit -m "refactor: BUG-195 derive token chrome from the single selection state"
```

---

### Task 6: Usunięcie narzędzia `pan` z paska rysowania i mgły

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/DrawingToolbar.jsx:5,13,29-41`
- Modify: `warhammer-battle-helper-front/src/components/scene/DrawingLayer.jsx:345,468`
- Modify: `warhammer-battle-helper-front/src/components/scene/FogLayer.jsx:68-71`
- Test: `warhammer-battle-helper-front/src/components/scene/DrawingToolbar.smoke.test.jsx:8,74-84`

**Interfaces:**
- Consumes: `modesForRole` z Taska 1.
- Produces: `TOOLS` w `DrawingToolbar` bez wpisu `'pan'`; `activeTool` nigdy nie przyjmuje `'pan'`. Ikona narzędzia `'select'` to `AdsClickIcon`.

- [x] **Step 1: Popraw smoke test paska**

W `DrawingToolbar.smoke.test.jsx` zmień `editingLayer: null` na `editingLayer: 'select'` w `baseProps` (`:8`), popraw komentarz przy `activeMode` (`:64`) z „non-pan mode" na „non-default mode" i podmień dwa testy zakładek:

```js
  it('clicking the active tab returns to the default tool', () => {
    const calls = [];
    render(
      <DrawingToolbar
        {...baseProps}
        editingLayer="fog"
        onEditingLayerChange={v => calls.push(v)}
      />
    );
    fireEvent.click(screen.getByText('Fog of War').closest('button'));
    expect(calls).toEqual(['select']);
  });

  it('clicking an inactive tab selects it', () => {
    const calls = [];
    render(
      <DrawingToolbar
        {...baseProps}
        editingLayer="select"
        onEditingLayerChange={v => calls.push(v)}
      />
    );
    fireEvent.click(screen.getByText('Fog of War').closest('button'));
    expect(calls).toEqual(['fog']);
  });
```

W teście `hides GM-only modes from players` (`:56-62`) usuń asercję `expect(labels).not.toContain('Select tokens');` — Select przestał być GM-only. Zostaje asercja o `'Fog of War'`.

Dopisz nowy test, tuż za blokiem zakładek:

```js
describe('DrawingToolbar tools', () => {
  it('no longer offers a pan tool inside drawing mode', () => {
    const { container } = render(<DrawingToolbar {...baseProps} editingLayer="drawing" />);
    const labels = [...container.querySelectorAll('.drawing-toolbar__tool .drawing-toolbar__tooltip')]
      .map(el => el.textContent);
    expect(labels).not.toContain('Pan & move tokens');
  });

  it('no longer offers a pan tool inside fog mode', () => {
    const { container } = render(<DrawingToolbar {...baseProps} editingLayer="fog" />);
    const labels = [...container.querySelectorAll('.drawing-toolbar__tool .drawing-toolbar__tooltip')]
      .map(el => el.textContent);
    expect(labels).not.toContain('Pan & move tokens');
  });
});
```

- [x] **Step 2: Uruchom testy i potwierdź, że padają**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=DrawingToolbar`
Expected: FAIL — `expect(calls).toEqual(['select'])` dostaje `[null]`, a oba nowe testy znajdują `'Pan & move tokens'`.

- [x] **Step 3: Wytnij narzędzie i przenieś ikonę**

W `DrawingToolbar.jsx` usuń import `PanToolIcon` (`:5`), zamień import `NearMeIcon` (`:13`) na:

```js
import AdsClickIcon from '@mui/icons-material/AdsClick';
```

Usuń pierwszy wpis z `TOOLS` wraz z jego komentarzem (`:29-32`) i zmień ikonę narzędzia `select` (`:40`):

```js
  { value: 'select',   Icon: AdsClickIcon,             labelKey: 'scenes.drawingTool_select',   fogCompat: false },
```

`NearMeIcon` przechodzi na pasek trybów (Task 1), więc pasek narzędzi nie może go już używać — dwie identyczne strzałki obok siebie kłamałyby o tym, że robią to samo.

- [x] **Step 4: Usuń wyjątki na `pan` w warstwach**

W `DrawingLayer.jsx:345`:

```js
    if (!isDrawingMode) return;
```

W `DrawingLayer.jsx:468`:

```js
  const isInteractive = isDrawingMode;
```

W `FogLayer.jsx:68-71` — po usunięciu narzędzia warstwa mgły jest aktywna zawsze, gdy MG jest w trybie mgły, więc `isEditingFog` przestaje się różnić od `inFogMode`:

```js
  // The GM always sees fog that the scene has enabled; fog mode only adds visibility for
  // fog that is disabled.
  const inFogMode = isGM && editingLayer === 'fog';
```

Zastąp wszystkie wystąpienia `isEditingFog` w tym pliku przez `inFogMode` i usuń samą definicję. Sprawdź, że nic nie zostało: `grep -n "isEditingFog\|fogTool" src/components/scene/FogLayer.jsx` — jeśli `fogTool` nie ma już żadnego czytelnika, usuń go też z propów komponentu i z przekazania w `SceneViewport.jsx:885`.

- [x] **Step 5: Uruchom testy i potwierdź, że przechodzą**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern="DrawingToolbar|DrawingLayer|FogLayer"`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/DrawingToolbar.jsx \
        warhammer-battle-helper-front/src/components/scene/DrawingToolbar.smoke.test.jsx \
        warhammer-battle-helper-front/src/components/scene/DrawingLayer.jsx \
        warhammer-battle-helper-front/src/components/scene/FogLayer.jsx \
        warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx
git commit -m "refactor: BUG-195 remove the pan tool from the drawing and fog toolbars"
```

---

### Task 7: `SceneViewport` — koniec lewego pana i kursora `grab`

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx:288-289,313-345,~360-375,453,720`
- Modify: `warhammer-battle-helper-front/src/components/scene/SceneViewport.css:52-57`

**Interfaces:**
- Consumes: `isModeCycleClick`, `nextMode` z Taska 1; `isGM` (już prop).
- Produces: brak lewego pana; marquee wyłącznie dla MG.

- [x] **Step 1: Wytnij lewy pan z `handleViewportMouseDown`**

W `SceneViewport.jsx` zostaw w `handleViewportMouseDown` **wyłącznie** blok cyklu trybów (`:314-323`) i skasuj wszystko poniżej `return;` aż do `setIsPanning(true);` (`:331-345`), razem z komentarzem o schemacie `modern`. Handler kończy się na zamknięciu bloku `isModeCycleClick`.

Skasuj też efekt obsługujący ten drag (`panStartRef` w `handleMove`/`handleUp`, ok. `:364-380`) oraz samą deklarację `panStartRef`. Zostaw `panOffsetRef`, `setPanOffset` i `setIsPanning` — używa ich `useRightDragPan`.

Sprawdź, że nic nie zostało: `grep -n "panStartRef" src/components/scene/SceneViewport.jsx` ma nie zwrócić nic.

- [x] **Step 2: Usuń klasę `--grab`**

W `SceneViewport.jsx:720` uprość `className`:

```jsx
          className={`scene-viewport${controlScheme === 'classic' ? ' scene-viewport--classic' : ''}${isPanning ? ' scene-viewport--grabbing' : ''}`}
```

W `SceneViewport.css` skasuj regułę `.scene-viewport--grab` (`:52-57`) wraz z jej komentarzem. **Zostaw** `.scene-viewport--grabbing` (`:59-63`) — używa jej prawy drag przez `setIsPanning`.

To była przyczyna objawu 3: `cursor: grab !important` na każdym potomku `__sizer` poza `.token-overlay` zjadał `cursor: ns-resize` uchwytów.

- [x] **Step 3: Ogranicz marquee do MG**

W `handleContentMouseDown` (`:453`):

```js
    // Select mode: left-drag on empty content draws a marquee. GM only — a player's group drag
    // would need a server-side ownership check on the batch endpoint (out of scope, see the spec).
    if (editingLayer === 'select' && isGM) {
```

Dopisz `isGM` do tablicy zależności tego `useCallback`.

- [x] **Step 4: Posprzątaj martwe odwołania do `activeTool`**

`activeToolRef` (`:288-289`) istniał dla wyciętego warunku pana. Jeśli po Kroku 1 nikt go nie czyta (`grep -n "activeToolRef" src/components/scene/SceneViewport.jsx`), usuń ref i jego efekt. Prop `activeTool` zostaje — czytają go `DrawingLayer` i `FogLayer`.

- [x] **Step 5: Uruchom pełny suite**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: jedyny fail to `App.test.js`.

- [x] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/scene/SceneViewport.jsx \
        warhammer-battle-helper-front/src/components/scene/SceneViewport.css
git commit -m "fix: BUG-195 drop left-drag panning and the grab cursor that ate handle cursors"
```

---

### Task 8: i18n, sprzątanie i przebieg ręczny

**Files:**
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json:1038,1064,1068`
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json:1038,1064,1068`

**Interfaces:**
- Consumes: wszystko z Tasków 1-7.
- Produces: brak martwych kluczy; `scenes.selectLayer` opisuje oba działania narzędzia.

- [x] **Step 1: Zaktualizuj tłumaczenia**

`src/locales/en/translation.json` — usuń linie `"panLayer"` (`:1038`) i `"drawingTool_pan"` (`:1068`), zmień `"selectLayer"` (`:1064`):

```json
    "selectLayer": "Select / Move",
```

`src/locales/pl/translation.json` — usuń te same dwa klucze, zmień:

```json
    "selectLayer": "Zaznacz / Przesuń",
```

- [x] **Step 2: Sprawdź, że nic nie odwołuje się do usuniętych kluczy**

Run: `cd warhammer-battle-helper-front && grep -rn "panLayer\|drawingTool_pan" src/`
Expected: brak wyników.

- [x] **Step 3: Sprawdź, że `null` zniknął jako tryb i `pan` jako narzędzie**

Run:
```bash
cd warhammer-battle-helper-front
grep -rn "editingLayer === null\|editingLayer !== null\|editingLayer = null\|editingLayer: null\|editingLayer={null}" src/
grep -rn "activeTool === 'pan'\|activeTool !== 'pan'\|fogTool !== 'pan'" src/
```
Expected: brak wyników w obu. Każde trafienie to niedokończony task.

- [x] **Step 4: Uruchom pełny suite**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: jedyny fail to `App.test.js` (axios ESM). Zapisz liczbę przechodzących testów — to dowód na zakończenie.

- [ ] **Step 5: Przebieg ręczny**

Uruchom aplikację zgodnie ze zwyczajem repo (docker compose) i przejdź listę. Każdy punkt to osobne „działa / nie działa", nie ogólne wrażenie:

1. **MG, wejście do gry** — pasek trybów pokazuje 4 zakładki, strzałka aktywna. Klik w token postaci: pierścień się rozsuwa, widać sloty, ikony konfiguracji, oka i „zabity", plus 8 uchwytów i uchwyt rotacji.
2. **Objaw 3** — najedź na krawędź zaznaczonego tokena w schemacie `modern` **i** `classic`: kursor zmienia się na `ns-resize` / `ew-resize` / narożny w obu.
3. **Objaw 2** — przełącz pasek warstw na „Tło", przeciągnij i obróć obraz tła; to samo na warstwie MG.
4. **Zaznaczenie** — marquee po 3 tokenach: pierścienie zwinięte, PPM otwiera menu grupy. Klik w jeden z nich: zawęża do niego, pierścień się rozsuwa. Klik w niego ponownie: odznacza, pierścień się zwija.
5. **Pan mapy** — prawy drag przesuwa mapę w każdym z 4 trybów, w tym w mgle i rysowaniu. Lewy drag na pustym polu rysuje marquee, nie przesuwa mapy.
6. **Tryb rysowania** — brak przycisku „ręka" na pasku narzędzi; to samo w trybie mgły. Rysowanie i odsłanianie działają od pierwszego kliknięcia.
7. **Gracz** — widzi 3 zakładki, nie widzi paska warstw. Klika własny token: pierścień + uchwyty. Klika cudzy: nic. Lewy drag na pustym polu: nic (brak marquee).
8. **Środkowy klik** — cykluje tryby i wraca do strzałki po pełnym obiegu.

- [x] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/locales/en/translation.json \
        warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "i18n: BUG-195 retire the pan strings, rename the merged tool"
```

---

## Notatki dla wykonawcy

**Czego NIE robić:**

- Nie dodawaj spacji + drag jako zamiennika lewego pana. To świadomie odłożona decyzja (spec, „Znane ograniczenie").
- Nie ruszaj `warhammer-battle-helper-backend/`. Marquee dla gracza — wraz z poluzowaniem `BatchMoveSceneTokens` — jest poza zakresem.
- Nie dorabiaj testów renderujących do `SceneViewport`, `FogLayer`, `DrawingLayer`. Te komponenty nie mają pokrycia i ten plan tego nie zmienia.
- Nie zostawiaj `.scene-viewport--grab` „na wszelki wypadek". To jest przyczyna jednego z trzech zgłoszonych objawów.

**Pułapki z `CLAUDE.md`, które nadal obowiązują:**

- Prawy przycisk staje się jedyną drogą do przesuwania mapy, więc `useRightDragPan` robi się krytyczny. Nie dotykaj jego predykatu suppression — kolejność `contextmenu` różni się między macOS a Windows, a decyzje podejmuje się na własnościach zdarzenia, nigdy na fladze z innego zdarzenia.
- W jsdom `window.PointerEvent` nie istnieje, `getBoundingClientRect` zwraca zera, a `isTrusted` jest non-configurable. Jeśli mimo wszystko piszesz test dotykający wskaźnika, wzoruj się na `useTokenRotate.test.jsx` i `useRightDragPan.test.jsx`.
- Nowa zależność npm wymaga `--renew-anon-volumes` przy podnoszeniu kontenera. Ten plan żadnej nie dodaje.
