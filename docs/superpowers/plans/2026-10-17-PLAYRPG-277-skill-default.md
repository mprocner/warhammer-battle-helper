# PLAYRPG-277 Skill Default Value Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GM może nadać każdej predefiniowanej umiejętności `skill_table` wartość startową, którą nowa postać dostaje jako base umiejętności.

**Architecture:** `SkillOption` dostaje `Default *int`. `SeedDefaults` (wywoływane tylko przy Create postaci) wpisuje `Skills["<fieldKey>.<opt.id>"] = {Base: default}`, chyba że base jest pochodny od atrybutu. Warunek „base pochodny” wydzielony do jednego helpera po każdej stronie (Go: `skillBaseDerived`, JS: `isSkillBaseDerived`). Kreator: input liczbowy w każdym wierszu `SkillOptionsEditor`, ukryty w trybie pochodnym.

**Tech Stack:** Go (mongo-driver bson), React + i18next, Jest/RTL (CRA).

**Spec:** `docs/superpowers/specs/PLAYRPG-277.md`

## Global Constraints

- Praca na `main`, bez worktree. Przed każdym commitem sprawdź gałąź w tym samym poleceniu: `git branch --show-current && git commit ...`.
- Komentarze w kodzie wyłącznie po angielsku.
- Żadnych stringów w JSX — tylko `t('klucz')`, klucze w `locales/en/translation.json` i `locales/pl/translation.json` równolegle.
- `nil`/`null` = brak defaultu (brak wpisu w stats); `0` = prawdziwa wartość.
- Liczby w kreatorze obcinane do int (`Math.trunc`) — ułamek 400-uje cały PATCH szablonu, a `saveTemplate` połyka błąd po cichu.
- Wartości `default` w szablonie NIE są czyszczone przy włączeniu `baseFromAttr`.
- Testy frontu: `CI=true npm test -- --watchAll=false --testPathPattern=<nazwa>` z `warhammer-battle-helper-front/`. Baseline fail: `App.test.js` (axios ESM) — nie regresja.
- Testy backendu: `go test ./internal/systems/custom/...` z `warhammer-battle-helper-backend/`.
- Każdy commit kończy się liniami:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj
  ```

---

### Task 1: Backend — model, helper `skillBaseDerived`, seeding

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go:10-18` (`SkillOption`)
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/plugin.go:63-99` (`SeedDefaults`), `plugin.go:289-293` (`resolveRollConfig`, gałąź `skill_table`)
- Test: `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go` (sekcja `SeedDefaults (FEATURE-158)`, od linii ~1346)

**Interfaces:**
- Produces: `models.SkillOption.Default *int` (json/bson `default`, omitempty) — front wysyła/czyta `skills[i].default`.
- Produces: `func skillBaseDerived(field models.FieldDef) bool` w pakiecie `custom`.

- [ ] **Step 1: Write the failing tests**

Dopisz w `roller_test.go` na końcu sekcji `SeedDefaults` (po `TestSeedDefaults_NilTemplateIsANoOp`):

```go
// skillTableField builds a skill_table field with the given options and no flags set.
func skillTableField(opts ...models.SkillOption) models.FieldDef {
	return models.FieldDef{Key: "tbl_1", Type: "skill_table", Skills: opts}
}

func TestSeedDefaults_SkillTableSeedsBaseAdvancesStayZero(t *testing.T) {
	s := seedBlank(t, seedTemplate(skillTableField(
		models.SkillOption{ID: "skill_a", Label: "Athletics", Default: intPtr(25)},
	)))

	sv, ok := s.Skills["tbl_1.skill_a"]
	if !ok {
		t.Fatal("expected Skills[\"tbl_1.skill_a\"] to be seeded")
	}
	if sv.Base != 25 {
		t.Errorf("base = %d, want 25", sv.Base)
	}
	if sv.Advances != 0 {
		t.Errorf("advances = %d, want 0", sv.Advances)
	}
}

func TestSeedDefaults_SkillTableZeroIsSeeded(t *testing.T) {
	s := seedBlank(t, seedTemplate(skillTableField(
		models.SkillOption{ID: "skill_a", Label: "Athletics", Default: intPtr(0)},
	)))

	if _, ok := s.Skills["tbl_1.skill_a"]; !ok {
		t.Fatal("a default of 0 must still create the key — nil and zero are different states")
	}
}

func TestSeedDefaults_SkillTableNilDefaultLeavesKeyAbsent(t *testing.T) {
	s := seedBlank(t, seedTemplate(skillTableField(
		models.SkillOption{ID: "skill_a", Label: "Athletics", Default: intPtr(10)},
		models.SkillOption{ID: "skill_b", Label: "Swim"},
	)))

	if _, ok := s.Skills["tbl_1.skill_b"]; ok {
		t.Error("an option without a Default must not be seeded")
	}
	if s.Skills["tbl_1.skill_a"].Base != 10 {
		t.Errorf("sibling option lost its default: %v", s.Skills)
	}
}

func TestSeedDefaults_SkillTableDerivedBaseIsNotSeeded(t *testing.T) {
	field := skillTableField(models.SkillOption{ID: "skill_a", Label: "Athletics", Attr: "attr_s", Default: intPtr(25)})
	field.HasAdvances, field.AssignAttrToSkill, field.BaseFromAttr = true, true, true

	s := seedBlank(t, seedTemplate(field))

	if _, ok := s.Skills["tbl_1.skill_a"]; ok {
		t.Error("a derived base comes from the attribute; seeding it would write a value nothing reads")
	}
}

// Before PLAYRPG-277 the loop skipped every field whose own Default was nil, which is every
// skill_table. Attr and number fields next to a table must keep being seeded.
func TestSeedDefaults_SkillTableAlongsideAttrAndNumber(t *testing.T) {
	s := seedBlank(t, seedTemplate(
		models.FieldDef{Key: "attr_1", Type: "attr", Default: intPtr(5)},
		skillTableField(models.SkillOption{ID: "skill_a", Label: "Athletics", Default: intPtr(25)}),
		models.FieldDef{Key: "num_1", Type: "number", Default: intPtr(7)},
	))

	if s.Attributes["attr_1"].Base != 5 {
		t.Errorf("attr_1 base = %d, want 5", s.Attributes["attr_1"].Base)
	}
	if s.Numbers["num_1"] != 7 {
		t.Errorf("num_1 = %d, want 7", s.Numbers["num_1"])
	}
	if s.Skills["tbl_1.skill_a"].Base != 25 {
		t.Errorf("tbl_1.skill_a base = %d, want 25", s.Skills["tbl_1.skill_a"].Base)
	}
}

func TestSkillBaseDerived(t *testing.T) {
	cases := []struct {
		name                      string
		advances, assign, fromAttr bool
		want                      bool
	}{
		{"all three", true, true, true, true},
		{"no advances column", false, true, true, false},
		{"no attribute assignment", true, false, true, false},
		{"flag off", true, true, false, false},
		{"nothing set", false, false, false, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := models.FieldDef{Type: "skill_table", HasAdvances: c.advances, AssignAttrToSkill: c.assign, BaseFromAttr: c.fromAttr}
			if got := skillBaseDerived(f); got != c.want {
				t.Errorf("skillBaseDerived = %v, want %v", got, c.want)
			}
		})
	}
}
```

W istniejącym `TestSeedDefaults_OtherTypesIgnored` (pole `tbl_1` typu `skill_table` z field-level `Default`) dopisz przed zamykającym `}`:

```go
	if len(s.Skills) != 0 {
		t.Errorf("Skills = %v, want empty — a skill_table's own Default means nothing", s.Skills)
	}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -run 'SeedDefaults|SkillBaseDerived'`
Expected: FAIL kompilacji — `unknown field Default in struct literal of type models.SkillOption` oraz `undefined: skillBaseDerived`.

- [ ] **Step 3: Add the model field**

`internal/models/SystemTemplate.go` — zastąp `SkillOption` i jego komentarz:

```go
// SkillOption is one skill row of a "skill_table" field. ID is a stable, GM-opaque key
// generated once when the option is created; it never derives from Label, so renaming a
// skill does not orphan the value a player stored under "<fieldKey>.<id>". Attr links the
// skill to an attribute (empty unless the field has assignAttrToSkill enabled). Default is
// the base a freshly created character starts with (PLAYRPG-277); nil means "no default",
// which is not the same as a default of 0. It is ignored while the field derives the base
// from the attribute.
type SkillOption struct {
	ID      string `bson:"id" json:"id"`
	Label   string `bson:"label" json:"label"`
	Attr    string `bson:"attr,omitempty" json:"attr,omitempty"`
	Default *int   `bson:"default,omitempty" json:"default,omitempty"`
}
```

- [ ] **Step 4: Add `skillBaseDerived` and use it in the roller**

`internal/systems/custom/plugin.go` — dodaj nad `flattenFields`:

```go
// skillBaseDerived reports whether a skill_table takes each skill's base from the linked
// attribute instead of the stored value. The flag only means anything with both
// preconditions; a hand-edited template can carry it without them, and deriving a base for a
// field with no advances column would replace the player's stored value with the attribute
// behind their back. Mirrored in the front end by isSkillBaseDerived (systems/custom/skillLayout.js).
func skillBaseDerived(field models.FieldDef) bool {
	return field.BaseFromAttr && field.AssignAttrToSkill && field.HasAdvances
}
```

W `resolveRollConfig` zastąp blok (obecnie `plugin.go:289-293`):

```go
				// The flag only means anything with both preconditions; a hand-edited template can
				// carry it without them, and deriving a base for a field with no advances column
				// would replace the player's stored value with the attribute behind their back.
				derived := field.BaseFromAttr && field.AssignAttrToSkill && field.HasAdvances
				return rollTarget{cfg: field.RollConfig, linkedAttr: linkedAttr, baseFromAttr: derived, fieldType: "skill_table"}, nil
```

na:

```go
				return rollTarget{cfg: field.RollConfig, linkedAttr: linkedAttr, baseFromAttr: skillBaseDerived(field), fieldType: "skill_table"}, nil
```

- [ ] **Step 5: Extend `SeedDefaults`**

Zastąp komentarz i ciało `SeedDefaults` (`plugin.go:63-99`):

```go
// SeedDefaults writes the template's defaults into a stats document, which is how a freshly
// created character starts with GM-chosen values instead of blanks (FEATURE-158). Attr fields
// land in Attributes[key].Base with Advances left at 0 — advances are earned in play, not
// granted at creation — so a later ComputeDerived sets current = base. Number fields land in
// Numbers[key]. Each skill_table option with a Default lands in Skills["<fieldKey>.<id>"].Base
// (PLAYRPG-277), unless the table derives its base from the attribute (skillBaseDerived), in
// which case nothing reads a stored base. A nil Default means "no default", which is not the
// same as a default of 0; every other field type is left untouched.
//
// This hangs off *Plugin rather than the systems.GameSystem interface for the same reason as
// RollWithTemplate: only the custom system has a template to read.
func (p *Plugin) SeedDefaults(raw bson.Raw, tmpl *models.SystemTemplate) (bson.Raw, error) {
	if tmpl == nil {
		return raw, nil
	}
	s, err := decodeStats(raw)
	if err != nil {
		return raw, err
	}
	if s.Numbers == nil {
		s.Numbers = map[string]int{}
	}
	if s.Skills == nil {
		s.Skills = map[string]AttrValue{}
	}
	for _, section := range tmpl.Sections {
		for _, field := range flattenFields(section.Fields) {
			switch field.Type {
			case "attr":
				if field.Default != nil {
					s.Attributes[field.Key] = AttrValue{Base: *field.Default}
				}
			case "number":
				if field.Default != nil {
					s.Numbers[field.Key] = *field.Default
				}
			case "skill_table":
				if skillBaseDerived(field) {
					continue
				}
				for _, opt := range field.Skills {
					if opt.Default != nil {
						s.Skills[field.Key+"."+opt.ID] = AttrValue{Base: *opt.Default}
					}
				}
			}
		}
	}
	out, err := bson.Marshal(s)
	if err != nil {
		return raw, err
	}
	return out, nil
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/... && go vet ./internal/...`
Expected: `ok` dla pakietu `custom`, brak ostrzeżeń vet.

Run: `cd warhammer-battle-helper-backend && go test ./...`
Expected: wszystkie pakiety `ok` (zmiana modelu nie łamie handlerów/serwisu).

- [ ] **Step 7: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && git add warhammer-battle-helper-backend/internal/models/SystemTemplate.go warhammer-battle-helper-backend/internal/systems/custom/plugin.go warhammer-battle-helper-backend/internal/systems/custom/roller_test.go && git commit -m "feat: PLAYRPG-277 seed skill_table option defaults on character create

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 2: Frontend — default input in `SkillOptionsEditor`, tutorial text

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/skillLayout.js:205-212` (`resolveSkillValues` + nowy eksport `isSkillBaseDerived`)
- Modify: `warhammer-battle-helper-front/src/components/creator/AttrRowsEditor.jsx:28` (eksport `toInt`)
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:248-306` (`SkillOptionsEditor`), `:848-856` (wywołanie), importy na górze
- Modify: `warhammer-battle-helper-front/src/style.css` (po `.creator__option-attr-select:focus`, ~linia 10814)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `warhammer-battle-helper-front/src/locales/pl/translation.json`
- Test: `warhammer-battle-helper-front/src/systems/custom/skillLayout.test.js` (istniejący)
- Create: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.skillDefault.test.jsx`

**Interfaces:**
- Consumes: z Task 1 — template JSON `skills[i].default` (number, pominięty gdy brak).
- Produces: `export function isSkillBaseDerived(field): boolean` w `skillLayout.js`; `export const toInt` w `AttrRowsEditor.jsx`; `export function SkillOptionsEditor` w `TemplateBuilder.jsx` z nowym propem `baseDerived`.

- [ ] **Step 1: Write the failing tests**

W `systems/custom/skillLayout.test.js` dopisz import `isSkillBaseDerived` do istniejącego importu z `./skillLayout` i na końcu pliku:

```js
describe('isSkillBaseDerived', () => {
  it.each([
    [{ hasAdvances: true, assignAttrToSkill: true, baseFromAttr: true }, true],
    [{ hasAdvances: false, assignAttrToSkill: true, baseFromAttr: true }, false],
    [{ hasAdvances: true, assignAttrToSkill: false, baseFromAttr: true }, false],
    [{ hasAdvances: true, assignAttrToSkill: true, baseFromAttr: false }, false],
    [{}, false],
  ])('%j -> %s', (field, want) => {
    expect(isSkillBaseDerived(field)).toBe(want);
  });
});
```

Utwórz `components/creator/TemplateBuilder.skillDefault.test.jsx`:

```jsx
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import i18n from '../../i18n';
import { SkillOptionsEditor } from './TemplateBuilder';

// Importing TemplateBuilder pulls in api/axios and, through the system registry, axios itself —
// the ESM import jest cannot parse. Mocking the instance is enough to load the module.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const skills = [{ id: 'skill_a', label: 'Athletics', attr: '', default: 25 }];

const setup = (props = {}) => {
  const onChange = jest.fn();
  render(<SkillOptionsEditor label="Skills" skills={skills} onChange={onChange} {...props} />);
  return onChange;
};

const rowDefault = (label = 'Athletics') =>
  screen.getByLabelText(i18n.t('creator.skillDefaultAria', { skill: label }));
const draftDefault = () => screen.getByLabelText(i18n.t('creator.skillDefaultDraftAria'));

test('shows the stored default', () => {
  setup();
  expect(rowDefault()).toHaveValue(25);
});

test('editing the default stores an integer', () => {
  const onChange = setup();
  fireEvent.change(rowDefault(), { target: { value: '40' } });
  expect(onChange.mock.calls[0][0][0]).toMatchObject({ id: 'skill_a', default: 40 });
});

test('a decimal is truncated — a fraction 400s the whole template PATCH', () => {
  const onChange = setup();
  fireEvent.change(rowDefault(), { target: { value: '12.7' } });
  expect(onChange.mock.calls[0][0][0].default).toBe(12);
});

test('clearing the input means "no default", not 0', () => {
  const onChange = setup();
  fireEvent.change(rowDefault(), { target: { value: '' } });
  expect(onChange.mock.calls[0][0][0].default).toBeNull();
});

test('a new skill carries the draft default', () => {
  const onChange = setup();
  fireEvent.change(screen.getByPlaceholderText(i18n.t('creator.optionsAddPlaceholder')), { target: { value: 'Swim' } });
  fireEvent.change(draftDefault(), { target: { value: '15' } });
  fireEvent.click(screen.getByLabelText(i18n.t('creator.skillAddAria')));
  const added = onChange.mock.calls[0][0][1];
  expect(added).toMatchObject({ label: 'Swim', default: 15 });
  expect(added.id).toMatch(/^skill_/);
});

test('a new skill without a draft default has no default key', () => {
  const onChange = setup();
  fireEvent.change(screen.getByPlaceholderText(i18n.t('creator.optionsAddPlaceholder')), { target: { value: 'Swim' } });
  fireEvent.click(screen.getByLabelText(i18n.t('creator.skillAddAria')));
  expect(onChange.mock.calls[0][0][1]).not.toHaveProperty('default');
});

test('with a derived base the default inputs are hidden, the stored value untouched', () => {
  const onChange = setup({ baseDerived: true });
  expect(screen.queryByLabelText(i18n.t('creator.skillDefaultAria', { skill: 'Athletics' }))).toBeNull();
  expect(screen.queryByLabelText(i18n.t('creator.skillDefaultDraftAria'))).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='skillLayout.test|skillDefault'`
Expected: FAIL — `isSkillBaseDerived is not a function` oraz `SkillOptionsEditor` undefined (`Element type is invalid`).

- [ ] **Step 3: Add `isSkillBaseDerived` in `skillLayout.js`**

Nad `resolveSkillValues` dodaj:

```js
// isSkillBaseDerived reports whether a skill_table takes each skill's base from the linked
// attribute. The flag is meaningless without both preconditions, and a hand-edited template can
// carry it without them. The creator enforces them; this is the second line of defence.
// Mirrors skillBaseDerived in internal/systems/custom/plugin.go.
export function isSkillBaseDerived(field) {
  return !!field.baseFromAttr && !!field.assignAttrToSkill && !!field.hasAdvances;
}
```

W `resolveSkillValues` zastąp:

```js
  // The flag is meaningless without both preconditions, and a hand-edited template can carry it
  // without them. The creator enforces them; this is the second line of defence.
  const derived = !!field.baseFromAttr && !!field.assignAttrToSkill && !!field.hasAdvances;
```

na:

```js
  const derived = isSkillBaseDerived(field);
```

- [ ] **Step 4: Export `toInt` from `AttrRowsEditor.jsx`**

Linia 28:

```js
export const toInt = (raw) => (raw === '' ? null : Math.trunc(Number(raw)));
```

- [ ] **Step 5: Extend `SkillOptionsEditor`**

W `TemplateBuilder.jsx` zmień importy:

```js
import AttrRowsEditor, { toInt } from './AttrRowsEditor';
```

```js
import { collectSkillOptions, isSkillBaseDerived } from '../../systems/custom/skillLayout';
```

Zastąp cały blok `// ── SkillOptionsEditor ──` (komentarz + funkcja, linie ~248-306):

```jsx
// ── SkillOptionsEditor ───────────────────────────────────────────────────────

// Skill rows for a "skill_table" field. Each row is { id, label, attr?, default? }: id is a stable
// key minted once (never derived from label), so renaming a skill keeps the player's stored value
// under "<fieldKey>.<id>". attr is only edited when the field has assignAttrToSkill enabled.
// default is the base a new character starts with (PLAYRPG-277; seeded by SeedDefaults). It is
// hidden while baseDerived, because the base then comes from the attribute — but never cleared,
// so toggling the derived mode back and forth keeps what the GM typed.
export function SkillOptionsEditor({ label, skills, onChange, assignAttrToSkill = false, numberFields = [], baseDerived = false }) {
  const { t } = useTranslation();
  const [draftLabel,   setDraftLabel]   = useState('');
  const [draftAttr,    setDraftAttr]    = useState('');
  const [draftDefault, setDraftDefault] = useState('');
  const list = skills || [];

  const commit = () => {
    if (!draftLabel.trim()) return;
    const opt = { id: genId('skill'), label: draftLabel.trim(), attr: assignAttrToSkill ? draftAttr : '' };
    const def = baseDerived ? null : toInt(draftDefault);
    onChange([...list, def === null ? opt : { ...opt, default: def }]);
    setDraftLabel(''); setDraftAttr(''); setDraftDefault('');
  };
  const update = (i, patch) => onChange(list.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className="creator__options-editor">
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>{label}</Typography>
      <div className="creator__options-list">
        {list.map((opt, i) => (
          <div key={opt.id} className="creator__option-row">
            <input className="creator__option-input" value={opt.label} onChange={e => update(i, { label: e.target.value })} />
            {!baseDerived && (
              <input
                className="creator__option-default-input"
                type="number"
                step={1}
                value={opt.default ?? ''}
                placeholder={t('creator.skillDefaultPlaceholder')}
                aria-label={t('creator.skillDefaultAria', { skill: opt.label })}
                onChange={e => update(i, { default: toInt(e.target.value) })}
              />
            )}
            {assignAttrToSkill && (
              <select className="creator__option-attr-select" value={opt.attr || ''} onChange={e => update(i, { attr: e.target.value })}>
                <option value="">{t('creator.optionsNoAttr')}</option>
                {numberFields.map(f => <option key={f.key} value={f.key}>{f.abbr || f.label}</option>)}
              </select>
            )}
            <button className="creator__option-del" onClick={() => onChange(list.filter((_, j) => j !== i))}><DeleteIcon style={{ fontSize: 13 }} /></button>
          </div>
        ))}
      </div>
      <div className="creator__options-add">
        <input
          className="creator__option-input"
          value={draftLabel}
          onChange={e => setDraftLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); }}
          placeholder={t('creator.optionsAddPlaceholder')}
        />
        {!baseDerived && (
          <input
            className="creator__option-default-input"
            type="number"
            step={1}
            value={draftDefault}
            placeholder={t('creator.skillDefaultPlaceholder')}
            aria-label={t('creator.skillDefaultDraftAria')}
            onChange={e => setDraftDefault(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commit(); }}
          />
        )}
        {assignAttrToSkill && (
          <select className="creator__option-attr-select" value={draftAttr} onChange={e => setDraftAttr(e.target.value)}>
            <option value="">{t('creator.optionsNoAttr')}</option>
            {numberFields.map(f => <option key={f.key} value={f.key}>{f.abbr || f.label}</option>)}
          </select>
        )}
        <button className="creator__option-add-btn" onClick={commit} aria-label={t('creator.skillAddAria')}>
          <AddIcon style={{ fontSize: 13 }} />
        </button>
      </div>
    </div>
  );
}
```

Uwaga: `toInt` dla wiersza zwraca `null` przy pustym inpucie — `default: null` w JSON, a Go `*int` odczyta to jako `nil`, `omitempty` nie zapisze go w Mongo. Draft nie dopisuje klucza w ogóle (test „no default key”).

W wywołaniu (`field.type === 'skill_table'`, ~linia 849) dodaj prop:

```jsx
            <SkillOptionsEditor
              label={t('creator.skillTableSkills')}
              skills={field.skills || []}
              onChange={skills => up({ skills })}
              assignAttrToSkill={!!field.assignAttrToSkill}
              numberFields={numberFields}
              baseDerived={isSkillBaseDerived(field)}
            />
```

- [ ] **Step 6: Add i18n keys**

`locales/en/translation.json`, w obiekcie `creator`, zaraz po `"skillTableSkills": "Skills",`:

```json
    "skillDefaultPlaceholder": "Start",
    "skillDefaultAria": "Starting value – {{skill}}",
    "skillDefaultDraftAria": "Starting value of the new skill",
    "skillAddAria": "Add skill",
```

`locales/pl/translation.json`, po `"skillTableSkills": "Umiejętności",`:

```json
    "skillDefaultPlaceholder": "Start",
    "skillDefaultAria": "Wartość startowa – {{skill}}",
    "skillDefaultDraftAria": "Wartość startowa nowej umiejętności",
    "skillAddAria": "Dodaj umiejętność",
```

Zmień `tutorial.creatorField.content.body.skill_table`:
- en: `"The skills on the list with an optional starting value, optionally linked to an attribute, and whether players may add their own."`
- pl: `"Umiejętności na liście z opcjonalną wartością startową, opcjonalnie powiązane z atrybutem, oraz to, czy gracze mogą dodawać własne."`

Sprawdź poprawność JSON: `node -e "for (const l of ['en','pl']) JSON.parse(require('fs').readFileSync('warhammer-battle-helper-front/src/locales/'+l+'/translation.json'))"` (z katalogu repo) — brak wyjątku.

- [ ] **Step 7: Add CSS**

`style.css`, po bloku `.creator__option-attr-select:focus { ... }`:

```css
/* Starting value of a skill_table option (PLAYRPG-277): narrow, sits between the label and the
   attribute select. */
.creator__option-default-input {
    width: 56px;
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(201, 151, 91, 0.3);
    border-radius: 3px;
    padding: 4px 6px;
    font-size: 0.85rem;
    color: #3d2b1a;
    font-family: 'Crimson Text', serif;
}

.creator__option-default-input:focus {
    outline: none;
    border-color: #c9975b;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='skillLayout|skillDefault|skillFlags|tourTranslations|creatorTour'`
Expected: wszystkie PASS.

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: jedyny fail to baseline `App.test.js` (axios ESM).

Run: `cd warhammer-battle-helper-front && npx eslint src/components/creator/TemplateBuilder.jsx src/components/creator/AttrRowsEditor.jsx src/systems/custom/skillLayout.js src/components/creator/TemplateBuilder.skillDefault.test.jsx`
Expected: brak błędów.

- [ ] **Step 9: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && git branch --show-current && git add warhammer-battle-helper-front/src/systems/custom/skillLayout.js warhammer-battle-helper-front/src/systems/custom/skillLayout.test.js warhammer-battle-helper-front/src/components/creator/AttrRowsEditor.jsx warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx warhammer-battle-helper-front/src/components/creator/TemplateBuilder.skillDefault.test.jsx warhammer-battle-helper-front/src/style.css warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json && git commit -m "feat: PLAYRPG-277 starting value input for skill_table skills in the creator

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

Nie dodawaj `nginx.conf` ani `package-lock.json` — to niezwiązane lokalne zmiany użytkownika.

---

### Task 3: End-to-end check on the local stack

**Files:** brak zmian.

- [ ] **Step 1: Verify via API**

Wg memory `local-e2e-verification-recipe` zdobądź JWT na lokalnym dockerze. Następnie:
1. PATCH szablonu custom: pole `skill_table` z opcjami `{id:"skill_a",label:"Athletics",default:25}` i `{id:"skill_b",label:"Swim"}`.
2. POST postaci z tym szablonem.
3. GET postaci — oczekiwane: `stats.skills["<fieldKey>.skill_a"].base == 25`, brak klucza `skill_b`.
4. Włącz na polu `hasAdvances + assignAttrToSkill + baseFromAttr`, utwórz drugą postać — oczekiwane: brak `skill_a` w `stats.skills`, a `default: 25` nadal w szablonie.

- [ ] **Step 2: Report**

Podaj wyniki curl użytkownikowi; klik w UI kreatora zostawiamy użytkownikowi (memory `user-tests-in-browser`).
