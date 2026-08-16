# FEATURE-161 — przycinanie długich nazw pól: plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Długa nazwa pola przestaje rozwalać układ customowej karty postaci — zostaje przycięta do szerokości kolumny z wielokropkiem, a pełną treść pokazuje dymka po najechaniu kursorem.

**Architecture:** Dwa niezależne kroki. Zadanie 1 to czysty CSS: `minmax(0, 1fr)` zdejmuje z torów siatki podłogę min-content, a `overflow: hidden` + `text-overflow: ellipsis` przycinają etykietę do komórki. Po nim bug układu jest naprawiony i aplikacja działa. Zadanie 2 dokłada dymkę: jedna instancja istniejącego hooka `usePortalTooltip` w `CustomSheetBody` plus helper renderujący etykietę, który odpala dymkę wyłącznie gdy `scrollWidth > clientWidth`.

**Tech Stack:** React 19, CSS Grid, `@testing-library/react` + jest (react-scripts 5), istniejący `components/common/PortalTooltip.jsx`.

**Spec:** `docs/superpowers/specs/2026-08-16-FEATURE-161-field-label-truncation-design.md`

## Global Constraints

- Wszystkie ścieżki względem katalogu repozytorium `warhammer-battle-helper/`.
- Frontend żyje w `warhammer-battle-helper-front/`; komendy npm/npx uruchamiane z tego katalogu.
- Zakaz MUI `<Tooltip>` — dymki wyłącznie przez portal `createPortal` do `document.body` (CLAUDE.md).
- Zakaz nowych bibliotek i zakaz nowych plików CSS — edytujemy istniejący `src/style.css`.
- Zakaz stringów wpisanych wprost w JSX — ale to zadanie nie dodaje żadnego nowego tekstu interfejsu, więc żaden klucz i18n nie powstaje. Dymka pokazuje `field.label` wpisany przez MG.
- Nazwy klas CSS w konwencji BEM z prefiksem `custom-sheet__`.
- Zakres = wyłącznie klasa `custom-sheet__field-label` (typy pól: `attr`, `number`, `progress`, `text_short`, `text_long`, `select`). Nie ruszamy `checkbox`, pola `label`, tabel ani drzewa umiejętności.

## File Structure

| Plik | Rola | Zadanie |
|---|---|---|
| `warhammer-battle-helper-front/src/style.css` | Poprawki układu: tory siatki, przycięcie etykiety, nieściśliwa kostka | 1 |
| `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` | Hook dymki + helper `renderFieldLabel` + 7 podmian etykiet + `{tooltipNode}` | 2 |
| `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.smoke.test.jsx` | Nowy plik testu — warunek „dymka tylko gdy przycięte" | 2 |

Bez zmian: `components/common/PortalTooltip.jsx` (używamy jak jest), `components/creator/TemplateBuilder.jsx` (renderuje ten sam `CustomSheetBody`, więc dostaje poprawkę za darmo), pliki tłumaczeń.

---

### Task 1: Poprawki CSS układu i przycięcia

**Files:**
- Modify: `warhammer-battle-helper-front/src/style.css:7670-7698` (warianty siatki `--2-col` … `--6-col`)
- Modify: `warhammer-battle-helper-front/src/style.css:7707-7715` (`.custom-sheet__field-label`)
- Modify: `warhammer-battle-helper-front/src/style.css:7834-7845` (`.custom-sheet__roll-btn`)
- Test: brak testu automatycznego — jsdom nie stosuje arkuszy stylów i nie liczy layoutu. Weryfikacja ręczna w krokach 5–7.

**Interfaces:**
- Consumes: nic (pierwsze zadanie).
- Produces: klasa `.custom-sheet__field-label` przycina tekst przez `overflow: hidden`, dzięki czemu w Zadaniu 2 `scrollWidth > clientWidth` w ogóle może być prawdziwe. Nazwa klasy pozostaje bez zmian.

- [ ] **Step 1: Zdejmij podłogę min-content z torów siatki**

W `src/style.css` podmień pięć reguł. `--1-col` jest fleksem, nie dotykamy go.

Przed:

```css
.custom-sheet__fields--2-col {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
}

.custom-sheet__fields--3-col {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
}

.custom-sheet__fields--4-col {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
}

.custom-sheet__fields--5-col {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
}

.custom-sheet__fields--6-col {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
}
```

Po (zmienia się wyłącznie linia `grid-template-columns` w każdej regule):

```css
/* minmax(0, …) zamiast gołego 1fr: `1fr` to skrót od `minmax(auto, 1fr)`, a to `auto`
   zabrania zwężenia toru poniżej min-content zawartości. Etykieta z `white-space: nowrap`
   ma min-content równy pełnej szerokości napisu, więc długa nazwa rozpychała tor, suma
   torów przekraczała kartę i pozostałe pola wyjeżdżały poza jej ramkę. */
.custom-sheet__fields--2-col {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

.custom-sheet__fields--3-col {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}

.custom-sheet__fields--4-col {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
}

.custom-sheet__fields--5-col {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
}

.custom-sheet__fields--6-col {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
}
```

- [ ] **Step 2: Przytnij etykietę wielokropkiem**

Przed:

```css
.custom-sheet__field-label {
    font-family: 'Cinzel', serif;
    font-size: 10px;
    font-weight: 600;
    color: #6b4423;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
}
```

Po:

```css
/* `overflow: hidden` robi tu podwójną robotę: przycina napis do komórki ORAZ zeruje
   automatyczny rozmiar minimalny etykiety jako elementu flex, dzięki czemu
   .custom-sheet__field i .custom-sheet__attr same przestają wymuszać szerokość na siatce.
   `min-width: 0` zabezpiecza wiersz .custom-sheet__attr-header, gdzie etykieta stoi
   obok kostki. `nowrap` zostaje — chcemy jednej linii z wielokropkiem, nie zawijania. */
.custom-sheet__field-label {
    font-family: 'Cinzel', serif;
    font-size: 10px;
    font-weight: 600;
    color: #6b4423;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}
```

- [ ] **Step 3: Zablokuj ściskanie kostki**

Przed:

```css
.custom-sheet__roll-btn {
    background: none;
    border: none;
    color: #c4a882;
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s;
    border-radius: 3px;
}
```

Po (dochodzi jedna deklaracja):

```css
.custom-sheet__roll-btn {
    background: none;
    border: none;
    color: #c4a882;
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s;
    border-radius: 3px;
    /* W .custom-sheet__attr-header (flex row) ścisnąć ma się etykieta, nie przycisk —
       bez tego ikona 14 px robi się owalna. */
    flex-shrink: 0;
}
```

- [ ] **Step 4: Odpal frontend**

Z katalogu `warhammer-battle-helper-front/`:

```bash
npm start
```

Oczekiwane: kompilacja bez błędów, aplikacja pod `http://localhost:3000`.

Jeśli projekt jest uruchamiany przez dockera, użyj zamiast tego `docker compose up front` z katalogu głównego repozytorium.

- [ ] **Step 5: Zweryfikuj ręcznie w podglądzie kreatora**

1. Zaloguj się, wejdź w kreator szablonu karty postaci.
2. Utwórz sekcję i ustaw jej liczbę kolumn na **3**.
3. Wrzuć do niej trzy pola typu `attr`.
4. Pierwszemu nadaj nazwę: `Odporność na wpływy chaosu i korupcję`.

Oczekiwane w podglądzie karty:
- trzy kolumny mają **równą** szerokość,
- pierwsza nazwa kończy się wielokropkiem `…`,
- żadne pole nie wychodzi poza ramkę karty.

- [ ] **Step 6: Zweryfikuj kostkę**

Włącz pierwszemu polu opcję „rzucalne" (kostka obok nazwy).

Oczekiwane: ikona kostki pozostaje kwadratowa/okrągła w pełnym rozmiarze, a ściska się wyłącznie etykieta.

- [ ] **Step 7: Zweryfikuj w karcie postaci w grze**

Zapisz szablon, utwórz grę na jego podstawie, otwórz kartę postaci gracza.

Oczekiwane: to samo co w kroku 5 — trzy równe kolumny, przycięta nazwa, nic poza ramką popupu.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/style.css
git commit -m "fix(custom): FEATURE-161 keep long field labels inside their grid column

A nowrap label has a min-content width equal to its full text, and
repeat(N, 1fr) expands to repeat(N, minmax(auto, 1fr)) — so the track grew
past its share and pushed the remaining fields outside the card. Drop the
floor with minmax(0, 1fr) and clip the label with an ellipsis.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Dymka z pełną nazwą, tylko gdy nazwa przycięta

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.smoke.test.jsx`
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (import, hook przy linii ~185, helper przy `renderField`, 7 podmian etykiet w liniach `455`, `493`, `512`, `528`, `554`, `568`, `612`, `{tooltipNode}` w `return`)

**Interfaces:**
- Consumes: z Zadania 1 — `.custom-sheet__field-label` ma `overflow: hidden`, więc `scrollWidth` (pełna szerokość treści) potrafi przewyższyć `clientWidth` (widoczne pudełko). Z istniejącego kodu — `usePortalTooltip` z `src/components/common/PortalTooltip.jsx`, zwracające `{ showTooltip(text, element), hideTooltip(), tooltipNode }`.
- Produces: nic dla dalszych zadań (to ostatnie zadanie).

- [ ] **Step 1: Napisz test, który ma nie przejść**

Utwórz `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.smoke.test.jsx`:

```jsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

// jsdom nie liczy layoutu — scrollWidth i clientWidth zawsze zwracają 0, więc warunek
// "tekst jest przycięty" nigdy sam z siebie nie zadziała. Podstawiamy obie miary na
// konkretnym węźle, żeby przetestować sam WARUNEK, nie zdolność jsdom do renderowania CSS.
function fakeWidths(el, { scrollWidth, clientWidth }) {
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true });
}

const LONG_LABEL = 'Odporność na wpływy chaosu i korupcję';

const sections = [{
  id: 'sec1',
  title: 'Atrybuty',
  columns: 3,
  fields: [{ key: 'fld_long', type: 'number', label: LONG_LABEL }],
}];

describe('CustomSheetBody field labels', () => {
  it('shows the full name in a tooltip when the label is clipped', () => {
    const { container } = render(<CustomSheetBody sections={sections} />);
    const label = container.querySelector('.custom-sheet__field-label');
    expect(label).not.toBeNull();

    fakeWidths(label, { scrollWidth: 300, clientWidth: 100 });
    fireEvent.mouseEnter(label);

    const tooltip = document.body.querySelector('.portal-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip.textContent).toContain(LONG_LABEL);
  });

  it('shows no tooltip when the label fits, because there is nothing hidden to reveal', () => {
    const { container } = render(<CustomSheetBody sections={sections} />);
    const label = container.querySelector('.custom-sheet__field-label');

    fakeWidths(label, { scrollWidth: 100, clientWidth: 100 });
    fireEvent.mouseEnter(label);

    expect(document.body.querySelector('.portal-tooltip')).toBeNull();
  });
});
```

- [ ] **Step 2: Odpal test i potwierdź, że nie przechodzi**

Z katalogu `warhammer-battle-helper-front/`:

```bash
CI=true npx react-scripts test --testPathPattern=CustomSheetBody
```

Oczekiwane: pierwszy test FAIL — `expect(received).not.toBeNull()` na `tooltip`, bo etykieta nie ma jeszcze żadnego `onMouseEnter`. Drugi test przechodzi (dymki i tak nie ma) — to normalne, pilnuje regresji w drugą stronę.

- [ ] **Step 3: Dodaj import hooka**

W `src/systems/custom/CustomSheetBody.jsx`, przy istniejących importach na górze pliku (linie 1–5), dopisz:

```jsx
import { usePortalTooltip } from '../../components/common/PortalTooltip';
```

- [ ] **Step 4: Powołaj hook w komponencie**

W `CustomSheetBody`, tuż przed blokiem `useState` (obecnie linia ~185, `const [expanded, setExpanded] = useState({});`), dodaj:

```jsx
  // Jedna instancja na całą kartę: jeden stan i jeden portal niezależnie od liczby pól.
  // Hook per etykieta dałby 40 niezależnych stanów przy karcie z 40 polami.
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();
```

- [ ] **Step 5: Dodaj helper renderujący etykietę**

W tym samym komponencie, bezpośrednio przed `const renderField = (field) => {` (obecnie linia ~436), dodaj:

```jsx
  // renderFieldLabel emits a field's name truncated to its grid column. The tooltip fires only
  // when the text is actually clipped: the ellipsis is what tells the player there is more to
  // read, so a label that fits needs no hover hint. scrollWidth is the untruncated content
  // width, clientWidth the visible box — they differ exactly when overflow:hidden cut something.
  const renderFieldLabel = (text) => (
    <label
      className="custom-sheet__field-label"
      onMouseEnter={e => {
        const el = e.currentTarget;
        if (el.scrollWidth > el.clientWidth) showTooltip(text, el);
      }}
      onMouseLeave={hideTooltip}
    >
      {text}
    </label>
  );
```

- [ ] **Step 6: Podmień siedem etykiet**

W `renderField` zamień **każde** z siedmiu wystąpień:

```jsx
<label className="custom-sheet__field-label">{field.label}</label>
```

na:

```jsx
{renderFieldLabel(field.label)}
```

Wystąpienia i ich konteksty (numery linii sprzed edycji — po dodaniu hooka i helpera przesuną się w dół):
- `455` — `attr` z awansami, wewnątrz `.custom-sheet__attr-header`
- `493` — `attr` prosty, wewnątrz `.custom-sheet__attr-header`
- `512` — `number`
- `528` — `progress`
- `554` — `text_short`
- `568` — `text_long`
- `612` — `select`

Sprawdź, że nie został żaden:

```bash
grep -n 'className="custom-sheet__field-label"' src/systems/custom/CustomSheetBody.jsx
```

Oczekiwane: dokładnie **jedno** trafienie — to wewnątrz `renderFieldLabel`.

- [ ] **Step 7: Wyrenderuj portal**

Na końcu `CustomSheetBody`, w bloku `return` (obecnie linie ~914–927), dodaj `{tooltipNode}` jako rodzeństwo listy sekcji. `.custom-sheet__sections` jest kontenerem układu, więc dymka nie może siedzieć w środku — opakowujemy całość we fragment:

Przed:

```jsx
  return (
    <div className="custom-sheet__sections">
      {(sections || []).map(section => (
        <div key={section.id} className="custom-sheet__section">
          {section.title && (
            <div className="custom-sheet__section-heading">{section.title}</div>
          )}
          <div className={`custom-sheet__fields custom-sheet__fields--${section.columns || 1}-col`}>
            {(section.fields || []).map(renderField)}
          </div>
        </div>
      ))}
    </div>
  );
```

Po:

```jsx
  return (
    <>
      <div className="custom-sheet__sections">
        {(sections || []).map(section => (
          <div key={section.id} className="custom-sheet__section">
            {section.title && (
              <div className="custom-sheet__section-heading">{section.title}</div>
            )}
            <div className={`custom-sheet__fields custom-sheet__fields--${section.columns || 1}-col`}>
              {(section.fields || []).map(renderField)}
            </div>
          </div>
        ))}
      </div>
      {tooltipNode}
    </>
  );
```

- [ ] **Step 8: Odpal testy i potwierdź, że przechodzą**

```bash
CI=true npx react-scripts test --testPathPattern=CustomSheetBody
```

Oczekiwane: `Tests: 2 passed, 2 total`.

- [ ] **Step 9: Odpal cały pakiet testów frontendu**

```bash
CI=true npx react-scripts test
```

Oczekiwane: wszystkie testy przechodzą. `CustomSheetBody` jest importowany przez `TemplateBuilder` i `CharacterSheet`, więc ten przebieg pilnuje, że fragment w `return` niczego nie zepsuł.

- [ ] **Step 10: Zweryfikuj dymkę ręcznie**

W aplikacji (`npm start`), na karcie z Zadania 1, kroku 5:

1. Najedź kursorem na przyciętą nazwę → pojawia się dymka **nad** etykietą, z pełnym tekstem `Odporność na wpływy chaosu i korupcję`, na kremowym tle z Cinzel.
2. Zjedź kursorem → dymka znika.
3. Najedź na którąś z krótkich, nieprzyciętych nazw → **żadna** dymka się nie pojawia.
4. Powtórz w karcie postaci w grze (`CharacterSheetPopup`) — dymka rysuje się nad popupem, nie jest przycięta jego ramką.
5. Zwęź okno tak, żeby pierwsza kolumna dotknęła lewej krawędzi ekranu → dymka przełącza się na wyrównanie do lewej i nie ucieka poza widok.

- [ ] **Step 11: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx \
        warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.smoke.test.jsx
git commit -m "feat(custom): FEATURE-161 reveal a clipped field label on hover

A truncated name now shows its full text in the shared portal tooltip. The
hover handler compares scrollWidth against clientWidth so the tooltip only
fires when the ellipsis actually hid something — a label that fits needs no
hint. One hook instance per sheet keeps it to a single state and portal.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Poza zakresem tego planu

`weapons_table` i `skill_table` w sekcji wielokolumnowej. Po Zadaniu 1 przestaną wypychać kartę, ale własna zawartość tabeli nadal może przekroczyć komórkę — to problem szerokości tabeli, nie długości nazwy pola. Osobne zadanie.
