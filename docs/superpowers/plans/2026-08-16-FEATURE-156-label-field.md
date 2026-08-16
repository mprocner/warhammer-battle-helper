# FEATURE-156 — pole "etykieta" w kreatorze kart postaci — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MG może wstawić na kartę postaci statyczny tekst o wybranym kolorze i wielkości czcionki, konfigurowany w kreatorze szablonów jako nowy typ pola `label`.

**Architecture:** Nowy typ pola `"label"` w istniejącym `FieldDef` (trzy płaskie pola: `Text`, `TextColor`, `TextSize`). Etykieta nie ma wartości per-postać — nic nie trafia do `Character.Stats`, więc backend poza modelem pozostaje nietknięty. Front: nowy wpis w palecie kreatora, blok w panelu właściwości, jeden `case` w switchu renderującym kartę (`CustomSheetBody`), który obsługuje jednocześnie kartę postaci i podgląd w kreatorze.

**Tech Stack:** Go 1.24 + MongoDB driver (bson) · React 18 + MUI + i18next · CSS BEM w `src/style.css`

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-16-FEATURE-156-label-field-design.md`
- Wszystkie stringi UI przez `t('klucz')` z **angielskim kluczem**; komplet kluczy w `locales/en/translation.json` i `locales/pl/translation.json` (CLAUDE.md).
- Ikony wyłącznie z `@mui/icons-material`.
- Kolory karty postaci: ciemny tekst na jasnym tle. Paleta etykiet (dokładnie te 8 wartości, w tej kolejności): `#3a2f1f`, `#7a5c42`, `#c9975b`, `#8b2c2c`, `#3f6b3f`, `#2f4a6b`, `#5c3a6b`, `#4a4a4a`.
- Dozwolone wartości `textSize` (dokładnie te 4 stringi): `"small"`, `"normal"`, `"large"`, `"heading"`.
- `field.text` renderowany zawsze jako plain text — nigdy `dangerouslySetInnerHTML`.
- Etykieta nie zapisuje nic w `Character.Stats`; jej `key` nie może pojawić się w statsach postaci.
- Commituj po każdym zadaniu, ze stopką `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Korzeń repo: `/Users/mateuszprocner/priv/warhammer-battle-helper`. Ścieżki plików w planie są względem niego, a każdy blok poleceń zaczyna się od jawnego `cd` — nie zakładaj katalogu roboczego po poprzednim kroku.

---

## File Structure

| Plik | Odpowiedzialność | Akcja |
|---|---|---|
| `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` | definicja `FieldDef` — trzy nowe pola + typ `"label"` w komentarzu | Modify |
| `warhammer-battle-helper-backend/internal/models/SystemTemplate_test.go` | round-trip BSON dla `FieldDef` typu `label` | Create |
| `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go` | dowód, że `SeedDefaults` ignoruje etykiety | Modify |
| `warhammer-battle-helper-front/src/locales/en/translation.json` | klucze angielskie (źródło prawdy) | Modify |
| `warhammer-battle-helper-front/src/locales/pl/translation.json` | tłumaczenia PL | Modify |
| `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` | typ w palecie, domyślne pole, kafelek kanwy, panel właściwości | Modify |
| `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` | render etykiety na karcie i w podglądzie | Modify |
| `warhammer-battle-helper-front/src/style.css` | klasy `.custom-sheet__label-text*`, swatche palety | Modify |

Kolejność zadań jest tak dobrana, że **każde kończy się czymś widocznym**: model (testy Go), potem klucze i18n, potem paleta (pole da się przeciągnąć na kanwę), potem panel właściwości (da się je skonfigurować i zapisać), na końcu render (widać tekst na karcie i w podglądzie).

---

### Task 1: Model backendu + testy niezmienników

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go:155-200` (struct `FieldDef`)
- Create: `warhammer-battle-helper-backend/internal/models/SystemTemplate_test.go`
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go` (dopisz na końcu pliku)

**Interfaces:**
- Consumes: nic (pierwsze zadanie).
- Produces: `models.FieldDef` z polami `Text string`, `TextColor string`, `TextSize string` oraz typem `"label"`. Front (Task 3-5) wysyła je jako `text`, `textColor`, `textSize` w JSON-ie sekcji.

- [ ] **Step 1: Napisz failujący test round-tripu BSON**

Utwórz `warhammer-battle-helper-backend/internal/models/SystemTemplate_test.go`:

```go
package models

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson"
)

// A "label" field carries its content in Text/TextColor/TextSize. SystemTemplate is decoded
// into this typed struct, so any key missing from the struct is dropped on read and erased by
// the next PATCH — silently. This test pins the round-trip so that cannot happen unnoticed.
func TestFieldDef_LabelRoundTripsThroughBSON(t *testing.T) {
	in := FieldDef{
		Key:          "label_1",
		Type:         "label",
		Label:        "Ostrzeżenie o mgle",
		Text:         "Uwaga: mgła\nzmniejsza widoczność",
		TextColor:    "#8b2c2c",
		TextSize:     "heading",
		ShowToPlayer: true,
	}

	raw, err := bson.Marshal(in)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var out FieldDef
	if err := bson.Unmarshal(raw, &out); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if out.Text != in.Text {
		t.Errorf("Text = %q, want %q", out.Text, in.Text)
	}
	if out.TextColor != in.TextColor {
		t.Errorf("TextColor = %q, want %q", out.TextColor, in.TextColor)
	}
	if out.TextSize != in.TextSize {
		t.Errorf("TextSize = %q, want %q", out.TextSize, in.TextSize)
	}
	if out.Type != "label" {
		t.Errorf("Type = %q, want \"label\"", out.Type)
	}
}

// An empty style means "use the sheet default", and omitempty must keep those keys out of the
// stored document instead of writing empty strings into every non-label field.
func TestFieldDef_EmptyLabelStyleIsOmitted(t *testing.T) {
	raw, err := bson.Marshal(FieldDef{Key: "attr_1", Type: "attr"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var doc bson.M
	if err := bson.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, key := range []string{"text", "textColor", "textSize"} {
		if _, ok := doc[key]; ok {
			t.Errorf("key %q must be omitted when empty", key)
		}
	}
}
```

- [ ] **Step 2: Uruchom test — musi nie skompilować się**

Run: `cd warhammer-battle-helper-backend && go test ./internal/models/...`
Expected: FAIL, `in.Text undefined (type FieldDef has no field or method Text)`

- [ ] **Step 3: Dodaj pola do `FieldDef`**

W `internal/models/SystemTemplate.go` zmień komentarz przy `Type` i dopisz trzy pola zaraz za `Abbr`:

```go
	Key   string `bson:"key" json:"key"`
	Type  string `bson:"type" json:"type"` // "attr"|"number"|"progress"|"text_short"|"text_long"|"checkbox"|"select"|"skill_table"|"skill_tree"|"weapons_table"|"label"
	Label string `bson:"label" json:"label"`
	Abbr  string `bson:"abbr,omitempty" json:"abbr,omitempty"`

	// Label-only fields (type == "label"). A label is pure sheet decoration: it holds no
	// per-character value, so its Key never appears in Character.Stats. Label carries the
	// creator-facing name; Text is what renders on the sheet.
	Text      string `bson:"text,omitempty" json:"text,omitempty"`
	TextColor string `bson:"textColor,omitempty" json:"textColor,omitempty"` // hex; empty = default sheet text color
	TextSize  string `bson:"textSize,omitempty" json:"textSize,omitempty"`   // "small"|"normal"|"large"|"heading"; empty = "normal"
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `cd warhammer-battle-helper-backend && go test ./internal/models/...`
Expected: `ok  	battle-helper/internal/models`

- [ ] **Step 5: Napisz failujący test `SeedDefaults`**

Dopisz na końcu `internal/systems/custom/roller_test.go` (helpery `seedTemplate`, `seedBlank`, `intPtr` już istnieją w tym pliku, ~linia 924):

```go
// A label field is template-only decoration (FEATURE-156). Even if a stale Default survives on
// it from an earlier field type, seeding must not create a stats key for it — otherwise every
// character would carry a phantom value nothing reads.
func TestSeedDefaults_LabelFieldIsNeverSeeded(t *testing.T) {
	s := seedBlank(t, seedTemplate(models.FieldDef{
		Key:     "label_1",
		Type:    "label",
		Text:    "Uwaga: mgła",
		Default: intPtr(3),
	}))

	if _, ok := s.Attributes["label_1"]; ok {
		t.Error("a label field must not land in Attributes")
	}
	if _, ok := s.Numbers["label_1"]; ok {
		t.Error("a label field must not land in Numbers")
	}
	if _, ok := s.Texts["label_1"]; ok {
		t.Error("a label field must not land in Texts")
	}
}
```

- [ ] **Step 6: Uruchom test — musi przejść od razu**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/... -run TestSeedDefaults_LabelFieldIsNeverSeeded -v`
Expected: PASS

To jedyny test w tym planie, który przechodzi bez zmiany kodu produkcyjnego, i tak ma być: `SeedDefaults` obsługuje tylko `attr`/`number` (`plugin.go:84-93`), więc niezmiennik już zachodzi. Test istnieje po to, żeby ktoś, kto później doda `case` do tego switcha, dostał czerwony wynik zamiast cichego regresu. Jeśli test **nie przechodzi**, oznacza to, że `SeedDefaults` zmieniło się od czasu pisania planu — przeczytaj go, zanim cokolwiek naprawisz.

- [ ] **Step 7: Uruchom cały backend testowo**

Run: `cd warhammer-battle-helper-backend && go build ./... && go test ./internal/...`
Expected: brak błędów kompilacji, wszystkie pakiety `ok` lub `no test files`

- [ ] **Step 8: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper
git add warhammer-battle-helper-backend/internal/models/SystemTemplate.go \
        warhammer-battle-helper-backend/internal/models/SystemTemplate_test.go \
        warhammer-battle-helper-backend/internal/systems/custom/roller_test.go
git commit -m "$(cat <<'EOF'
feat(models): FEATURE-156 add label field content and style to FieldDef

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Klucze i18n (EN + PL)

**Files:**
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json`

**Interfaces:**
- Consumes: nic z Taska 1.
- Produces: klucze używane w Taskach 3-4: `creator.fieldType.label`, `creator.fieldType.labelDesc`, `creator.labelText`, `creator.labelTextHint`, `creator.labelColor`, `creator.labelSize`, `creator.labelSizeSmall`, `creator.labelSizeNormal`, `creator.labelSizeLarge`, `creator.labelSizeHeading`, `creator.labelInternalName`, `creator.labelInternalNameHint`.

- [ ] **Step 1: Dodaj klucze typu pola do `en/translation.json`**

W obiekcie `creator.fieldType`, zaraz za parą `"textLong"` / `"textLongDesc"`:

```json
    "label": "Label",
    "labelDesc": "Static text shown on the sheet",
```

- [ ] **Step 2: Dodaj pozostałe klucze do `en/translation.json`**

W obiekcie `creator`, zaraz za kluczem `"fieldAbbrHint"`:

```json
    "labelText": "Text",
    "labelTextHint": "Shown on every character from this template",
    "labelColor": "Text color",
    "labelSize": "Font size",
    "labelSizeSmall": "Small",
    "labelSizeNormal": "Normal",
    "labelSizeLarge": "Large",
    "labelSizeHeading": "Heading",
    "labelInternalName": "Name (creator only)",
    "labelInternalNameHint": "Not shown on the character sheet",
```

- [ ] **Step 3: Dodaj te same klucze do `pl/translation.json`**

W `creator.fieldType`, w tym samym miejscu co w `en` (za `"textLongDesc"`):

```json
    "label": "Etykieta",
    "labelDesc": "Statyczny tekst na karcie",
```

W obiekcie `creator`, za `"fieldAbbrHint"`:

```json
    "labelText": "Tekst",
    "labelTextHint": "Widoczny na każdej postaci z tego szablonu",
    "labelColor": "Kolor tekstu",
    "labelSize": "Wielkość czcionki",
    "labelSizeSmall": "Mała",
    "labelSizeNormal": "Normalna",
    "labelSizeLarge": "Duża",
    "labelSizeHeading": "Nagłówek",
    "labelInternalName": "Nazwa (tylko kreator)",
    "labelInternalNameHint": "Nie pokazuje się na karcie postaci",
```

- [ ] **Step 4: Zweryfikuj parzystość kluczy mechanicznie**

Run: `cd /Users/mateuszprocner/priv/warhammer-battle-helper && python3 .claude/skills/i18n-sync/compare_keys.py`
Expected: exit 0, brak wpisów "brak w pl" / "brak w en" dla namespace'u `translation`

Jeśli skrypt zgłasza rozjazd **innych** kluczy niż dodane w tym zadaniu — zostaw je, to zastany dług; napraw tylko własne.

- [ ] **Step 5: Zweryfikuj, że JSON-y są poprawne**

Run:
```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper/warhammer-battle-helper-front/src && \
python3 -c "import json;[json.load(open(f'locales/{l}/translation.json')) for l in ('en','pl')];print('JSON OK')"
```
Expected: `JSON OK`

- [ ] **Step 6: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper
git add warhammer-battle-helper-front/src/locales/en/translation.json \
        warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "$(cat <<'EOF'
feat(i18n): FEATURE-156 add label field creator strings

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Typ `label` w palecie kreatora

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (importy ~linia 25, `FIELD_TYPES` ~90, `PALETTE_GROUPS` ~105, `makeDefaultField` ~110, `FieldCard` ~836)

**Interfaces:**
- Consumes: klucze i18n z Taska 2.
- Produces: pole tworzone przez `makeDefaultField('label')` o kształcie
  `{ key, type: 'label', label: '', abbr: '', showToPlayer: true, rollable: false, text: '', textColor: '', textSize: 'normal' }`.
  Task 4 (panel) i Task 5 (render) czytają dokładnie te nazwy pól.

- [ ] **Step 1: Zaimportuj ikonę**

Dopisz przy pozostałych importach ikon (za `import GavelIcon from '@mui/icons-material/Gavel';`, ~linia 25):

```jsx
import LabelIcon from '@mui/icons-material/Label';
```

- [ ] **Step 2: Dodaj wpis do `FIELD_TYPES`**

Na końcu tablicy `FIELD_TYPES` (~linia 100), za wpisem `skill_tree`:

```jsx
  { type: 'label',         labelKey: 'creator.fieldType.label',         icon: <LabelIcon fontSize="small" />,       desc: 'creator.fieldType.labelDesc' },
```

- [ ] **Step 3: Dodaj typ do grupy palety**

W `PALETTE_GROUPS` (~linia 105) rozszerz grupę tekstową:

```jsx
  { labelKey: 'creator.paletteGroupText',    types: ['text_short', 'text_long', 'label'] },
```

- [ ] **Step 4: Dodaj domyślne pole w `makeDefaultField`**

W `makeDefaultField` (~linia 110), przed końcowym `return base;`:

```jsx
  if (type === 'label') return { ...base, text: '', textColor: '', textSize: 'normal' };
```

`base` daje już `key`, `type`, `label: ''`, `abbr: ''`, `showToPlayer: true`, `rollable: false` — nie duplikuj ich.

- [ ] **Step 5: Pokaż treść na kafelku kanwy**

W komponencie `FieldCard` (~linia 836) zamień blok `abbr`/`label` na wariant świadomy etykiety:

```jsx
      {field.abbr
        ? <div className="creator__canvas-field-abbr">{field.abbr}</div>
        : <div className="creator__canvas-field-abbr creator__canvas-field-abbr--empty">
            {field.label || (field.type === 'label' && field.text) || <em>—</em>}
          </div>
      }
```

Bez tego etykieta bez nazwy roboczej byłaby na kanwie pustym prostokątem, w który MG musiałby trafiać na ślepo. Skracaniem tekstu zajmuje się CSS kafelka, nie JS.

- [ ] **Step 6: Zbuduj front, żeby wyłapać błędy składni i braki importów**

Run: `cd warhammer-battle-helper-front && npm run build`
Expected: `Compiled successfully` (ostrzeżenia ESLint dopuszczalne, jeśli nie dotyczą zmienionych linii)

- [ ] **Step 7: Weryfikacja ręczna**

1. Uruchom aplikację (`docker compose up` w korzeniu repo albo `npm start` w `warhammer-battle-helper-front`).
2. Otwórz kreator szablonów, sekcja z paletą pól.
3. W grupie "Tekst" / "Text" jest kafelek **Etykieta** z ikoną tagu i opisem "Statyczny tekst na karcie".
4. Przeciągnij go do sekcji — na kanwie pojawia się kafelek z tagiem typu "Etykieta" i myślnikiem zamiast nazwy.
5. Kliknięcie kafelka otwiera panel właściwości (na razie tylko pole nazwy i przełącznik widoczności — to zakres Taska 4).

- [ ] **Step 8: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper
git add warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx
git commit -m "$(cat <<'EOF'
feat(creator): FEATURE-156 add the label field type to the palette

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Panel właściwości etykiety (tekst, kolor, rozmiar)

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (stała po `FIELD_TYPES`, `FieldPropertyPanel` ~linia 564-580)
- Modify: `warhammer-battle-helper-front/src/style.css` (nowe klasy swatchy, dopisz na końcu bloku `.creator__…`)

**Interfaces:**
- Consumes: pole z Taska 3 (`text`, `textColor`, `textSize`), klucze i18n z Taska 2.
- Produces: `field.textColor` zawsze jako hex z `LABEL_COLORS` albo `''`; `field.textSize` zawsze jedna z czterech wartości. Task 5 renderuje je bez dodatkowej walidacji.

- [ ] **Step 1: Dodaj stałą palety kolorów**

Zaraz za tablicą `PALETTE_GROUPS` (~linia 108):

```jsx
// Label colours (FEATURE-156). A fixed set, not a free colour picker: the character sheet sits on a
// light cream background, so an unrestricted picker lets a GM choose white and make the text vanish.
// The hex is what gets stored — not an index — so reordering this list never repaints existing templates.
const LABEL_COLORS = ['#3a2f1f', '#7a5c42', '#c9975b', '#8b2c2c', '#3f6b3f', '#2f4a6b', '#5c3a6b', '#4a4a4a'];
```

- [ ] **Step 2: Zamień podpis pola nazwy dla typu `label`**

W `FieldPropertyPanel` (~linia 572) zamień istniejący TextField na wariant zależny od typu:

```jsx
      <TextField size="small" fullWidth
        label={field.type === 'label' ? t('creator.labelInternalName') : t('creator.fieldLabel')}
        helperText={field.type === 'label' ? t('creator.labelInternalNameHint') : undefined}
        value={field.label}
        onChange={e => up({ label: e.target.value })}
        sx={{ mb: 1.5 }} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' } }} />
```

Po polsku `creator.fieldLabel` brzmi "Etykieta" — czyli tak samo jak nazwa nowego typu pola. Bez tej podmiany panel etykiety miałby pole "Etykieta" wewnątrz pola "Etykieta".

- [ ] **Step 3: Dodaj blok właściwości etykiety**

Bezpośrednio pod TextField-em z Kroku 2, przed blokiem `abbr`:

```jsx
      {field.type === 'label' && (
        <>
          <TextField size="small" fullWidth multiline rows={3}
            label={t('creator.labelText')}
            helperText={t('creator.labelTextHint')}
            value={field.text || ''}
            onChange={e => up({ text: e.target.value })}
            sx={{ mb: 1.5 }} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' } }} />

          <Typography variant="caption" sx={{ color: 'primary.main', display: 'block', mb: 0.75, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('creator.labelColor')}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
            {LABEL_COLORS.map(hex => (
              <button
                key={hex}
                type="button"
                aria-label={hex}
                className={`creator__label-swatch${(field.textColor || LABEL_COLORS[0]) === hex ? ' creator__label-swatch--active' : ''}`}
                style={{ background: hex }}
                onClick={() => up({ textColor: hex })}
              />
            ))}
          </Box>

          <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
            <InputLabel>{t('creator.labelSize')}</InputLabel>
            <Select
              label={t('creator.labelSize')}
              value={field.textSize || 'normal'}
              onChange={e => up({ textSize: e.target.value })}
            >
              <MenuItem value="small">{t('creator.labelSizeSmall')}</MenuItem>
              <MenuItem value="normal">{t('creator.labelSizeNormal')}</MenuItem>
              <MenuItem value="large">{t('creator.labelSizeLarge')}</MenuItem>
              <MenuItem value="heading">{t('creator.labelSizeHeading')}</MenuItem>
            </Select>
          </FormControl>
        </>
      )}
```

Wszystkie użyte komponenty MUI (`TextField`, `Box`, `Typography`, `FormControl`, `InputLabel`, `Select`, `MenuItem`) są już zaimportowane w tym pliku — nie dodawaj importów.

- [ ] **Step 4: Dodaj style swatchy**

Dopisz w `warhammer-battle-helper-front/src/style.css` przy pozostałych klasach `.creator__`:

```css
.creator__label-swatch {
    width: 26px;
    height: 26px;
    border-radius: 4px;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    transition: transform 0.12s, border-color 0.12s;
}

.creator__label-swatch:hover {
    transform: scale(1.1);
}

.creator__label-swatch--active {
    border-color: #c9975b;
    box-shadow: 0 0 0 2px rgba(201, 151, 91, 0.35);
}
```

- [ ] **Step 5: Zbuduj front**

Run: `cd warhammer-battle-helper-front && npm run build`
Expected: `Compiled successfully`

- [ ] **Step 6: Weryfikacja ręczna — konfiguracja i trwałość zapisu**

1. Kreator → zaznacz pole etykiety dodane w Tasku 3.
2. Panel właściwości pokazuje: **Nazwa (tylko kreator)** z podpowiedzią, **Tekst** (3 linie), rząd 8 swatchy, listę **Wielkość czcionki**, przełącznik widoczności dla gracza.
3. Wpisz tekst wieloliniowy, wybierz czerwony swatch (`#8b2c2c`), rozmiar "Nagłówek".
4. Zapisz szablon, **przeładuj stronę**, otwórz szablon ponownie — tekst, kolor i rozmiar są te same.

Krok 4 to właściwy test tego zadania: dowodzi, że wartości przeszły przez `PATCH /templates/:id`, model Go i z powrotem. Gdyby pola z Taska 1 nie istniały, zapis wyglądałby na udany, a po przeładowaniu wartości by zniknęły.

- [ ] **Step 7: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper
git add warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx \
        warhammer-battle-helper-front/src/style.css
git commit -m "$(cat <<'EOF'
feat(creator): FEATURE-156 add text, colour and size options to label fields

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Render etykiety na karcie postaci

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (switch po `field.type`, `case 'text_long'` kończy się ~linia 577)
- Modify: `warhammer-battle-helper-front/src/style.css` (przy `.custom-sheet__field-label`, ~linia 7707)

**Interfaces:**
- Consumes: `field.text`, `field.textColor`, `field.textSize` zapisane przez Task 4.
- Produces: nic dla kolejnych zadań — to ostatnie zadanie planu.

- [ ] **Step 1: Dodaj `case 'label'` do switcha**

W `CustomSheetBody.jsx`, zaraz za `case 'text_long'` (kończy się ~linia 577), przed `case 'checkbox'`:

```jsx
      // A label renders template text only — it has no per-character value, hence no <label>
      // element (there is no control to label) and no onChange path.
      case 'label':
        return (
          <div key={field.key} className="custom-sheet__field custom-sheet__field--label">
            <div
              className={`custom-sheet__label-text custom-sheet__label-text--${field.textSize || 'normal'}`}
              style={field.textColor ? { color: field.textColor } : undefined}
            >
              {field.text}
            </div>
          </div>
        );
```

`field.text` wstawiony jako dziecko JSX jest escapowany przez Reacta. Nie zamieniaj tego na `dangerouslySetInnerHTML` — treść pisze MG, ale ogląda ją każdy gracz w sesji.

- [ ] **Step 2: Dodaj style tekstu etykiety**

W `style.css`, zaraz za regułą `.custom-sheet__field-label` (~linia 7707-7715):

```css
.custom-sheet__field--label {
    justify-content: center;
}

.custom-sheet__label-text {
    font-family: 'Crimson Text', serif;
    color: #3a2f1f;
    white-space: pre-wrap;
    word-break: break-word;
}

.custom-sheet__label-text--small {
    font-size: 0.8rem;
}

.custom-sheet__label-text--normal {
    font-size: 0.95rem;
}

.custom-sheet__label-text--large {
    font-size: 1.2rem;
}

.custom-sheet__label-text--heading {
    font-size: 1.45rem;
    font-family: 'Cinzel', serif;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}
```

`white-space: pre-wrap` zachowuje `\n` z textarei; `word-break: break-word` chroni grid 3-kolumnowy przed rozepchnięciem przez jedno długie słowo.

- [ ] **Step 3: Zbuduj front**

Run: `cd warhammer-battle-helper-front && npm run build`
Expected: `Compiled successfully`

- [ ] **Step 4: Weryfikacja ręczna — podgląd kreatora**

1. Kreator → pole etykiety z Taska 4.
2. Podgląd karty (kanwa kreatora renderuje ten sam `CustomSheetBody`) pokazuje tekst w wybranym kolorze i rozmiarze.
3. Zmień rozmiar na "Mała" i kolor na zielony — podgląd reaguje natychmiast, bez zapisu.
4. Wpisz w tekst dwie linie oddzielone Enterem — podgląd łamie linię.
5. Wpisz jedno słowo długości ~40 znaków bez spacji w sekcji 3-kolumnowej — kolumny nie rozjeżdżają się, słowo się łamie.

- [ ] **Step 5: Weryfikacja ręczna — prawdziwa karta postaci**

1. Zapisz szablon. Utwórz **nową grę** na tym szablonie (nowa gra bierze świeżą kopię — patrz punkt 3).
2. Dodaj postać, otwórz jej kartę — etykieta jest widoczna w swojej sekcji.
3. W istniejącej, wcześniej utworzonej grze na tym samym szablonie karta **nie** pokazuje zmian, dopóki MG nie kliknie synchronizacji szablonu w lobby (`POST /games/:id/syncTemplate`). Po synchronizacji pokazuje. To zamierzone: gra trzyma osadzoną kopię szablonu (`models/Game.go:59`).
4. Otwórz kartę postaci utworzonej **przed** dodaniem etykiety — etykieta jest, a pozostałe wartości (atrybuty, umiejętności) bez zmian.

- [ ] **Step 6: Uruchom pełną weryfikację obu stron**

Run:
```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper/warhammer-battle-helper-backend && go test ./internal/... && \
cd ../warhammer-battle-helper-front && npm run build
```
Expected: testy Go `ok`, build frontu `Compiled successfully`

- [ ] **Step 7: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper
git add warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx \
        warhammer-battle-helper-front/src/style.css
git commit -m "$(cat <<'EOF'
feat(sheet): FEATURE-156 render label fields on the custom character sheet

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Poza zakresem (świadomie)

- **Egzekwowanie `showToPlayer`.** Flaga jest dziś w całym projekcie tylko zapisywana — żaden kod front ani backend jej nie honoruje. Etykieta zapisuje ją tak jak każde inne pole. Zrobienie filtra wyłącznie dla etykiet dałoby przełącznik działający przy jednym typie pola i martwy przy dziesięciu innych; zrobione porządnie jest to zadanie backendowe (wzorzec: `internal/service/token_masking.go`). Osobny feature.
- **Nadpisywanie treści etykiety per-postać.** Do tego służy `text_long` z wartością domyślną (FEATURE-158).
- **Testy renderujące komponenty React.** Repo ich nie ma (testy jednostkowe wyłącznie przy czystych funkcjach w `src/utils/`), a ten feature nie wnosi logiki, która by je uzasadniała.
- **Test end-to-end w `test/`.** Koszt setupu przewyższa ryzyko przy zmianie tej wielkości.
