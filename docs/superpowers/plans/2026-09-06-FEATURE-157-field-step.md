# FEATURE-157 — Konfigurowalny skok wartości dla pól `attr` i `number` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać do kreatora kart postaci pole konfiguracji „Skok", które steruje przyrostem strzałek przy inputach pól `attr` i `number` na karcie postaci.

**Architecture:** Nowe pole `Step int` na `FieldDef` (backend to czysty nośnik — nic z niego nie liczy). Kreator zapisuje je jednym `TextField`, a karta postaci przekazuje je do natywnego atrybutu HTML `step` na czterech inputach. Brak własnej logiki inkrementacji: przeglądarka snapuje wartość do siatki `stepBase + n * step`.

**Tech Stack:** Go + MongoDB (bson/json struct tags) | React + MUI `TextField`/`Box` + i18next | Jest + React Testing Library (CRA)

**Spec:** `docs/superpowers/specs/FEATURE-157.md`

## Global Constraints

- Skok to **integer ≥ 1**. Backend trzyma `Base`/`Advances` jako `int` i `Numbers map[string]int` (`internal/systems/custom/character.go:6`) — ułamki nie mają gdzie wylądować.
- `Math.trunc` na każdym numerycznym `onChange` w kreatorze jest obowiązkowy. `type="number"` odrzuca tylko znaki nienumeryczne, nie ułamki; `2.5` doszłoby do backendu jako `int` i wywaliło **cały** PATCH szablonu na 400, a `saveTemplate` połyka ten błąd po cichu.
- Zakres to wyłącznie `attr` i `number`. `progress` zostaje ze skokiem 1.
- Żadnych stringów wprost w JSX — zawsze `t('klucz')`, klucz angielski, tłumaczenie równolegle w `locales/en/translation.json` i `locales/pl/translation.json`.
- Brak backward compat i brak migracji: stare szablony nie mają `step`, front podmienia brak na `1`.
- Testy frontendu uruchamiane **wyłącznie** przez CRA: `CI=true npm test -- --watchAll=false` z katalogu `warhammer-battle-helper-front/`. Gołe `npx jest` nie działa. Znany baseline fail: `App.test.js` (axios ESM) — to nie regresja.

## Struktura plików

| Plik | Odpowiedzialność w tym feature |
|---|---|
| `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` | nośnik pola `Step` na `FieldDef` |
| `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` | render — przekazuje `step` do 4 inputów |
| `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.smoke.test.jsx` | testy renderu |
| `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` | domyślna wartość pola, panel konfiguracji, chip na kanwie |
| `warhammer-battle-helper-front/src/locales/en/translation.json` | 3 nowe klucze |
| `warhammer-battle-helper-front/src/locales/pl/translation.json` | 3 nowe klucze |

Bez nowych plików. Bez zmian w CSS — chip skoku dzieli istniejącą klasę `.creator__canvas-field-range` (`style.css:8895`).

---

### Task 1: Pole `Step` na `FieldDef` (backend)

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go:170-176`

**Interfaces:**
- Consumes: nic
- Produces: `models.FieldDef.Step int` — JSON `step`, BSON `step`, oba `omitempty`

**Brak testu w tym tasku i dlaczego:** to pole nie ma zachowania. Żaden kod Go go nie czyta — `SeedDefaults` (`internal/systems/custom/plugin.go:63`) pomija je, rollery i `ComputeDerived` też. Test sprawdzałby wyłącznie `encoding/json` i sterownik BSON, nie nasz kod. Zachowanie fallbacku testujemy po stronie frontu w Tasku 2.

- [ ] **Step 1: Dodaj pole do struktury**

W `internal/models/SystemTemplate.go` znajdź blok zaczynający się od `Default            *int` i wstaw `Step` bezpośrednio **po** nim, przed `ShowToPlayer`:

```go
	Default            *int           `bson:"default,omitempty" json:"default,omitempty"`
	// Step is the arrow-key / spinner increment for "attr" and "number" inputs on the sheet.
	// 0 or absent means 1 — it is a plain int, not a pointer, because 0 is not a legal step,
	// so omitempty cannot erase a meaningful value the way it could for Default. Nothing in Go
	// reads it: the sheet renderer is the only consumer.
	Step               int            `bson:"step,omitempty" json:"step,omitempty"`
	ShowToPlayer       bool           `bson:"showToPlayer" json:"showToPlayer"`
```

- [ ] **Step 2: Zweryfikuj kompilację i pełny pakiet testów**

```bash
cd warhammer-battle-helper-backend && go build ./... && go test ./internal/...
```

Oczekiwane: build bez wyjścia, `go test` — `ok` / `no test files` dla każdego pakietu, zero `FAIL`.

- [ ] **Step 3: Commit**

```bash
git add warhammer-battle-helper-backend/internal/models/SystemTemplate.go
git commit -m "feat: FEATURE-157 carry a per-field Step on FieldDef"
```

---

### Task 2: Karta postaci honoruje skok (TDD)

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx:484`, `:496`, `:519`, `:536`
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.smoke.test.jsx`

**Interfaces:**
- Consumes: `field.step` z Taska 1 (`number | undefined`)
- Produces: inputy `attr` i `number` renderują atrybut HTML `step`; brak wartości i `0` dają `"1"`

- [ ] **Step 1: Napisz failujące testy**

Dopisz na **końcu** pliku `CustomSheetBody.smoke.test.jsx`, po zamykającym `});` istniejącego `describe('CustomSheetBody field labels', ...)`:

```jsx
// FEATURE-157: skok pola. Snapowanie do siatki robi przeglądarka na podstawie atrybutu
// `step` — jsdom go nie wykonuje, więc testujemy jedyną rzecz, za którą odpowiada nasz kod:
// czy poprawna wartość trafia na wszystkie cztery inputy i czy fallback łapie oba źródła
// braku (undefined ze starego szablonu, 0 ze stanu kreatora przed clampem w onBlur).
describe('CustomSheetBody field step', () => {
  const stepSections = (fields) => [{ id: 'sec1', title: 'Statystyki', columns: 3, fields }];

  it('puts the configured step on both inputs of an attr field with advances', () => {
    const { container } = render(<CustomSheetBody sections={stepSections([
      { key: 'fld_attr', type: 'attr', label: 'Zdolność Walki', hasAdvances: true, step: 5 },
    ])} />);

    const inputs = container.querySelectorAll('.custom-sheet__attr-input');
    expect(inputs.length).toBe(2);
    inputs.forEach(input => expect(input.getAttribute('step')).toBe('5'));
  });

  it('puts the configured step on a simple attr field', () => {
    const { container } = render(<CustomSheetBody sections={stepSections([
      { key: 'fld_attr', type: 'attr', label: 'Siła', step: 10 },
    ])} />);

    expect(container.querySelector('.custom-sheet__attr-input').getAttribute('step')).toBe('10');
  });

  it('puts the configured step on a number field', () => {
    const { container } = render(<CustomSheetBody sections={stepSections([
      { key: 'fld_num', type: 'number', label: 'Punkty Przeznaczenia', step: 5 },
    ])} />);

    expect(container.querySelector('.custom-sheet__number-input').getAttribute('step')).toBe('5');
  });

  it('falls back to 1 when the template predates the feature and has no step', () => {
    const { container } = render(<CustomSheetBody sections={stepSections([
      { key: 'fld_num', type: 'number', label: 'Punkty Przeznaczenia' },
    ])} />);

    expect(container.querySelector('.custom-sheet__number-input').getAttribute('step')).toBe('1');
  });

  // Zero nie przychodzi z Go — omitempty wycina je i z JSON-a, i z BSON-a. Przychodzi ze stanu
  // Reacta w kreatorze: TemplateBuilder renderuje ten komponent jako live preview nad
  // edytowanymi sekcjami, więc wpisane 0 dociera tu, zanim onBlur podniesie je do 1.
  // Dlatego fallback musi być `|| 1`, nie `?? 1`.
  it('falls back to 1 for a step of 0 coming from the creator preview state', () => {
    const { container } = render(<CustomSheetBody sections={stepSections([
      { key: 'fld_num', type: 'number', label: 'Punkty Przeznaczenia', step: 0 },
    ])} />);

    expect(container.querySelector('.custom-sheet__number-input').getAttribute('step')).toBe('1');
  });
});
```

- [ ] **Step 2: Uruchom testy i potwierdź, że failują**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.smoke
```

Oczekiwane: 5 nowych testów FAIL z `Expected: "5" / Received: null` (i analogicznie `"1"` vs `null`) — inputy nie mają jeszcze atrybutu `step`. Istniejące testy label PASS.

- [ ] **Step 3: Dodaj `step` do czterech inputów**

W `CustomSheetBody.jsx`, w `case 'attr':` — input bazy w wariancie z rozwinięciami (`:484`, ten z `value={base || ''}`):

```jsx
                  <input
                    type="number"
                    className="custom-sheet__attr-input"
                    value={base || ''}
                    onChange={onChange ? e => onChange.attr(field.key, e.target.value) : undefined}
                    readOnly={readOnly}
                    min={field.min ?? undefined}
                    max={field.max ?? undefined}
                    step={field.step || 1}
                  />
```

Input rozwinięć (`:496`, ten z `value={adv || ''}`):

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

Input wariantu prostego (`:519`, ten z `value={attrs[field.key]?.base ?? ''}`):

```jsx
            <input
              type="number"
              className="custom-sheet__attr-input"
              value={attrs[field.key]?.base ?? ''}
              onChange={onChange ? e => onChange.attr(field.key, e.target.value) : undefined}
              readOnly={readOnly}
              min={field.min ?? undefined}
              max={field.max ?? undefined}
              step={field.step || 1}
            />
```

`case 'number':` (`:536`):

```jsx
            <input
              type="number"
              className="custom-sheet__number-input"
              value={numbers[field.key] ?? ''}
              onChange={onChange ? e => onChange.number(field.key, e.target.value) : undefined}
              readOnly={readOnly}
              min={field.min ?? undefined}
              max={field.max ?? undefined}
              step={field.step || 1}
            />
```

`|| 1`, nie `?? 1` — musi złapać zarówno `undefined`, jak i `0`. Nie ruszaj inputów w `case 'progress':` — `progress` jest poza zakresem.

- [ ] **Step 4: Uruchom testy i potwierdź, że przechodzą**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody
```

Oczekiwane: PASS we wszystkich plikach `CustomSheetBody*` (smoke + skillTree).

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx \
        warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.smoke.test.jsx
git commit -m "feat: FEATURE-157 honour a field's step on attr and number inputs"
```

---

### Task 3: Klucze i18n

**Files:**
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json:1195`
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json:1195`

**Interfaces:**
- Consumes: nic
- Produces: `creator.fieldStep`, `creator.fieldStepHint`, `creator.canvasStepChip` (ten ostatni z interpolacją `{{step}}`) — konsumowane przez Task 4 i 5

- [ ] **Step 1: Dodaj klucze do `en`**

W `locales/en/translation.json`, w obiekcie `creator`, bezpośrednio po linii `"fieldDefault": "Default",`:

```json
    "fieldDefault": "Default",
    "fieldStep": "Step",
    "fieldStepHint": "How much the input arrows change the value",
    "canvasStepChip": "step {{step}}",
```

- [ ] **Step 2: Dodaj klucze do `pl`**

W `locales/pl/translation.json`, w obiekcie `creator`, bezpośrednio po linii `"fieldDefault": "Domyślna",`:

```json
    "fieldDefault": "Domyślna",
    "fieldStep": "Skok",
    "fieldStepHint": "O ile zmieniają wartość strzałki przy polu",
    "canvasStepChip": "co {{step}}",
```

- [ ] **Step 3: Zweryfikuj, że oba pliki to nadal poprawny JSON i że klucze się zgadzają**

```bash
cd warhammer-battle-helper-front/src/locales && \
  python3 -c "
import json
en = json.load(open('en/translation.json'))['creator']
pl = json.load(open('pl/translation.json'))['creator']
for k in ['fieldStep', 'fieldStepHint', 'canvasStepChip']:
    print(k, '|', en[k], '|', pl[k])
assert set(en) == set(pl), set(en) ^ set(pl)
print('creator keys in sync')
"
```

Oczekiwane: trzy linie z parami tłumaczeń i `creator keys in sync`. Jeśli asercja padnie, wypisze klucze rozjechane między językami — napraw je przed commitem.

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-front/src/locales/en/translation.json \
        warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat: FEATURE-157 add the step-config i18n keys in en and pl"
```

---

### Task 4: Pole „Skok" w panelu konfiguracji pola

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:130-131` (`makeDefaultField`)
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:654-660` (wiersz Min/Max/Domyślna)

**Interfaces:**
- Consumes: `creator.fieldStep`, `creator.fieldStepHint` z Taska 3; `field.step` renderowane przez Task 2
- Produces: `field.step` w stanie sekcji — `number` po `onBlur`, może być `null` w trakcie edycji

**Brak testu automatycznego i dlaczego:** katalog `components/creator/` nie ma żadnych testów, a `TemplateBuilder.jsx` ma 1702 linie i wciąga MUI oraz DnD Kit. Postawienie pierwszego harnessu renderującego dla tego pliku jest większe niż cały feature i spec wprost stawia to poza zakresem. Renderowa połowa zachowania jest pokryta w Tasku 2; tu weryfikujemy ręcznie.

- [ ] **Step 1: Ustaw domyślny skok dla nowych pól**

W `makeDefaultField`, linie z `if (type === 'attr')` i `if (type === 'number')`:

```js
  if (type === 'attr') return { ...base, min: 0, max: 100, step: 1, showOnShortCard: false, hasAdvances: false, advancesLabel: 'Rozwinięcie' };
  if (type === 'number') return { ...base, min: 0, max: 100, step: 1, showOnShortCard: false };
```

- [ ] **Step 2: Dodaj wiersz „Skok" pod wierszem Min/Max/Domyślna**

Znajdź `<Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>` zawierający `label="Min"` i wstaw **bezpośrednio po** jego zamykającym `)}` nowy blok:

```jsx
      {/* Skok steruje wyłącznie strzałkami inputu na karcie. Przeglądarka nie dodaje skoku do
          bieżącej wartości — snapuje ją do siatki stepBase + n * step, gdzie stepBase to atrybut
          min (a bez niego 0). Trunc tak samo obowiązkowy jak wyżej: ułamek 400-uje cały PATCH
          szablonu, a saveTemplate połyka ten błąd po cichu. Clamp <1 → 1 dopiero na onBlur —
          w onChange skakałby na 1 w momencie wpisania "0", przez co "05" wychodziłoby jako "15". */}
      {(field.type === 'attr' || field.type === 'number') && (
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
          <TextField
            size="small"
            label={t('creator.fieldStep')}
            helperText={t('creator.fieldStepHint')}
            type="number"
            value={field.step ?? ''}
            onChange={e => up({ step: e.target.value === '' ? null : Math.max(0, Math.trunc(Number(e.target.value))) })}
            onBlur={() => {
              // Pole nietknięte (undefined — szablon sprzed feature'a) zostaje nietknięte:
              // sam focus + blur bez edycji nie może odpalić `up()`, bo to zastępuje cały
              // obiekt pola i planuje PATCH całego szablonu (BUG scenariusz z finalnego review).
              if (field.step === undefined) return;
              const clamped = field.step == null || field.step < 1 ? 1 : field.step;
              if (clamped !== field.step) up({ step: clamped });
            }}
            sx={{ flex: '0 0 140px' }}
            InputProps={{ sx: { fontFamily: 'Crimson Text, serif' }, inputProps: { step: 1, min: 1 } }}
          />
        </Box>
      )}
```

- [ ] **Step 3: Zweryfikuj lint i build**

```bash
cd warhammer-battle-helper-front && npx eslint src/components/creator/TemplateBuilder.jsx
```

Oczekiwane: brak wyjścia (zero błędów i ostrzeżeń).

- [ ] **Step 4: Weryfikacja ręczna w aplikacji**

Uruchom front, otwórz kreator systemu i wykonaj dokładnie te kroki:

1. Dodaj pole typu **Atrybut** → panel konfiguracji pokazuje „Skok" z wartością `1` pod wierszem Min/Max/Domyślna.
2. Ustaw Skok na `5`, Min na `0`. Live preview obok kanwy jest **read-only** (`CustomSheetBody.jsx:180`
   liczy `readOnly = !onChange`, `TemplateBuilder.jsx:1113` renderuje ją bez `onChange`) — strzałek
   spinnera tam nie zobaczysz i nie da się w nią kliknąć. Zamiast tego zbadaj input bazowy w DevTools
   (Zbadaj element) → atrybut `step="5"` na `<input>` potwierdza, że skonfigurowana wartość faktycznie
   dotarła do renderu.
3. Włącz „Rozwinięcia" na tym polu → zbadaj też input rozwinięć w DevTools → ma `step="5"` tak samo jak
   baza. Same strzałki (czy realnie chodzą co `5`) weryfikuje dopiero Task 6 Step 3 na prawdziwej karcie
   postaci — live preview kreatora z natury tego pokazać nie może.
4. Wyczyść pole Skok do pusta i kliknij poza nie → wraca `1`.
5. Wpisz `0` i kliknij poza pole → wraca `1`.
6. Wpisz `2.5` → w polu ląduje `2` (trunc), nie `2.5`.
7. Zapisz szablon i przeładuj stronę → Skok `5` przetrwał.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx
git commit -m "feat: FEATURE-157 add a Step config field for attr and number fields"
```

---

### Task 5: Chip skoku na kanwie kreatora

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:904-906` (chip zakresu)

**Interfaces:**
- Consumes: `creator.canvasStepChip` z Taska 3; `field.step` z Taska 4
- Produces: nic — liść UI

Bez tego GM nie widzi skoku, dopóki nie kliknie pola. Chip dzieli istniejącą klasę `.creator__canvas-field-range` (`style.css:8895`) — nowe CSS nie jest potrzebne.

- [ ] **Step 1: Rozszerz chip zakresu o skok**

Zamień blok:

```jsx
      {(field.type === 'attr' || field.type === 'number') && (field.min != null || field.max != null) && (
        <div className="creator__canvas-field-range">{field.min ?? '?'} – {field.max ?? '?'}</div>
      )}
```

na:

```jsx
      {(field.type === 'attr' || field.type === 'number') && (field.min != null || field.max != null || field.step > 1) && (
        <div className="creator__canvas-field-range">
          {(field.min != null || field.max != null) && `${field.min ?? '?'} – ${field.max ?? '?'}`}
          {(field.min != null || field.max != null) && field.step > 1 && ' · '}
          {field.step > 1 && t('creator.canvasStepChip', { step: field.step })}
        </div>
      )}
```

`field.step > 1` załatwia `undefined` i `null` bez dodatkowego strażnika — obie wartości dają `false` w porównaniu.

- [ ] **Step 2: Zweryfikuj lint**

```bash
cd warhammer-battle-helper-front && npx eslint src/components/creator/TemplateBuilder.jsx
```

Oczekiwane: brak wyjścia.

- [ ] **Step 3: Weryfikacja ręczna**

W kreatorze, na kafelku pola na kanwie:

1. Pole `attr` z Min `0`, Max `100`, Skok `1` → chip pokazuje samo `0 – 100`.
2. Podnieś Skok do `5` → chip pokazuje `0 – 100 · co 5`.
3. Wyczyść Min i Max, zostaw Skok `5` → chip pokazuje samo `co 5`.
4. Przełącz język na angielski → `step 5`.

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx
git commit -m "feat: FEATURE-157 show the step on the creator canvas field chip"
```

---

### Task 6: Weryfikacja końcowa

**Files:** brak zmian

- [ ] **Step 1: Pełny pakiet testów frontendu**

```bash
cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false
```

Oczekiwane: PASS wszędzie **poza** `App.test.js`, który failuje na axios ESM. To udokumentowany baseline, nie regresja tego feature'a. Każdy inny FAIL jest regresją i blokuje zakończenie.

- [ ] **Step 2: Pełny pakiet testów backendu**

```bash
cd warhammer-battle-helper-backend && go build ./... && go test ./internal/...
```

Oczekiwane: zero `FAIL`.

- [ ] **Step 3: End-to-end na lokalnym stacku**

1. Utwórz szablon systemu z polem `attr` (Skok `5`, rozwinięcia włączone) i polem `number` (Skok `10`).
2. Opublikuj szablon, załóż grę na tym systemie, dodaj postać.
3. Na **karcie postaci** (nie w preview kreatora) sprawdź, że strzałki bazy i rozwinięć chodzą co `5`, a pole liczbowe co `10`.
4. Sprawdź, że istniejąca gra na szablonie sprzed feature'a ma strzałki chodzące co `1`.
