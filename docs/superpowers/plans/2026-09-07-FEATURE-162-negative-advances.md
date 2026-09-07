# FEATURE-162 — Ujemne rozwinięcia na karcie postaci — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zdjąć twarde `min={0}` z dwóch inputów **Rozwinięcie** na karcie postaci systemu `custom`, żeby GM mógł zapisać trwałą karę (utracona ręka, klątwa) jako wartość ujemną.

**Architecture:** Task 1 to zmiana wyłącznie w warstwie prezentacji. Blokada nigdy nie była regułą systemu — to atrybut HTML na dwóch inputach w `CustomSheetBody.jsx`. Go trzyma `Advances int` i sumuje `current = base + advances` bez walidacji, a handlery Reacta robią `Number(value) || 0`, co przepuszcza `-5` bez zmian. Do Task 1 nie dochodzi żaden stan, żadne pole szablonu, żadna migracja. (Finalny przegląd gałęzi wykazał jednak, że sam brak walidacji w Go nie wystarczał — patrz Global Constraints i Decyzja 2 w spec.)

**Tech Stack:** React (CRA) + Jest + React Testing Library

**Spec:** `docs/superpowers/specs/FEATURE-162.md`

## Global Constraints

- Zakres Task 1 to **wyłącznie inputy rozwinięcia** — `attr` z `hasAdvances` i `skill_table` z `hasAdvances`. Wszystkie pozostałe `min={0}` w `CustomSheetBody.jsx` (bazy, `skill_tree`, `progress`) zostają nietknięte.
- Task 1: bez zmian w Go, bez zmian w `SystemTemplate`, bez migracji, bez nowych kluczy i18n.
- Finalny przegląd gałęzi zmusił jednak do zmian w Go poza zakresem Task 1: `roller.go` — `skillValue` (sumuje `base+advances` zamiast ufać `current`), `skillHasValue` (odróżnia brak danych od realnego zera), `attrLookup` (rozróżnia „cecha niepodpięta" od „cecha skasowana do zera" po obecności klucza w mapie) i `evalOutcome` (jawny `hasThreshold` zamiast sentinela `threshold == 0`); `character.go` dostał tylko poprawkę nieaktualnego komentarza dokumentującego `Stats` (rolls nie czytają już `current`). Zob. `docs/superpowers/specs/FEATURE-162.md`, Decyzja 2.
- `step={field.step || 1}` przy inpucie rozwinięcia atrybutu zostaje bez zmian (FEATURE-157).
- Testy frontendu uruchamiane **wyłącznie** przez CRA: `CI=true npm test -- --watchAll=false` z katalogu `warhammer-battle-helper-front/`. Gołe `npx jest` nie działa. Znany baseline fail: `App.test.js` (axios ESM) — to nie regresja.
- Weryfikacja ręczna w przeglądarce jest częścią tego planu, nie opcją. jsdom nie odtwarza `badInput` w `<input type="number">`, więc zachowania przy wpisywaniu znaku `-` żaden test tu nie pokryje.

## Struktura plików

| Plik | Odpowiedzialność w tym feature |
|---|---|
| `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` | Jedyny plik produkcyjny Task 1. Dwa usunięcia atrybutu `min` — linia ~502 (rozwinięcie `attr`) i ~700 (rozwinięcie `skill_table`). |
| `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.smoke.test.jsx` | Nowy blok `describe` pinujący: rozwinięcia bez `min`, bazy dalej z `min`, ujemna wartość renderuje się na inpucie i w sumie. |
| `warhammer-battle-helper-front/src/systems/custom/rolls/CustomRoll.jsx`, `.../CustomWeaponRoll.jsx` | Poza Task 1, przyszły z falami napraw (nie z planu): zdjęcie `data.target > 0` na rzecz `!= null` (negatywny/zerowy realny próg ma się pokazywać), i ukrycie sztucznego „vs 0" dla rzutu pulowego bez skonfigurowanego progu sukcesu. |

Poza Task 1 (który dotyczy wyłącznie `CustomSheetBody.jsx`) finalny przegląd gałęzi wymusił zmiany w Go (`roller.go`, `character.go` — patrz Global Constraints wyżej) i w dwóch komponentach logu rzutów wymienionych w tabeli powyżej.

---

### Task 1: Ujemne rozwinięcia w `attr` i `skill_table`

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (dwa miejsca: input z klasą `custom-sheet__attr-input--adv`, input z klasą `custom-sheet__skill-val-input--adv`)
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.smoke.test.jsx` (dopisanie bloku `describe` na końcu pliku)

**Interfaces:**
- Consumes: nic — to pierwsze i jedyne zadanie kodowe.
- Produces: nic dla dalszych zadań. Task 2 to weryfikacja ręczna tej samej zmiany.

**Kontekst dla implementującego.** `CustomSheetBody` to system-agnostyczny renderer karty postaci: dostaje `sections` (definicja pól z szablonu GM-a) i `values` (dane konkretnej postaci), i renderuje inputy. Pole typu `attr` z włączonym `hasAdvances` rysuje trzy wiersze — **Baza**, **Rozwinięcie**, **Suma** — gdzie suma jest tekstem, nie inputem (liczy ją Go). `skill_table` robi to samo w układzie tabelarycznym dla każdego wiersza umiejętności. Komponent renderuje się w trybie read-only, gdy nie dostanie `onChange` — testy poniżej korzystają z tego i nie przekazują handlerów.

Klasy CSS, po których testy sięgają do inputów:

| Input | Selektor |
|---|---|
| `attr` — Baza i Rozwinięcie razem | `.custom-sheet__attr-input` (dwa węzły, w kolejności: baza, rozwinięcie) |
| `attr` — samo Rozwinięcie | `.custom-sheet__attr-input--adv` |
| `attr` — Suma (tekst) | `.custom-sheet__attr-total` |
| `skill_table` — Baza | `.custom-sheet__skill-val-input--base` |
| `skill_table` — Rozwinięcie | `.custom-sheet__skill-val-input--adv` |

- [ ] **Step 1: Napisz testy, które mają nie przejść**

Dopisz na **końcu** pliku `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.smoke.test.jsx` (po zamykającym `});` bloku `describe('CustomSheetBody field step', ...)`):

```jsx
// FEATURE-162: rozwinięcie to modyfikator ze znakiem, nie licznik awansów. Trwała kara
// (utracona ręka, klątwa) zapisuje się jako wartość ujemna, a baza zostaje wartością
// „naturalną" postaci. Blokadą był wyłącznie atrybut `min` na inpucie — Go trzyma
// Advances jako zwykły int i sumuje current = base + advances bez żadnej walidacji.
//
// Testy sprawdzają BRAK atrybutu (hasAttribute), nie jego wartość: `min="-999"` też
// przepuściłoby asercję na konkretny string, a nie o taki wynik nam chodzi.
describe('CustomSheetBody negative advances', () => {
  const advSections = (fields) => [{ id: 'sec1', title: 'Statystyki', columns: 3, fields }];

  it('leaves the advances input of an attr field unbounded, so a penalty can go below zero', () => {
    const { container } = render(<CustomSheetBody sections={advSections([
      { key: 'fld_attr', type: 'attr', label: 'Zręczność', hasAdvances: true, min: 0, max: 100 },
    ])} />);

    const adv = container.querySelector('.custom-sheet__attr-input--adv');
    expect(adv).not.toBeNull();
    expect(adv.hasAttribute('min')).toBe(false);
  });

  // Druga strona tej samej decyzji: poluzowaliśmy rozwinięcie, nie całą kartę. Baza dalej
  // respektuje min z szablonu, bo to wartość „naturalna" postaci i GM ustawia jej zakres
  // w kreatorze.
  it('keeps the template min on the base input of the same attr field', () => {
    const { container } = render(<CustomSheetBody sections={advSections([
      { key: 'fld_attr', type: 'attr', label: 'Zręczność', hasAdvances: true, min: 0, max: 100 },
    ])} />);

    const inputs = container.querySelectorAll('.custom-sheet__attr-input');
    expect(inputs.length).toBe(2);
    expect(inputs[0].getAttribute('min')).toBe('0');
  });

  it('leaves the advances input of a skill_table row unbounded', () => {
    const { container } = render(<CustomSheetBody sections={advSections([
      {
        key: 'fld_skills',
        type: 'skill_table',
        label: 'Umiejętności',
        hasAdvances: true,
        skills: [{ id: 'sk1', label: 'Wspinaczka' }],
      },
    ])} />);

    const adv = container.querySelector('.custom-sheet__skill-val-input--adv');
    expect(adv).not.toBeNull();
    expect(adv.hasAttribute('min')).toBe(false);
  });

  it('keeps min 0 on the base input of a skill_table row', () => {
    const { container } = render(<CustomSheetBody sections={advSections([
      {
        key: 'fld_skills',
        type: 'skill_table',
        label: 'Umiejętności',
        hasAdvances: true,
        skills: [{ id: 'sk1', label: 'Wspinaczka' }],
      },
    ])} />);

    expect(container.querySelector('.custom-sheet__skill-val-input--base').getAttribute('min')).toBe('0');
  });

  // Ścieżka wyświetlania, nie walidacji: input renderuje `adv || ''`, a suma spada poniżej
  // zera. Gdyby ktoś kiedyś zamienił to na `Math.max(0, adv)` albo na `adv > 0 ? adv : ''`,
  // atrybutowe testy wyżej dalej by przechodziły, a wartość znikałaby z ekranu.
  it('renders a negative advances value and a negative total', () => {
    const { container } = render(<CustomSheetBody
      sections={advSections([
        { key: 'fld_attr', type: 'attr', label: 'Zręczność', hasAdvances: true, min: 0, max: 100 },
      ])}
      values={{ attributes: { fld_attr: { base: 30, advances: -40, current: -10 } } }}
    />);

    expect(container.querySelector('.custom-sheet__attr-input--adv').value).toBe('-40');
    expect(container.querySelector('.custom-sheet__attr-total').textContent).toBe('-10');
  });
});
```

- [ ] **Step 2: Uruchom testy i potwierdź, że nie przechodzą**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.smoke
```

Oczekiwane: **FAIL** w dwóch testach — `leaves the advances input of an attr field unbounded…` i `leaves the advances input of a skill_table row unbounded`, oba z `expect(received).toBe(expected) // Expected: false, Received: true` (atrybut `min` jest dziś obecny). Pozostałe trzy nowe testy mają **przejść od razu** — pinują zachowanie, które ma się nie zmienić.

Jeśli któryś z tych trzech nie przechodzi, **zatrzymaj się**: albo selektor nie zgadza się z kodem, albo zmiana zaraz zepsuje coś, czego nie miała ruszać.

- [ ] **Step 3: Usuń `min` z inputu rozwinięcia atrybutu**

W `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx`, w `case 'attr'` w gałęzi `if (field.hasAdvances)`, w inpucie z klasą `custom-sheet__attr-input--adv`.

Przed:

```jsx
                  <input
                    type="number"
                    className="custom-sheet__attr-input custom-sheet__attr-input--adv"
                    value={adv || ''}
                    onChange={onChange ? e => onChange.advances(field.key, e.target.value) : undefined}
                    readOnly={readOnly}
                    min={0}
                    step={field.step || 1}
                  />
```

Po:

```jsx
                  <input
                    type="number"
                    className="custom-sheet__attr-input custom-sheet__attr-input--adv"
                    value={adv || ''}
                    onChange={onChange ? e => onChange.advances(field.key, e.target.value) : undefined}
                    readOnly={readOnly}
                    step={field.step || 1}
                  />
```

Uwaga: **nie ruszaj** inputu bazy dwa wiersze wyżej — ten ma `min={field.min ?? undefined}` i zostaje.

- [ ] **Step 4: Usuń `min` z inputu rozwinięcia w `skill_table`**

W tym samym pliku, w `case 'skill_table'`, w inpucie z klasą `custom-sheet__skill-val-input--adv` (wewnątrz `{hasAdv && (<>…</>)}`).

Przed:

```jsx
                        <input
                          type="number"
                          className="custom-sheet__skill-val-input custom-sheet__skill-val-input--adv"
                          value={adv || ''}
                          onChange={onChange ? e => onChange.skillAdvances(skillKey, e.target.value) : undefined}
                          readOnly={readOnly}
                          min={0}
                        />
```

Po:

```jsx
                        <input
                          type="number"
                          className="custom-sheet__skill-val-input custom-sheet__skill-val-input--adv"
                          value={adv || ''}
                          onChange={onChange ? e => onChange.skillAdvances(skillKey, e.target.value) : undefined}
                          readOnly={readOnly}
                        />
```

Uwaga: input bazy tuż wyżej (klasa `custom-sheet__skill-val-input--base`) ma własne `min={0}` i zostaje.

- [ ] **Step 5: Uruchom testy i potwierdź, że przechodzą**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.smoke
```

Oczekiwane: **PASS**, wszystkie testy w pliku (te z FEATURE-161, FEATURE-157 i pięć nowych).

- [ ] **Step 6: Uruchom cały pakiet testów frontendu**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false
```

Oczekiwane: jedyny fail to `App.test.js` (axios ESM) — to znany baseline, nie regresja. Jakikolwiek inny fail zatrzymuje zadanie.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx \
        warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.smoke.test.jsx
git commit -m "$(cat <<'MSG'
feat: FEATURE-162 allow negative advances on the custom sheet

The advances inputs on attr fields and skill_table rows carried a
hardcoded min of 0, so a GM had no way to record a permanent penalty —
a lost arm, a curse — as a negative modifier. The only alternative was
lowering the base, which erases the distinction the base/advances pair
exists to draw: the base is what the character naturally is, advances are
everything play has done to it.

The cap was never a rule of the system. Go stores Advances as a plain int
and ComputeDerived just sums current = base + advances with no validation,
and the React handlers coerce with Number(value) || 0, which passes -5
through untouched. Removing the attribute from the two inputs is the whole
change.

Both bases keep their min: the attr base still honours the template's
field.min, the skill_table base still floors at 0. Only advances is loosened.

step stays as it is. With min gone the native step grid anchors on the
value attribute (React sets it via defaultValue on mount) rather than on
0, so arrows on a field with step 5 may land on -3, 2, 7 instead of
-5, 0, 5. That is the same native quirk FEATURE-157 deliberately left
exposed; a GM who does not want the grid sets a step of 1.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: Weryfikacja ręczna w przeglądarce

**Files:** żadnych — to zadanie nic nie zmienia w repo.

**Interfaces:**
- Consumes: zmiana z Task 1, uruchomiona w przeglądarce.
- Produces: nic. Wynikiem jest decyzja: zostawiamy, czy wracamy do Task 1.

**Dlaczego to nie jest test.** W `<input type="number">` sam znak `-` to stan `badInput`: `e.target.value` zwraca `""`, nie `"-"`. Handler robi wtedy `Number("") || 0` → `0`, a `value={adv || ''}` renderuje pusty string. React porównuje `props.value` z `node.value` (przy `badInput` też `""`), nie widzi różnicy i nie nadpisuje DOM-u — więc minus **powinien** przetrwać do dopisania cyfry. jsdom nie implementuje `badInput`, więc testem tego nie sprawdzimy; trzeba zobaczyć na żywo.

Uruchomienie środowiska: patrz `docs/architecture.md` i `docker-compose` w korzeniu repo. Potrzebna gra w systemie `custom` z szablonem, który ma pole `attr` z włączonym Rozwinięciem i tabelę umiejętności z włączonym Rozwinięciem.

- [ ] **Step 1: Ujemne rozwinięcie przy cesze**

Otwórz kartę postaci, w polu **Rozwinięcie** przy cesze wpisz `-3`.

Oczekiwane: pole pokazuje `-3` (nie `3`, nie `0`), a **Suma** jest o 3 mniejsza od Bazy.

Jeśli minus znika przy wpisywaniu — zanotuj dokładne zachowanie (czy znika od razu, czy dopiero gdy pole miało wcześniej wartość) i zatrzymaj się. To wymaga zmiany w handlerze, a nie w atrybucie, i jest materiałem na decyzję, nie na cichą poprawkę.

- [ ] **Step 2: Trwałość po zapisie**

Odczekaj autosave (800 ms po ostatnim wpisaniu, `triggerAutoSave` w `systems/custom/CharacterSheet.jsx`), zamknij i otwórz kartę ponownie.

Oczekiwane: `-3` wraca z serwera, Suma dalej ujemna względem Bazy.

- [ ] **Step 3: To samo w tabeli umiejętności**

Powtórz kroki 1–2 na kolumnie **Rozwinięcie** w tabeli umiejętności.

Oczekiwane: identycznie — wartość ujemna wpisuje się, sumuje i przeżywa przeładowanie.

- [ ] **Step 4: Strzałki przy skoku większym niż 1**

Na polu ze skokiem `5` (ustawianym w kreatorze, FEATURE-157) klikaj strzałkę w dół poniżej zera.

Oczekiwane: wartość schodzi co `5`. Punkt siatki może być przesunięty względem zera (`-3, 2, 7…` zamiast `-5, 0, 5…`) — to opisane w spec-u i **akceptowane**. Zanotuj, co faktycznie robi.

- [ ] **Step 5: Baza się nie poluzowała**

W polu **Baza** przy cesze (z `min` `0` w szablonie) spróbuj zejść strzałką poniżej zera.

Oczekiwane: nie da się. Blokada bazy została nietknięta.

- [ ] **Step 6: Zapisz wynik weryfikacji**

Jeśli wszystkie kroki wyszły zgodnie z oczekiwaniem — dopisz do `docs/superpowers/specs/FEATURE-162.md` pod sekcją „Pułapka implementacyjna" jedno zdanie z datą i faktycznym zachowaniem minusa oraz siatki `step`, i zacommituj:

```bash
git add docs/superpowers/specs/FEATURE-162.md
git commit -m "docs: FEATURE-162 record what the browser actually does with the minus sign"
```

Jeśli którykolwiek krok wyszedł inaczej — nie poprawiaj na ślepo. Opisz rozbieżność i wróć z nią, zanim cokolwiek zmienisz.
