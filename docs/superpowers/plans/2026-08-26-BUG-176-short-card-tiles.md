# BUG-176 — Skrócona karta postaci (custom): kafelki wg flagi i grupowanie po sekcjach

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skrócona karta postaci systemu custom pokazuje dokładnie te pola, którym GM zaznaczył `showOnShortCard`, bez limitu 6, pogrupowane po sekcjach szablonu.

**Architecture:** Zmiana wyłącznie frontowa. `systems/custom/CharacterDetails.jsx` przestaje filtrować pola po `type === 'attr' && rollable` i przestaje ciąć listę do 6 — zamiast tego mapuje sekcje szablonu na grupy pól z flagą (`attr`, `number`, `progress`). Każda sekcja to jedna siatka CSS grid; pasek `progress` rozpina się na całą jej szerokość, więc kolejność pól z szablonu zostaje zachowana bez dzielenia sekcji na pod-bloki. Kreator traci przełącznik flagi na typach, których karta i tak nie renderuje.

**Tech Stack:** React 18 (CRA), `@testing-library/react` + Jest (`react-scripts test`), i18next, globalny `style.css` w konwencji BEM.

Spec: `docs/superpowers/specs/2026-08-26-BUG-176-short-card-tiles-design.md`

## Global Constraints

- Backend bez zmian — `ShowOnShortCard` już jest w `internal/models/SystemTemplate.go:178` i leci w JSON.
- Typy pól kwalifikujące się na skróconą kartę: **wyłącznie** `attr`, `number`, `progress`. `skill_table` / `skill_tree` nigdy.
- O widoczności kafelka decyduje **wyłącznie** `field.showOnShortCard === true`. Nie ma limitu ilościowego i nie ma zależności od `field.rollable`.
- Brak backward compat (zasada z `CLAUDE.md`) — paski progress w istniejących szablonach znikną z panelu, dopóki GM nie zaznaczy im flagi. To zaakceptowany koszt, żadnej migracji.
- Żadnych nowych kluczy i18n. Wszystkie stringi w kodzie i tak przez `t('klucz')`.
- Ikony wyłącznie z `@mui/icons-material` (tu: istniejący `CasinoIcon`).
- Kolory zgodne z paletą jasnej karty z `CLAUDE.md`: linia separatora `rgba(201, 151, 91, 0.4)`.
- Nieużywany kod usuwamy w tej samej zmianie, nie zostawiamy martwych klas CSS.
- Znana bazowa awaria pakietu frontowego: `App.test.js` wywala się na ESM w axios. To nie jest regresja.

---

### Task 1: Skrócona karta renderuje pola z flagą, pogrupowane po sekcjach

**Files:**
- Test: `warhammer-battle-helper-front/src/systems/custom/CharacterDetails.shortCard.test.jsx` (create)
- Modify: `warhammer-battle-helper-front/src/systems/custom/CharacterDetails.jsx` (wybór pól: linie 168–170; render: bloki „Progress fields" i „Rollable number attributes")
- Modify: `warhammer-battle-helper-front/src/style.css` (bloki `.custom-character-details__resources` ok. 7311 i `.custom-character-details__attrs` ok. 7375)

**Interfaces:**
- Consumes: `game.customSystemTemplate.sections[]` — `{ id, title, columns, fields[] }`; `FieldDef` z polami `key`, `type`, `label`, `abbr`, `showOnShortCard`, `rollable`. Stats postaci: `stats.attributes[key] = { base, advances, current }`, `stats.numbers[key] = <int>`, `stats.progress[key] = { current, max }`.
- Produces: klasa CSS `custom-character-details__section` — wrapper jednej grupy kafelków; znikają `custom-character-details__resources` i `custom-character-details__attrs`. Klasy `__attr`, `__attr-abbr`, `__attr-val`, `__roll-btn`, `__resource`, `__resource-*` zostają bez zmian nazw.

- [ ] **Step 1: Napisz plik testowy z padającymi testami**

Utwórz `warhammer-battle-helper-front/src/systems/custom/CharacterDetails.shortCard.test.jsx`:

```jsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import '../../i18n';

// src/api/axios.js ciągnie axios (ESM-only), którego CRA nie transformuje w jest — bez tego
// mocka test wywala się na `import` zanim cokolwiek się wyrenderuje.
jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: {},
  getApiUrl: () => 'http://test',
  getApiHeaders: (h = {}) => h,
}));

import CustomCharacterDetails from './CharacterDetails';

// Etykieta = klucz wielkimi literami, więc test czyta z DOM-u dokładnie to, co wstawił.
const attr = (key, extra = {}) => ({
  key,
  type: 'attr',
  label: key.toUpperCase(),
  showOnShortCard: true,
  rollable: false,
  ...extra,
});

function renderCard(sections, stats = {}, props = {}) {
  return render(
    <CustomCharacterDetails
      character={{ id: 'c1', name: 'Bohater', stats }}
      onCharacterUpdate={() => {}}
      game={{ customSystemTemplate: { sections } }}
      {...props}
    />
  );
}

describe('CustomCharacterDetails short card', () => {
  it('renders every flagged field instead of stopping at six', () => {
    const fields = Array.from({ length: 8 }, (_, i) => attr(`a${i}`));
    const { container } = renderCard([{ id: 's1', fields }]);

    expect(container.querySelectorAll('.custom-character-details__attr').length).toBe(8);
  });

  it('leaves out a rollable field that the GM did not flag for the short card', () => {
    const { container } = renderCard([{ id: 's1', fields: [
      attr('shown'),
      attr('hidden', { showOnShortCard: false, rollable: true }),
    ] }]);

    const abbrs = [...container.querySelectorAll('.custom-character-details__attr-abbr')];
    expect(abbrs.map(el => el.textContent)).toEqual(['SHOWN']);
  });

  it('groups tiles into one block per template section, in template order', () => {
    const { container } = renderCard([
      { id: 's1', fields: [attr('a'), attr('b'), attr('c')] },
      { id: 's2', fields: [attr('d'), attr('e'), attr('f'), attr('g')] },
    ]);

    const sections = [...container.querySelectorAll('.custom-character-details__section')];
    expect(sections.map(s => s.querySelectorAll('.custom-character-details__attr').length)).toEqual([3, 4]);
  });

  it('skips a section whose fields are all unflagged', () => {
    const { container } = renderCard([
      { id: 's1', fields: [attr('a')] },
      { id: 's2', fields: [attr('b', { showOnShortCard: false })] },
    ]);

    expect(container.querySelectorAll('.custom-character-details__section').length).toBe(1);
  });

  it('shows the dice button only on rollable fields and opens the modifier modal', () => {
    const { container } = renderCard([{ id: 's1', fields: [
      attr('plain'),
      attr('rolls', { rollable: true }),
    ] }]);

    const tiles = [...container.querySelectorAll('.custom-character-details__attr')];
    expect(tiles[0].querySelector('.custom-character-details__roll-btn')).toBeNull();

    fireEvent.click(tiles[1].querySelector('.custom-character-details__roll-btn'));
    expect(container.querySelector('.custom-roll-overlay')).not.toBeNull();
  });

  it('reads an attribute tile from current and a number tile from stats.numbers', () => {
    const { container } = renderCard(
      [{ id: 's1', fields: [
        attr('str'),
        { key: 'gold', type: 'number', label: 'GOLD', showOnShortCard: true },
      ] }],
      { attributes: { str: { base: 3, advances: 2, current: 5 } }, numbers: { gold: 42 } }
    );

    const vals = [...container.querySelectorAll('.custom-character-details__attr-val')];
    expect(vals.map(el => el.textContent)).toEqual(['5', '42']);
  });

  it('renders a flagged progress field inside its own section and saves the bumped value', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    const onCharacterUpdate = jest.fn();

    const { container } = renderCard(
      [{ id: 's1', fields: [
        attr('str'),
        { key: 'hp', type: 'progress', label: 'HP', showOnShortCard: true },
      ] }],
      { progress: { hp: { current: 3, max: 10 } } },
      { onCharacterUpdate, gameId: 'g1', token: 'tok' }
    );

    const section = container.querySelector('.custom-character-details__section');
    const resource = section.querySelector('.custom-character-details__resource');
    expect(resource).not.toBeNull();

    const plus = resource.querySelectorAll('.custom-character-details__resource-btn')[1];
    fireEvent.click(plus);

    expect(onCharacterUpdate).toHaveBeenCalledWith(expect.objectContaining({
      stats: expect.objectContaining({ progress: { hp: { current: 4, max: 10 } } }),
    }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      'http://test/games/g1/characters/c1',
      expect.objectContaining({ method: 'PUT' })
    ));
  });
});
```

- [ ] **Step 2: Uruchom testy i potwierdź, że padają**

```bash
cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern "CharacterDetails.shortCard"
```

Oczekiwane: FAIL. Pierwszy test dostaje 0 kafelków zamiast 8 (żadne pole nie jest `rollable`, a stary kod filtruje po `rollable`), test sekcji nie znajduje ani jednego `.custom-character-details__section`.

- [ ] **Step 3: Podmień wybór pól w komponencie**

W `warhammer-battle-helper-front/src/systems/custom/CharacterDetails.jsx` dodaj stałą tuż pod importami (nad `function CustomCharacterDetails`):

```js
// Typy pól, które mają sens jako pojedynczy kafelek na skróconej karcie. skill_table i skill_tree
// to kolekcje — trafiają na kartę wyłącznie przez gwiazdki (stats.favoriteSkills).
const SHORT_CARD_TYPES = ['attr', 'number', 'progress'];
```

Zamień trzy linie (obecnie 168–170):

```js
  const allFields = template?.sections?.flatMap(s => s.fields || []) || [];
  const rollableFields = allFields.filter(f => f.type === 'attr' && f.rollable);
  const progressFields = allFields.filter(f => f.type === 'progress');
```

na:

```js
  // O zawartości skróconej karty decyduje wyłącznie flaga showOnShortCard z kreatora (BUG-176).
  // Sekcje bez ani jednego zaznaczonego pola odpadają, żeby nie zostawić pustej grupy z separatorem.
  const shortCardSections = useMemo(() => (template?.sections || [])
    .map(s => ({
      id: s.id,
      fields: (s.fields || []).filter(f => f.showOnShortCard && SHORT_CARD_TYPES.includes(f.type)),
    }))
    .filter(s => s.fields.length > 0), [template]);
```

Dodaj też odczyt pól typu `number` obok istniejących `attributes` / `progress` (ok. linia 26):

```js
  const numbers    = stats.numbers    || {};
```

- [ ] **Step 4: Podmień render**

W tym samym pliku dodaj dwa helpery zaraz po `handleProgressDelta`, a przed `shortCardSections`:

```js
  const renderProgress = (field) => {
    const val = progress[field.key] || { current: 0, max: 0 };
    return (
      <div key={field.key} className="custom-character-details__resource">
        <span className="custom-character-details__resource-label">
          {field.abbr || field.label}
        </span>
        <div className="custom-character-details__resource-track">
          <button
            className="custom-character-details__resource-btn"
            onClick={() => handleProgressDelta(field.key, -1)}
          >−</button>
          <span className="custom-character-details__resource-val">
            {val.current}<span className="custom-character-details__resource-max">/{val.max}</span>
          </span>
          <button
            className="custom-character-details__resource-btn"
            onClick={() => handleProgressDelta(field.key, +1)}
          >+</button>
        </div>
      </div>
    );
  };

  const renderTile = (field) => {
    // Backend zawsze wylicza current = base + advances; base to zapasowa ścieżka dla postaci,
    // dla której ComputeDerived jeszcze nie przebiegło.
    const value = field.type === 'number'
      ? (numbers[field.key] ?? 0)
      : (attributes[field.key]?.current ?? attributes[field.key]?.base ?? 0);
    return (
      <div key={field.key} className="custom-character-details__attr">
        <span className="custom-character-details__attr-abbr">
          {field.abbr || field.label}
        </span>
        <span className="custom-character-details__attr-val">{value}</span>
        {field.rollable && (
          <button
            className="custom-character-details__roll-btn"
            onClick={() => setRollModal({ skillKey: field.key, label: field.label })}
          >
            <CasinoIcon style={{ fontSize: 14 }} />
          </button>
        )}
      </div>
    );
  };
```

Usuń w JSX oba dotychczasowe bloki — `{/* Progress fields (HP, MP, …) */}` z całym `custom-character-details__resources` oraz `{/* Rollable number attributes (max 6 in compact panel) */}` z całym `custom-character-details__attrs` — i wstaw w ich miejsce (zaraz pod `<CharacterHeader … />`):

```jsx
      {/* Pola zaznaczone w kreatorze, pogrupowane po sekcjach szablonu (BUG-176) */}
      {shortCardSections.map(section => (
        <div key={section.id} className="custom-character-details__section">
          {section.fields.map(field => (
            field.type === 'progress' ? renderProgress(field) : renderTile(field)
          ))}
        </div>
      ))}
```

Bloki ulubionych skilli i broni oraz overlay modyfikatora zostają bez zmian.

- [ ] **Step 5: Uruchom testy i potwierdź, że przechodzą**

```bash
cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern "CharacterDetails.shortCard"
```

Oczekiwane: PASS, 7 testów.

- [ ] **Step 6: Podmień CSS**

W `warhammer-battle-helper-front/src/style.css` usuń cały blok:

```css
.custom-character-details__resources {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(201, 151, 91, 0.4);
}
```

i cały blok:

```css
.custom-character-details__attrs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    padding: 8px;
}
```

W miejsce pierwszego z nich wstaw:

```css
.custom-character-details__section {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    padding: 8px;
}

/* Linia tylko MIĘDZY grupami — nigdy nad pierwszą ani pod ostatnią. */
.custom-character-details__section + .custom-character-details__section {
    border-top: 1px solid rgba(201, 151, 91, 0.4);
}
```

Do istniejącego bloku `.custom-character-details__resource` dopisz jedną deklarację, żeby pasek rozpinał się na całą szerokość siatki i nie łamał kolejności pól:

```css
.custom-character-details__resource {
    display: flex;
    align-items: center;
    gap: 8px;
    grid-column: 1 / -1;
}
```

- [ ] **Step 7: Potwierdź, że po usunięciu klas nic ich nie szuka**

```bash
cd warhammer-battle-helper-front && grep -rn "custom-character-details__resources\|custom-character-details__attrs" src/
```

Oczekiwane: brak wyników (exit 1).

- [ ] **Step 8: Uruchom cały pakiet frontowy**

```bash
cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern "systems/custom"
```

Oczekiwane: PASS we wszystkich plikach `systems/custom` (m.in. `CharacterDetails.favorites.test.jsx`, `CustomSheetBody.smoke.test.jsx`).

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/CharacterDetails.jsx \
        warhammer-battle-helper-front/src/systems/custom/CharacterDetails.shortCard.test.jsx \
        warhammer-battle-helper-front/src/style.css
git commit -m "fix(front): BUG-176 short card renders every flagged field, grouped by section

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Kreator przestaje oferować flagę na polach skillowych

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:131`, `:133`, `:630`

**Interfaces:**
- Consumes: `SHORT_CARD_TYPES` z Task 1 jako źródło prawdy o tym, które typy karta renderuje (`attr`, `number`, `progress`) — tu powtórzone jako warunek JSX, bez importu (kreator nie zależy od modułów systemu custom).
- Produces: nic dla dalszych zadań.

Kreator nie ma testów jednostkowych, więc weryfikacja jest przez grep i ręczne kliknięcie.

- [ ] **Step 1: Usuń flagę z fabryk pól skillowych**

W `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` linia 131, zamień:

```js
  if (type === 'skill_table') return { ...base, skills: [], rollable: true, showOnShortCard: false, assignAttrToSkill: false, hasAdvances: false, advancesLabel: 'Rozwinięcie' };
```

na:

```js
  if (type === 'skill_table') return { ...base, skills: [], rollable: true, assignAttrToSkill: false, hasAdvances: false, advancesLabel: 'Rozwinięcie' };
```

Linia 133, zamień:

```js
  if (type === 'skill_tree') return { ...base, tree: { key: genId('tree'), label: 'Kategoria', children: [] }, showOnShortCard: false, playerCanAddSkills: false, assignAttrToSkill: false };
```

na:

```js
  if (type === 'skill_tree') return { ...base, tree: { key: genId('tree'), label: 'Kategoria', children: [] }, playerCanAddSkills: false, assignAttrToSkill: false };
```

- [ ] **Step 2: Zawęź warunek przełącznika**

Linia 630, zamień:

```jsx
      {(field.type === 'attr' || field.type === 'number' || field.type === 'progress' || field.type === 'skill_table' || field.type === 'skill_tree') && (
        <FormControlLabel
          control={<Switch checked={!!field.showOnShortCard} onChange={e => up({ showOnShortCard: e.target.checked })} size="small" />}
```

na:

```jsx
      {/* Skróconą kartę renderują tylko te trzy typy (BUG-176) — skill_table i skill_tree trafiają
          tam wyłącznie przez gwiazdki gracza, więc flaga byłaby na nich martwa. */}
      {(field.type === 'attr' || field.type === 'number' || field.type === 'progress') && (
        <FormControlLabel
          control={<Switch checked={!!field.showOnShortCard} onChange={e => up({ showOnShortCard: e.target.checked })} size="small" />}
```

Uwaga: przełącznik `abbr` w bloku bezpośrednio powyżej (linia 622) ma identyczny warunek pięciu typów — **jego nie ruszamy**, skrót nadal ma sens na tabeli i drzewie umiejętności.

- [ ] **Step 3: Potwierdź, że flaga została tylko tam, gdzie działa**

```bash
cd warhammer-battle-helper-front && grep -n "showOnShortCard" src/components/creator/TemplateBuilder.jsx
```

Oczekiwane dokładnie 5 trafień: fabryki `attr`, `number`, `progress` (linie ok. 127–129), warunek + `Switch` przełącznika (ok. 630–631) oraz badge `▤` na kanwie (ok. 900). Żadnego trafienia w liniach `skill_table` / `skill_tree`.

- [ ] **Step 4: Sprawdź, że build się kompiluje**

```bash
cd warhammer-battle-helper-front && CI=true npx react-scripts test --testPathPattern "systems/custom"
```

Oczekiwane: PASS (kreator nie ma własnych testów; ten przebieg łapie ewentualny błąd składni przez wspólny transform).

- [ ] **Step 5: Weryfikacja ręczna w przeglądarce**

Uruchom aplikację (recepta z pamięci projektu dla worktree: whitelist CORS + mount kontenera), otwórz kreator kart postaci:

1. Dodaj pole `skill_table` → w panelu właściwości **nie ma** przełącznika „pokaż na skróconej karcie"; pole `abbr` nadal jest.
2. Dodaj pole `attr` i `progress`, zaznacz im flagę → badge `▤` pojawia się na kanwie.
3. Zapisz szablon, wejdź do gry, kliknij postać: panel pokazuje zaznaczone kafelki, w grupach po sekcjach, z cienką linią między grupami; przy > 6 polach nic nie ucina, panel się przewija.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx
git commit -m "refactor(front): BUG-176 drop short-card flag from skill fields

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
