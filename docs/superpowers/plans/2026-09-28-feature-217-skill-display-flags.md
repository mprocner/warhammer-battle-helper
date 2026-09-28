# FEATURE-217 — Flagi wyświetlania tabeli i drzewa umiejętności — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać MG pięć przełączników konfiguracji pola `skill_table` / `skill_tree` (gwiazdka ulubionych, znacznik „do rozwoju", layout 2-kolumnowy, sortowanie alfabetyczne, dodawanie umiejętności przez gracza) i zrealizować ich działanie na karcie postaci, w drzewie oraz w kreatorze.

**Architecture:** Cztery nowe booly w `models.FieldDef` + jedno pole w `custom.Stats`. Cała arytmetyka układu (szablon siatki, scalanie i sortowanie wierszy, podział na kolumny, waga poddrzewa) ląduje w nowym, czysto funkcyjnym module `systems/custom/skillLayout.js` — testowalnym bez jsdom, który nie liczy layoutu. `CustomSheetBody.jsx` tylko wywołuje te helpery i renderuje. Kreator montuje ten sam `CustomSheetBody`, więc afordanse bez żywych handlerów renderują się statycznie przez przemianowany prop `showAffordances`.

**Tech Stack:** Go 1.x + MongoDB (bson), React 18 + react-i18next, MUI icons, Jest + React Testing Library (przez CRA), `go test`.

## Global Constraints

- Spec: `docs/superpowers/specs/FEATURE-217.md`. Każde zadanie implementuje jego fragment — przy rozbieżności spec wygrywa.
- Komentarze w kodzie **zawsze po angielsku** (backend i frontend, bez wyjątków). Dokumentacja i commit-body po polsku wolno, ale trzymamy się angielskiego w commit message subject: `feat: FEATURE-217 …`.
- Żadnych stringów wpisanych wprost w JSX — zawsze `t('klucz')`, klucze **angielskie**, tłumaczenia równolegle w `src/locales/en/translation.json` i `src/locales/pl/translation.json`.
- Ikony wyłącznie z `@mui/icons-material`.
- Tooltipy: nigdy MUI `<Tooltip>`. `CustomSheetBody` ma już `usePortalTooltip` (jedna instancja na kartę, `CustomSheetBody.jsx:280`) — używamy `showTooltip(text, el)` / `hideTooltip`.
- Kolory karty postaci: tekst `#3a2f1f`, tło inputu `#fff9f0`, ramka `#c4a882`, ramka focus / etykiety `#7a5c42`, akcent `#c9975b`. Nigdy jasny tekst na jasnym tle.
- `hideFavorites` jest **odwrócone** względem pozostałych flag (brak pola = gwiazdka widoczna). Nie „naprawiać" tej nazwy — `omitempty` na boolu zjada `false`, więc `showFavorites` byłoby nieutrwalalne.
- Frontend testy: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`. Pojedynczy plik: dopisz `--testPathPattern=<nazwa>`. Gołe `npx jest` **nie działa** (konfiguracją zarządza CRA).
- **Znany baseline fail:** `App.test.js` (axios ESM). To nie regresja — nie naprawiać, nie liczyć jako porażkę.
- Backend testy: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/...`
- Klucze umiejętności to nieprzejrzyste identyfikatory: `${field.key}.${opt.id}` w tabeli, dot-path w drzewie. Nigdy nie wyprowadzać klucza z etykiety.
- Brak backward compat dla danych — z jednym wyjątkiem opisanym powyżej (`hideFavorites`).

---

## Struktura plików

| Plik | Odpowiedzialność | Zadanie |
|---|---|---|
| `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` | cztery nowe flagi w `FieldDef` | 1 |
| `warhammer-battle-helper-backend/internal/systems/custom/character.go` | `Stats.DevelopmentSkills` | 1 |
| `warhammer-battle-helper-backend/internal/systems/custom/plugin.go` | `resolveRollConfig` — atrybut umiejętności dodanej przez gracza w tabeli | 1 |
| `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go` | testy obu powyższych | 1 |
| `warhammer-battle-helper-front/src/systems/custom/skillLayout.js` | **nowy** — czysta arytmetyka układu (siatka, wiersze, podział, waga) | 2 |
| `warhammer-battle-helper-front/src/systems/custom/skillLayout.test.js` | **nowy** — testy jednostkowe helperów | 2 |
| `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` | render tabeli i drzewa; `starAffordance`; `showAffordances` | 3–7 |
| `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTable.test.jsx` | **nowy** — render tabeli pod wszystkimi flagami | 3, 5, 6, 7 |
| `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTree.test.jsx` | istniejący — flagi w drzewie | 3, 5, 6 |
| `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.chromeSeam.test.jsx` | istniejący — `showAffordances` bez handlerów | 4 |
| `warhammer-battle-helper-front/src/systems/custom/CharacterSheet.jsx` | stan `developmentSkills` + handler | 3 |
| `warhammer-battle-helper-front/src/systems/custom/index.js` | `normalizeCharacter` — `developmentSkills` | 3 |
| `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` | grupa „Wyświetlanie" + 5 przełączników; call site `showAffordances` | 4, 8 |
| `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.skillFlags.test.jsx` | **nowy** — panel zapisuje flagi | 8 |
| `warhammer-battle-helper-front/src/style.css` | siatka wiersza, kolumna „rozwój", układ 2-kolumnowy | 3, 6 |
| `warhammer-battle-helper-front/src/locales/{en,pl}/translation.json` | nowe klucze + przeniesienie polskich stringów drzewa | 3, 7, 8 |

Nowy moduł `skillLayout.js` istnieje po to, żeby `CustomSheetBody.jsx` (dziś 1042 linie) nie spuchł o kolejne 250 linii arytmetyki — i żeby tę arytmetykę dało się przetestować bez DOM. To jedyny nowy plik produkcyjny.

---

### Task 1: Backend — flagi, `DevelopmentSkills`, atrybut umiejętności gracza w tabeli

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go:231` (blok `FieldDef`, obok `PlayerCanAddSkills`)
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/character.go:31` (struct `Stats`, obok `FavoriteSkills`)
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/plugin.go:220-231` (gałąź `skill_table` w `resolveRollConfig`)
- Test: `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go` (dopisać na końcu pliku)

**Interfaces:**
- Consumes: nic — pierwsze zadanie.
- Produces: pola JSON czytane przez front w zadaniach 3–8: `hideFavorites`, `showDevelopment`, `sortAlphabetically`, `twoColumns` (na `FieldDef`), `developmentSkills` (tablica stringów w `stats`).

- [ ] **Step 1: Napisz oba failujące testy**

Dopisz na końcu `warhammer-battle-helper-backend/internal/systems/custom/roller_test.go`:

```go
// ---------------------------------------------------------------------------
// FEATURE-217 — display flags and the development marker
// ---------------------------------------------------------------------------

// ComputeDerived round-trips stats through the Stats struct, so a key missing from the struct is
// silently dropped on the first save. DevelopmentSkills has no Go consumer at all — this test is
// the only thing standing between it and deletion by an unmarshal.
func TestComputeDerived_PreservesDevelopmentSkills(t *testing.T) {
	raw, err := bson.Marshal(bson.M{
		"attributes":        bson.M{},
		"skills":            bson.M{},
		"developmentSkills": []string{"fld_skills.opt_stealth"},
	})
	if err != nil {
		t.Fatalf("bson.Marshal: %v", err)
	}

	out, err := (&Plugin{}).ComputeDerived(raw)
	if err != nil {
		t.Fatalf("ComputeDerived: %v", err)
	}

	var got Stats
	if err := bson.Unmarshal(out, &got); err != nil {
		t.Fatalf("bson.Unmarshal: %v", err)
	}
	if !reflect.DeepEqual(got.DevelopmentSkills, []string{"fld_skills.opt_stealth"}) {
		t.Errorf("DevelopmentSkills = %v, want [fld_skills.opt_stealth]", got.DevelopmentSkills)
	}
}

// A skill the player added to a skill_table lives only in stats.CustomSkillNodes, so it matches no
// SkillOption id. Without the fallback the roll silently uses the field's default attribute, which
// is the wrong threshold in any system where each skill hangs off its own attribute.
func TestResolveRollConfig_SkillTablePlayerAddedSkillUsesItsOwnAttr(t *testing.T) {
	cfg := &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d100")}, LinkedAttr: "dex"}
	template := &models.SystemTemplate{
		Sections: []models.SectionDef{{
			Fields: []models.FieldDef{{
				Type: "skill_table", Key: "skills", Rollable: true, RollConfig: cfg,
				AssignAttrToSkill: true,
				Skills:            []models.SkillOption{{ID: "opt_stealth", Label: "Stealth", Attr: "agi"}},
			}},
		}},
	}
	stats := &Stats{CustomSkillNodes: map[string]CustomSkillNode{
		"skills.skill_9001": {Label: "Dog handling", LinkedAttr: "fel"},
	}}

	_, linkedAttr, fieldType, err := resolveRollConfig(template, stats, "skills.skill_9001")
	if err != nil {
		t.Fatalf("resolveRollConfig() error: %v", err)
	}
	if linkedAttr != "fel" || fieldType != "skill_table" {
		t.Errorf("got attr=%q type=%q, want fel/skill_table", linkedAttr, fieldType)
	}
}

// The GM-defined rows must keep resolving from the template even when the character has custom
// nodes under the same field — the fallback may not shadow a real SkillOption match.
func TestResolveRollConfig_SkillTableTemplateRowStillWins(t *testing.T) {
	cfg := &models.RollConfig{Formula: []models.FormulaBlock{diceBlock("d100")}, LinkedAttr: "dex"}
	template := &models.SystemTemplate{
		Sections: []models.SectionDef{{
			Fields: []models.FieldDef{{
				Type: "skill_table", Key: "skills", Rollable: true, RollConfig: cfg,
				AssignAttrToSkill: true,
				Skills:            []models.SkillOption{{ID: "opt_stealth", Label: "Stealth", Attr: "agi"}},
			}},
		}},
	}
	stats := &Stats{CustomSkillNodes: map[string]CustomSkillNode{
		"skills.skill_9001": {Label: "Dog handling", LinkedAttr: "fel"},
	}}

	_, linkedAttr, _, err := resolveRollConfig(template, stats, "skills.opt_stealth")
	if err != nil {
		t.Fatalf("resolveRollConfig() error: %v", err)
	}
	if linkedAttr != "agi" {
		t.Errorf("got attr=%q, want agi", linkedAttr)
	}
}
```

- [ ] **Step 2: Uruchom testy i potwierdź, że failują**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -run 'FEATURE|DevelopmentSkills|PlayerAddedSkill|TemplateRowStillWins' -v`

Expected: kompilacja pada na `got.DevelopmentSkills` — `got.DevelopmentSkills undefined (type Stats has no field or method DevelopmentSkills)`.

- [ ] **Step 3: Dodaj `DevelopmentSkills` do `Stats`**

W `warhammer-battle-helper-backend/internal/systems/custom/character.go`, zaraz po `FavoriteSkills`:

```go
	FavoriteSkills   []string                   `bson:"favoriteSkills,omitempty"  json:"favoriteSkills,omitempty"`
	// DevelopmentSkills holds the keys of skills the player has marked as used this session, to be
	// improved between sessions (the Call of Cthulhu mechanic). Keys are the same ones used in
	// Skills: "${field.key}.${opt.id}" for a skill_table row, the dot-path for a tree node.
	// No Go code reads this — it exists in the struct because ComputeDerived round-trips stats
	// through Stats, so a key absent here would be dropped on the first save.
	DevelopmentSkills []string `bson:"developmentSkills,omitempty" json:"developmentSkills,omitempty"`
```

- [ ] **Step 4: Uruchom testy — pierwszy przechodzi, drugi wciąż fail**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -run 'DevelopmentSkills|PlayerAddedSkill' -v`

Expected: `TestComputeDerived_PreservesDevelopmentSkills` PASS, `TestResolveRollConfig_SkillTablePlayerAddedSkillUsesItsOwnAttr` FAIL z `got attr="dex" type="skill_table", want fel/skill_table`.

- [ ] **Step 5: Napraw `resolveRollConfig`**

W `warhammer-battle-helper-backend/internal/systems/custom/plugin.go` zamień gałąź `skill_table` (dziś linie 220-231):

```go
			if field.Type == "skill_table" && strings.HasPrefix(skillKey, field.Key+".") && field.Rollable && field.RollConfig != nil {
				linkedAttr := field.RollConfig.LinkedAttr
				if field.AssignAttrToSkill {
					suffix := skillKey[len(field.Key)+1:]
					matched := false
					for _, opt := range field.Skills {
						if opt.ID == suffix {
							linkedAttr = opt.Attr
							matched = true
							break
						}
					}
					// A skill the player added to the table exists only in stats.CustomSkillNodes,
					// so it matches no SkillOption id. Same fallback the skill_tree branch above
					// uses — without it the roll would silently take the field-level attribute.
					if !matched && stats != nil && stats.CustomSkillNodes != nil {
						if node, ok := stats.CustomSkillNodes[skillKey]; ok && node.LinkedAttr != "" {
							linkedAttr = node.LinkedAttr
						}
					}
				}
				return field.RollConfig, linkedAttr, "skill_table", nil
			}
```

- [ ] **Step 6: Dodaj cztery flagi do `FieldDef`**

W `warhammer-battle-helper-backend/internal/models/SystemTemplate.go`, zaraz po `PlayerCanAddSkills` (linia 231):

```go
	PlayerCanAddSkills bool           `bson:"playerCanAddSkills,omitempty" json:"playerCanAddSkills,omitempty"`

	// FEATURE-217 display flags for skill_table and skill_tree.
	//
	// HideFavorites is INVERTED on purpose, unlike every other flag here: absent means the
	// favourites star IS shown, so templates written before this feature keep it without a data
	// migration. A positive "showFavorites" cannot work — omitempty drops a false bool, so the
	// GM's "off" would come back as absent and read as "on". Do not rename it to the positive form.
	HideFavorites bool `bson:"hideFavorites,omitempty" json:"hideFavorites,omitempty"`
	// ShowDevelopment adds a per-skill checkbox the player ticks for skills used this session
	// (the Call of Cthulhu improvement mechanic). Stored per character in Stats.DevelopmentSkills.
	ShowDevelopment bool `bson:"showDevelopment,omitempty" json:"showDevelopment,omitempty"`
	// SortAlphabetically orders a table's rows, or a tree's siblings within each level, by label.
	SortAlphabetically bool `bson:"sortAlphabetically,omitempty" json:"sortAlphabetically,omitempty"`
	// TwoColumns splits the field into two columns side by side. The unit of the split differs by
	// type: a table splits by row, a tree by root branch (its indent encodes hierarchy, so a
	// branch may never be torn between columns).
	TwoColumns bool `bson:"twoColumns,omitempty" json:"twoColumns,omitempty"`
```

- [ ] **Step 7: Uruchom cały pakiet**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/...`

Expected: `ok battle-helper/internal/systems/custom`, wszystkie testy PASS.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-backend/internal/models/SystemTemplate.go \
        warhammer-battle-helper-backend/internal/systems/custom/character.go \
        warhammer-battle-helper-backend/internal/systems/custom/plugin.go \
        warhammer-battle-helper-backend/internal/systems/custom/roller_test.go
git commit -m "feat: FEATURE-217 backend flags, development marker, player skill attr in tables"
```

---

### Task 2: `skillLayout.js` — czysta arytmetyka układu

**Files:**
- Create: `warhammer-battle-helper-front/src/systems/custom/skillLayout.js`
- Test: `warhammer-battle-helper-front/src/systems/custom/skillLayout.test.js`

**Interfaces:**
- Consumes: kształt `FieldDef` z zadania 1 (`sortAlphabetically`, `twoColumns`) oraz `customSkillNodes` (mapa `key → { label, linkedAttr }`).
- Produces (używane w zadaniach 3–7):
  - `skillGridTemplate({ showDevelopment, hasAdvances, showStar, showRoll, showActions }) → string`
  - `buildSkillRows(field, customSkillNodes, newKeys) → Array<{ key, label, attr, custom, isNew }>`
  - `splitHalf(rows) → [Array, Array]`
  - `subtreeSize(node, path, customSkillNodes) → number`
  - `splitBranchesWeighted(branches, weightOf) → [Array, Array]`
  - `siblingItems(parentPath, templateChildren, customSkillNodes) → Array<{ label, node? , customKey? }>`
  - `sortItems(items, fieldSort) → Array` (ta sama tablica, gdy sortowanie wyłączone)

- [ ] **Step 1: Napisz failujący test**

Create `warhammer-battle-helper-front/src/systems/custom/skillLayout.test.js`:

```js
import {
  skillGridTemplate,
  buildSkillRows,
  splitHalf,
  subtreeSize,
  splitBranchesWeighted,
  siblingItems,
  sortItems,
} from './skillLayout';

describe('skillGridTemplate', () => {
  it('lays out the bare minimum: name plus one value', () => {
    expect(skillGridTemplate({})).toBe('1fr 72px');
  });

  it('puts the development column first and the actions column last', () => {
    expect(skillGridTemplate({
      showDevelopment: true, hasAdvances: true, showStar: true, showRoll: true, showActions: true,
    })).toBe('20px 1fr 56px 56px 48px 24px 28px 52px');
  });

  it('spends three columns on base/advances/total instead of one', () => {
    expect(skillGridTemplate({ hasAdvances: true })).toBe('1fr 56px 56px 48px');
  });
});

const field = (over = {}) => ({
  key: 'fld_skills',
  type: 'skill_table',
  skills: [
    { id: 'opt_stealth', label: 'Skradanie', attr: 'attr_ag' },
    { id: 'opt_lore', label: 'Wiedza' },
  ],
  ...over,
});

describe('buildSkillRows', () => {
  it('keys template rows by field and option id, never by label', () => {
    expect(buildSkillRows(field(), {}, new Set()).map(r => r.key))
      .toEqual(['fld_skills.opt_stealth', 'fld_skills.opt_lore']);
  });

  it('appends the player\'s own skills after the template ones', () => {
    const rows = buildSkillRows(field(), {
      'fld_skills.skill_1': { label: 'Tresura psów', linkedAttr: 'attr_fel' },
    }, new Set());
    expect(rows.map(r => r.label)).toEqual(['Skradanie', 'Wiedza', 'Tresura psów']);
    expect(rows[2]).toMatchObject({ custom: true, attr: 'attr_fel', isNew: false });
  });

  it('ignores custom nodes belonging to another field', () => {
    const rows = buildSkillRows(field(), { 'fld_other.skill_1': { label: 'Obce' } }, new Set());
    expect(rows.map(r => r.label)).toEqual(['Skradanie', 'Wiedza']);
  });

  it('sorts by label when the flag is on', () => {
    const rows = buildSkillRows(field({ sortAlphabetically: true }), {
      'fld_skills.skill_1': { label: 'Tresura psów' },
    }, new Set());
    expect(rows.map(r => r.label)).toEqual(['Skradanie', 'Tresura psów', 'Wiedza']);
  });

  it('keeps a freshly added, still-unnamed row at the bottom even when sorting', () => {
    const rows = buildSkillRows(field({ sortAlphabetically: true }), {
      'fld_skills.skill_1': { label: '' },
    }, new Set(['fld_skills.skill_1']));
    expect(rows.map(r => r.label)).toEqual(['Skradanie', 'Wiedza', '']);
    expect(rows[2].isNew).toBe(true);
  });
});

describe('splitHalf', () => {
  it('gives the odd row to the left column', () => {
    expect(splitHalf([1, 2, 3])).toEqual([[1, 2], [3]]);
  });

  it('handles an empty list', () => {
    expect(splitHalf([])).toEqual([[], []]);
  });
});

const tree = {
  key: 'root',
  children: [
    { key: 'walka', label: 'Walka', children: [
      { key: 'biale', label: 'Białe', children: [{ key: 'miecz', label: 'Miecz' }] },
    ] },
    { key: 'wiedza', label: 'Wiedza' },
  ],
};

describe('subtreeSize', () => {
  it('counts the branch itself and every template descendant', () => {
    expect(subtreeSize(tree.children[0], 'fld_tree.walka', {})).toBe(3);
    expect(subtreeSize(tree.children[1], 'fld_tree.wiedza', {})).toBe(1);
  });

  it('counts the player\'s nodes at any depth exactly once', () => {
    const custom = {
      'fld_tree.walka.skill_1': { label: 'Bijatyka' },
      'fld_tree.walka.biale.skill_2': { label: 'Rapier' },
      'fld_tree.wiedza.skill_3': { label: 'Heraldyka' },
    };
    expect(subtreeSize(tree.children[0], 'fld_tree.walka', custom)).toBe(5);
    expect(subtreeSize(tree.children[1], 'fld_tree.wiedza', custom)).toBe(2);
  });
});

describe('splitBranchesWeighted', () => {
  const w = (b) => b.weight;

  it('cuts where the two halves come closest in weight', () => {
    const branches = [{ weight: 8 }, { weight: 1 }, { weight: 5 }, { weight: 4 }];
    expect(splitBranchesWeighted(branches, w))
      .toEqual([[{ weight: 8 }, { weight: 1 }], [{ weight: 5 }, { weight: 4 }]]);
  });

  it('leaves one heavy branch alone in its column', () => {
    const branches = [{ weight: 20 }, { weight: 1 }, { weight: 1 }];
    expect(splitBranchesWeighted(branches, w))
      .toEqual([[{ weight: 20 }], [{ weight: 1 }, { weight: 1 }]]);
  });

  it('never reorders branches', () => {
    const branches = [{ weight: 1 }, { weight: 9 }];
    const [left, right] = splitBranchesWeighted(branches, w);
    expect([...left, ...right]).toEqual(branches);
  });

  it('puts a single branch on the left', () => {
    expect(splitBranchesWeighted([{ weight: 3 }], w)).toEqual([[{ weight: 3 }], []]);
  });

  it('handles an empty list', () => {
    expect(splitBranchesWeighted([], w)).toEqual([[], []]);
  });
});

describe('siblingItems', () => {
  const custom = {
    'fld_tree.walka.skill_1': { label: 'Rapier' },
    'fld_tree.walka.biale.skill_2': { label: 'Za głęboko' },
    'fld_tree.inne.skill_3': { label: 'Obce' },
  };

  it('puts template children and the player\'s own direct children in one list', () => {
    const items = siblingItems('fld_tree.walka', tree.children[0].children, custom);
    expect(items.map(i => i.label)).toEqual(['Białe', 'Rapier']);
    expect(items[0].node.key).toBe('biale');
    expect(items[1].customKey).toBe('fld_tree.walka.skill_1');
  });

  it('takes direct children only — a deeper node belongs to its own level', () => {
    const items = siblingItems('fld_tree.walka', [], custom);
    expect(items.map(i => i.customKey)).toEqual(['fld_tree.walka.skill_1']);
  });

  it('never picks up another branch\'s nodes', () => {
    expect(siblingItems('fld_tree.wiedza', [], custom)).toEqual([]);
  });
});

describe('sortItems', () => {
  it('returns the very same array when sorting is off', () => {
    const items = [{ label: 'B' }, { label: 'A' }];
    expect(sortItems(items, false)).toBe(items);
  });

  it('sorts by label without mutating the input', () => {
    const items = [{ label: 'B' }, { label: 'A' }];
    expect(sortItems(items, true).map(i => i.label)).toEqual(['A', 'B']);
    expect(items.map(i => i.label)).toEqual(['B', 'A']);
  });

  it('treats a missing label as empty, so an unnamed node sorts first instead of throwing', () => {
    expect(sortItems([{ label: 'A' }, {}], true).map(i => i.label)).toEqual([undefined, 'A']);
  });
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że failuje**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillLayout`

Expected: FAIL — `Cannot find module './skillLayout' from 'src/systems/custom/skillLayout.test.js'`.

- [ ] **Step 3: Napisz moduł**

Create `warhammer-battle-helper-front/src/systems/custom/skillLayout.js`:

```js
// Pure layout arithmetic for skill_table and skill_tree fields. It lives outside
// CustomSheetBody because none of it touches the DOM: jsdom computes no layout at all, so the
// only way these decisions can be tested is to make them in plain data first and render second.

// skillGridTemplate builds ONE grid-template-columns string. A field's header row and every one
// of its data rows must be handed the same string — the moment they are computed separately the
// header drifts away from the values underneath it.
export function skillGridTemplate({
  showDevelopment = false,
  hasAdvances = false,
  showStar = false,
  showRoll = false,
  showActions = false,
} = {}) {
  return [
    showDevelopment && '20px',
    '1fr',
    hasAdvances ? '56px 56px 48px' : '72px',
    showStar && '24px',
    showRoll && '28px',
    showActions && '52px',
  ].filter(Boolean).join(' ');
}

// buildSkillRows merges a skill_table's GM-defined rows with the player's own additions into one
// list. The player's skills live in stats.customSkillNodes keyed `${field.key}.${id}` — the same
// bag the tree uses, just flat — so a table row and a tree node are the same kind of thing to
// every consumer downstream (rolls, weapon skill selects, the short card).
//
// `newKeys` holds rows the player has just created and not yet named. They stay pinned to the
// bottom so the row being typed into never jumps out from under the cursor when sorting is on.
export function buildSkillRows(field, customSkillNodes = {}, newKeys = new Set()) {
  const prefix = `${field.key}.`;
  const rows = (field.skills || []).map(opt => ({
    key: `${field.key}.${opt.id}`,
    label: opt.label || '',
    attr: opt.attr || '',
    custom: false,
    isNew: false,
  }));
  for (const key of Object.keys(customSkillNodes)) {
    // Direct children only: a nested path belongs to a tree field, not to this table.
    if (!key.startsWith(prefix) || key.slice(prefix.length).includes('.')) continue;
    const node = customSkillNodes[key];
    rows.push({
      key,
      label: node.label || '',
      attr: node.linkedAttr || '',
      custom: true,
      isNew: newKeys.has(key),
    });
  }
  if (field.sortAlphabetically) rows.sort((a, b) => a.label.localeCompare(b.label));
  return [...rows.filter(r => !r.isNew), ...rows.filter(r => r.isNew)];
}

// splitHalf cuts a flat row list into two columns, the odd row going left. Cutting by count is
// right for a table because every row is exactly one line tall.
export function splitHalf(rows) {
  const mid = Math.ceil(rows.length / 2);
  return [rows.slice(0, mid), rows.slice(mid)];
}

// subtreeSize weighs one branch of a tree: itself, its template descendants, and every skill the
// player added anywhere below it. Custom nodes are counted once, by prefix, instead of inside the
// recursion — recursing over them too would count a deep node once per ancestor.
export function subtreeSize(node, path, customSkillNodes = {}) {
  const templateCount = (n) => 1 + (n.children || []).reduce((sum, c) => sum + templateCount(c), 0);
  const prefix = `${path}.`;
  const customCount = Object.keys(customSkillNodes).filter(k => k.startsWith(prefix)).length;
  return templateCount(node) + customCount;
}

// splitBranchesWeighted picks the single cut point whose two halves are closest in weight, leaving
// branch order untouched. Halving by branch count (what a table does) would put a branch with
// twenty children next to three branches with one each and call the columns even.
//
// A tie goes to the earlier cut, i.e. the lighter left column — arbitrary but deterministic, which
// is what a test can assert on.
export function splitBranchesWeighted(branches, weightOf) {
  const weights = branches.map(weightOf);
  const total = weights.reduce((a, b) => a + b, 0);
  let cut = 0;
  let bestDiff = Infinity;
  let running = 0;
  for (let i = 0; i < branches.length; i++) {
    running += weights[i];
    const diff = Math.abs(running - (total - running));
    if (diff < bestDiff) {
      bestDiff = diff;
      cut = i + 1;
    }
  }
  return [branches.slice(0, cut), branches.slice(cut)];
}

// siblingItems lists one level of a tree as ONE array: the template's children of parentPath plus
// the player's own direct children of it. Both kinds are wrapped the same way ({ label, node } or
// { label, customKey }) so a single sort and a single render loop can handle them together — they
// used to render as two lists in a row, which is why weaving them alphabetically was impossible.
export function siblingItems(parentPath, templateChildren = [], customSkillNodes = {}) {
  const prefix = `${parentPath}.`;
  const items = templateChildren.map(node => ({ label: node.label || '', node }));
  for (const key of Object.keys(customSkillNodes)) {
    // Direct children only — a deeper path belongs to its own level's call.
    if (!key.startsWith(prefix) || key.slice(prefix.length).includes('.')) continue;
    items.push({ label: customSkillNodes[key].label || '', customKey: key });
  }
  return items;
}

// sortItems orders one level of siblings by label. It is a separate function from siblingItems
// because the tree's root level must be sorted BEFORE it is cut into two columns — otherwise the
// alphabet would read in a zigzag across the columns instead of down each one.
export function sortItems(items, fieldSort) {
  if (!fieldSort) return items;
  return [...items].sort((a, b) => (a.label || '').localeCompare(b.label || ''));
}
```

- [ ] **Step 4: Uruchom test i potwierdź, że przechodzi**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillLayout`

Expected: PASS, 23 testy.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/skillLayout.js \
        warhammer-battle-helper-front/src/systems/custom/skillLayout.test.js
git commit -m "feat: FEATURE-217 pure layout helpers for skill tables and trees"
```

---

### Task 3: Znacznik „do rozwoju" — od checkboxa do zapisu

Po tym zadaniu tabela renderuje się przez `buildSkillRows` i `skillGridTemplate` (czyli sortowanie alfabetyczne w tabeli zaczyna działać za darmo — test tego pilnuje), a checkbox rozwoju działa end-to-end: klik → stan karty → zapis → odczyt.

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (import, lista propsów ~190-206, nowy stan, `case 'skill_table'` 729-793, wiersze drzewa 380-520)
- Modify: `warhammer-battle-helper-front/src/systems/custom/CharacterSheet.jsx:28-38, 63-74, 84-95, 333-359`
- Modify: `warhammer-battle-helper-front/src/systems/custom/index.js:24-34`
- Modify: `warhammer-battle-helper-front/src/style.css:8178-8215` (blok „Skill table")
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `.../pl/translation.json` (blok `customSheet`)
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTable.test.jsx` (nowy)
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTree.test.jsx` (dopisać)

**Interfaces:**
- Consumes: `skillGridTemplate`, `buildSkillRows` z zadania 2; `showDevelopment` z zadania 1.
- Produces: nowe propsy `CustomSheetBody`: `developmentSkills = []`, `onToggleDevelopment = null`. Klasy CSS `custom-sheet__skill-dev-check`, `custom-sheet__skill-col-label--dev`. Klucze i18n `customSheet.development`.

- [ ] **Step 1: Napisz failujące testy tabeli**

Create `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTable.test.jsx`:

```jsx
import React from 'react';
import { render } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

// One field, two GM rows, one attribute to link against. `attr` on a row only matters when the
// field has assignAttrToSkill, which the sorting/gating tests do not need.
export const tableSections = (over = {}) => ([{
  id: 'sec1',
  columns: 1,
  fields: [
    {
      key: 'fld_skills',
      type: 'skill_table',
      label: 'Umiejętności',
      skills: [
        { id: 'opt_stealth', label: 'Skradanie' },
        { id: 'opt_lore', label: 'Alchemia' },
      ],
      ...over,
    },
  ],
}]);

const rowNames = (container) =>
  [...container.querySelectorAll('.custom-sheet__skill-name')].map(el => el.textContent);

describe('CustomSheetBody skill_table — development marker', () => {
  it('renders no development checkbox by default', () => {
    const { container } = render(<CustomSheetBody sections={tableSections()} />);
    expect(container.querySelectorAll('.custom-sheet__skill-dev-check')).toHaveLength(0);
  });

  it('renders one checkbox per row when the flag is on, before the name', () => {
    const { container } = render(
      <CustomSheetBody sections={tableSections({ showDevelopment: true })} />
    );
    const checks = container.querySelectorAll('.custom-sheet__skill-dev-check');
    expect(checks).toHaveLength(2);
    const row = container.querySelector('.custom-sheet__skill-row');
    expect(row.firstElementChild).toHaveClass('custom-sheet__skill-dev-check');
  });

  it('shows the column header with its icon even without the advances columns', () => {
    const { container } = render(
      <CustomSheetBody sections={tableSections({ showDevelopment: true })} />
    );
    expect(container.querySelector('.custom-sheet__skill-col-label--dev')).not.toBeNull();
  });

  it('ticks the checkbox for a skill already marked and reports a toggle by key', () => {
    const onToggleDevelopment = jest.fn();
    const { container } = render(
      <CustomSheetBody
        sections={tableSections({ showDevelopment: true })}
        developmentSkills={['fld_skills.opt_stealth']}
        onToggleDevelopment={onToggleDevelopment}
      />
    );
    const [first, second] = container.querySelectorAll('.custom-sheet__skill-dev-check');
    expect(first.checked).toBe(true);
    expect(second.checked).toBe(false);

    second.click();
    expect(onToggleDevelopment).toHaveBeenCalledWith('fld_skills.opt_lore');
  });

  it('disables the checkbox with no handler, so a read-only sheet cannot be ticked', () => {
    const { container } = render(
      <CustomSheetBody sections={tableSections({ showDevelopment: true })} />
    );
    expect(container.querySelector('.custom-sheet__skill-dev-check').disabled).toBe(true);
  });
});

describe('CustomSheetBody skill_table — header and grid', () => {
  it('hands the header and the rows the same grid template', () => {
    const { container } = render(
      <CustomSheetBody sections={tableSections({ showDevelopment: true, hasAdvances: true })} />
    );
    const header = container.querySelector('.custom-sheet__skill-table-header');
    const row = container.querySelector('.custom-sheet__skill-row');
    expect(header.style.gridTemplateColumns).toBe('20px 1fr 56px 56px 48px');
    expect(row.style.gridTemplateColumns).toBe(header.style.gridTemplateColumns);
  });

  it('renders no header when neither advances nor development are on', () => {
    const { container } = render(<CustomSheetBody sections={tableSections()} />);
    expect(container.querySelector('.custom-sheet__skill-table-header')).toBeNull();
  });
});

describe('CustomSheetBody skill_table — alphabetical sort', () => {
  it('keeps the template order by default', () => {
    const { container } = render(<CustomSheetBody sections={tableSections()} />);
    expect(rowNames(container)).toEqual(['Skradanie', 'Alchemia']);
  });

  it('sorts rows by label when the flag is on', () => {
    const { container } = render(
      <CustomSheetBody sections={tableSections({ sortAlphabetically: true })} />
    );
    expect(rowNames(container)).toEqual(['Alchemia', 'Skradanie']);
  });
});
```

- [ ] **Step 2: Uruchom testy i potwierdź, że failują**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillTable`

Expected: FAIL — m.in. `expect(received).toHaveLength(2)` dla `.custom-sheet__skill-dev-check` (received 0) oraz `expect(header.style.gridTemplateColumns).toBe('20px 1fr 56px 56px 48px')` (received `''`).

- [ ] **Step 3: Przepisz `case 'skill_table'`**

W `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` dodaj importy na górze pliku:

```js
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { skillGridTemplate, buildSkillRows } from './skillLayout';
```

Dopisz dwa propsy do listy (po `onToggleFavorite = null,`):

```js
  developmentSkills = [],
  onToggleDevelopment = null,
```

Zamień cały `case 'skill_table': { … }` (dziś linie 729-793) na:

```jsx
      case 'skill_table': {
        const hasAdv   = !!field.hasAdvances;
        const showDev  = !!field.showDevelopment;
        const showRoll = !!field.rollable;
        const advLabel = field.advancesLabel || t('customSheet.advances');
        const gridTemplate = skillGridTemplate({
          showDevelopment: showDev,
          hasAdvances: hasAdv,
          showStar: !!onToggleFavorite,
          showRoll,
          showActions: false,
        });
        const rows = buildSkillRows(field, customSkillNodes);

        // The development checkbox carries no visible label of its own, so the column header is
        // what explains it — which is why the header now renders for it too, not only for the
        // advances columns. The tree has no header at all; there the tooltip does the whole job.
        const header = (hasAdv || showDev) && (
          <div className="custom-sheet__skill-table-header" style={{ gridTemplateColumns: gridTemplate }}>
            {showDev && (
              <span
                className="custom-sheet__skill-col-label custom-sheet__skill-col-label--dev"
                onMouseEnter={e => showTooltip(t('customSheet.development'), e.currentTarget)}
                onMouseLeave={hideTooltip}
              >
                <TrendingUpIcon style={{ fontSize: 12 }} />
              </span>
            )}
            <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--name" />
            {hasAdv && (
              <>
                <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--base">{t('customSheet.base')}</span>
                <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--adv">{advLabel}</span>
                <span className="custom-sheet__skill-col-label custom-sheet__skill-col-label--total">{t('customSheet.total')}</span>
              </>
            )}
          </div>
        );

        const renderRow = (row) => {
          const attrInfo = row.attr ? attrByKey[row.attr] : null;
          const displayName = attrInfo ? `${row.label} (${attrInfo.abbr || attrInfo.label})` : row.label;
          const sv = skills[row.key] || {};
          const base = sv.base ?? 0;
          const adv = sv.advances ?? 0;
          const total = sv.current ?? (base + adv);
          return (
            <div key={row.key} className="custom-sheet__skill-row" style={{ gridTemplateColumns: gridTemplate }}>
              {showDev && (
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
              <span className="custom-sheet__skill-name">{displayName}</span>
              <input
                type="number"
                className={`custom-sheet__skill-val-input${hasAdv ? ' custom-sheet__skill-val-input--base' : ''}`}
                value={hasAdv ? (base || '') : base}
                onChange={onChange ? e => onChange.skill(row.key, e.target.value) : undefined}
                readOnly={readOnly}
                min={0}
              />
              {hasAdv && (
                <>
                  <input
                    type="number"
                    className="custom-sheet__skill-val-input custom-sheet__skill-val-input--adv"
                    value={adv || ''}
                    onChange={onChange ? e => onChange.skillAdvances(row.key, e.target.value) : undefined}
                    readOnly={readOnly}
                  />
                  <span className="custom-sheet__skill-val-total">{total}</span>
                </>
              )}
              {onToggleFavorite && (
                <button
                  className={`coc-star-btn${favoriteSkills.includes(row.key) ? ' coc-star-btn--active' : ''}`}
                  onClick={() => onToggleFavorite(row.key)}
                >
                  <StarIcon style={{ fontSize: 12 }} />
                </button>
              )}
              {showRoll && rollAffordance(() => onRoll({ skillKey: row.key, label: row.label }))}
            </div>
          );
        };

        return (
          <div key={field.key} className="custom-sheet__field custom-sheet__field--skill-table">
            <div className="custom-sheet__section-title">{field.label}</div>
            <div className="custom-sheet__skill-table">
              {header}
              {rows.map(renderRow)}
            </div>
          </div>
        );
      }
```

- [ ] **Step 4: Zamień pozycyjne flagi drzewa na jeden obiekt `opts`**

`renderTreeNode` i `renderCustomNodes` dostają dziś flagi pola pozycyjnie
(`allowPlayerAdd, fieldRollable, fieldAssignAttr`). FEATURE-217 dokłada trzy kolejne, a każde
wywołanie rekurencyjne musi je przekazać w całości — sześć argumentów pozycyjnych to sześć okazji
do przestawienia dwóch `boolean`ów miejscami. Zamień je **teraz**, w jednym przejściu, na obiekt:

```jsx
  // Field-level flags every level of a tree needs. Passed as one object rather than positionally:
  // there are six of them, they are all booleans, and every recursive call has to forward the lot.
  // Built once per field in `case 'skill_tree'`.
  //   { allowPlayerAdd, fieldRollable, fieldAssignAttr, fieldShowDev, fieldShowStar, fieldSort }
```

Zmień sygnatury na `renderTreeNode(node, depth, pathPrefix, opts)` oraz
`renderCustomNodes(parentPath, depth, opts)`, a wewnątrz zamień każde użycie
`allowPlayerAdd` / `fieldRollable` / `fieldAssignAttr` na `opts.allowPlayerAdd` /
`opts.fieldRollable` / `opts.fieldAssignAttr`. W `case 'skill_tree'` zbuduj obiekt raz:

```jsx
        const opts = {
          allowPlayerAdd:  !!field.playerCanAddSkills,
          fieldRollable:   !!field.rollable,
          fieldAssignAttr: !!field.assignAttrToSkill,
          fieldShowDev:    !!field.showDevelopment,
          fieldShowStar:   false,
          fieldSort:       !!field.sortAlphabetically,
        };
```

`fieldShowStar` dostaje właściwą wartość w zadaniu 4, a `fieldSort` zaczyna być czytany w zadaniu 5
— oba pola stoją w obiekcie od razu, żeby kolejne zadania dokładały użycie, a nie przepisywały
sygnatury po raz drugi. Nie wstawiaj do kodu komentarzy odsyłających do numerów zadań.

- [ ] **Step 5: Dodaj kolumnę rozwoju do drzewa**

W `renderTreeNode` wstaw checkbox **po** przycisku rozwijania i **przed** etykietą (dziś linia ~490,
zaraz po zamknięciu `</button>` togglera):

```jsx
          {opts.fieldShowDev && (
            <input
              type="checkbox"
              className="custom-sheet__skill-dev-check"
              checked={developmentSkills.includes(path)}
              disabled={!onToggleDevelopment}
              onChange={onToggleDevelopment ? () => onToggleDevelopment(path) : undefined}
              onMouseEnter={e => showTooltip(t('customSheet.development'), e.currentTarget)}
              onMouseLeave={hideTooltip}
            />
          )}
```

Ten sam blok wstaw w `renderCustomNodes`, w gałęzi `!isEditing`, również zaraz po togglerze
(dziś linia ~411), z `key` w miejsce `path`.

- [ ] **Step 6: Uruchom testy tabeli — muszą przejść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillTable`

Expected: PASS, 9 testów.

- [ ] **Step 7: Dopisz test drzewa**

Dopisz na końcu `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTree.test.jsx`:

```jsx
describe('CustomSheetBody skill_tree — development marker', () => {
  const devTreeSections = [{
    id: 'sec1',
    columns: 1,
    fields: [{
      key: 'fld_tree',
      type: 'skill_tree',
      label: 'Umiejętności',
      showDevelopment: true,
      tree: { key: 'tree_123', label: 'Kategoria', children: [{ key: 'node_a', label: 'Broń biała' }] },
    }],
  }];

  it('marks a tree node by its dot-path key, not by the bare node key', () => {
    const onToggleDevelopment = jest.fn();
    const { container } = render(
      <CustomSheetBody
        sections={devTreeSections}
        developmentSkills={[]}
        onToggleDevelopment={onToggleDevelopment}
      />
    );

    container.querySelector('.custom-sheet__skill-dev-check').click();

    expect(onToggleDevelopment).toHaveBeenCalledWith('fld_tree.node_a');
  });

  it('renders no checkbox when the field does not ask for one', () => {
    const { container } = render(<CustomSheetBody sections={filledTreeSections} />);
    expect(container.querySelector('.custom-sheet__skill-dev-check')).toBeNull();
  });
});
```

- [ ] **Step 8: Uruchom testy drzewa**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillTree`

Expected: PASS, 5 testów.

- [ ] **Step 9: Dodaj klucze i18n**

W `warhammer-battle-helper-front/src/locales/en/translation.json`, blok `customSheet`:

```json
    "development": "Mark for improvement",
```

W `warhammer-battle-helper-front/src/locales/pl/translation.json`, blok `customSheet`:

```json
    "development": "Zaznacz do rozwoju",
```

- [ ] **Step 10: Zamień CSS wiersza na jedną siatkę**

W `warhammer-battle-helper-front/src/style.css` zamień regułę `.custom-sheet__skill-row`
(dziś linie 8186-8193) oraz blok `--advances` (8205-8215) na:

```css
/* One grid per skill row, its columns handed in from JS (skillGridTemplate) so a field's header
   and its rows can never disagree about where a column starts. The column count varies with the
   field's flags — development marker, star, die, player actions — which is exactly why the
   template cannot live here. */
.custom-sheet__skill-row {
    display: grid;
    align-items: center;
    gap: 8px;
    padding: 2px 4px;
    border-radius: 3px;
    transition: background 0.12s;
}

.custom-sheet__skill-table-header {
    display: grid;
    align-items: center;
    gap: 8px;
    padding: 0 4px 2px;
}

.custom-sheet__skill-dev-check {
    width: 14px;
    height: 14px;
    margin: 0;
    accent-color: #7a5c42;
    cursor: pointer;
}

.custom-sheet__skill-dev-check:disabled {
    cursor: default;
    opacity: 0.45;
}

.custom-sheet__skill-col-label--dev {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #7a5c42;
}
```

Usuń też selektory `.custom-sheet__skill-row--advances .custom-sheet__skill-name`,
`.custom-sheet__skill-row--advances .custom-sheet__skill-val-input` oraz
`.custom-sheet__skill-row--advances .coc-star-btn, … .custom-sheet__roll-btn` (8230-8240 i
8277-8280) i przepisz je bez wariantu, bo klasy `--advances` już nikt nie renderuje:

```css
.custom-sheet__skill-row .custom-sheet__skill-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.custom-sheet__skill-row .custom-sheet__skill-val-input {
    width: 100%;
    box-sizing: border-box;
}

.custom-sheet__skill-row .coc-star-btn,
.custom-sheet__skill-row .custom-sheet__roll-btn {
    justify-self: center;
}
```

- [ ] **Step 11: Podłącz stan w karcie postaci**

W `warhammer-battle-helper-front/src/systems/custom/index.js`, w `normalizeCharacter`, po `favoriteSkills`:

```js
      favoriteSkills:   s.favoriteSkills   || [],
      developmentSkills: s.developmentSkills || [],
```

W `warhammer-battle-helper-front/src/systems/custom/CharacterSheet.jsx` dopisz tę samą linię
w **trzech** miejscach: inicjalizacji `useState` (po `favoriteSkills:   stats.favoriteSkills    || [],`),
w `setEdited` wewnątrz `useEffect` (po `favoriteSkills:   s.favoriteSkills    || [],`) oraz
w payloadzie `saveCharacter` (po `favoriteSkills:   currentEdited.favoriteSkills,`):

```js
      developmentSkills: stats.developmentSkills || [],   // useState
      developmentSkills: s.developmentSkills     || [],   // useEffect
        developmentSkills: currentEdited.developmentSkills, // saveCharacter payload
```

Dodaj handler zaraz po `toggleFavoriteSkill` (dziś linia ~217):

```js
  // Marking a skill for improvement is a one-click preference like a favourite, not a typed value,
  // so it saves straight away instead of going through the autosave debounce.
  const toggleDevelopmentSkill = (skillKey) => {
    setEdited(prev => {
      const marked = prev.developmentSkills || [];
      const next = marked.includes(skillKey)
        ? marked.filter(k => k !== skillKey)
        : [...marked, skillKey];
      const ne = { ...prev, developmentSkills: next };
      saveCharacter(ne, charNameRef.current);
      return ne;
    });
  };
```

I przekaż go do `CustomSheetBody` (po `onToggleFavorite={toggleFavoriteSkill}`):

```jsx
    developmentSkills={edited.developmentSkills}
    onToggleDevelopment={toggleDevelopmentSkill}
```

- [ ] **Step 12: Uruchom cały front i sprawdź, czy nic nie odpadło**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`

Expected: wszystko PASS **poza** `App.test.js` (axios ESM, znany baseline). W szczególności
`CustomSheetBody.domShape.test.jsx` i `CustomSheetBody.smoke.test.jsx` muszą przejść — pilnują
kształtu DOM, który właśnie ruszyliśmy.

- [ ] **Step 13: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx \
        warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTable.test.jsx \
        warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTree.test.jsx \
        warhammer-battle-helper-front/src/systems/custom/CharacterSheet.jsx \
        warhammer-battle-helper-front/src/systems/custom/index.js \
        warhammer-battle-helper-front/src/style.css \
        warhammer-battle-helper-front/src/locales/en/translation.json \
        warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat: FEATURE-217 development marker for skill tables and trees"
```

---

### Task 4: Gwiazdka pod flagą + `showRollMarkers` → `showAffordances`

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (prop, `starAffordance`, trzy call-site'y gwiazdki)
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:1879`
- Modify: `warhammer-battle-helper-front/src/style.css` (statyczny wariant gwiazdki)
- Modify: `warhammer-battle-helper-front/src/locales/{en,pl}/translation.json`
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.chromeSeam.test.jsx`
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTable.test.jsx`

**Interfaces:**
- Consumes: `hideFavorites` z zadania 1; `tableSections` z zadania 3 (eksportowane z pliku testowego).
- Produces: prop `showAffordances` (zastępuje `showRollMarkers`); helper `starAffordance(skillKey)` w `CustomSheetBody`; klasa `coc-star-btn--static`; klucz `customSheet.favorite`.

- [ ] **Step 1: Napisz failujące testy**

Dopisz na końcu `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTable.test.jsx`:

```jsx
describe('CustomSheetBody skill_table — favourites star', () => {
  it('shows the star by default, because templates written before the flag relied on it', () => {
    const { container } = render(
      <CustomSheetBody sections={tableSections()} onToggleFavorite={jest.fn()} />
    );
    expect(container.querySelectorAll('button.coc-star-btn')).toHaveLength(2);
  });

  it('hides the star when the template asks it to', () => {
    const { container } = render(
      <CustomSheetBody sections={tableSections({ hideFavorites: true })} onToggleFavorite={jest.fn()} />
    );
    expect(container.querySelector('.coc-star-btn')).toBeNull();
  });

  it('marks an already-starred skill and toggles by key', () => {
    const onToggleFavorite = jest.fn();
    const { container } = render(
      <CustomSheetBody
        sections={tableSections()}
        favoriteSkills={['fld_skills.opt_stealth']}
        onToggleFavorite={onToggleFavorite}
      />
    );
    const stars = container.querySelectorAll('button.coc-star-btn');
    expect(stars[0]).toHaveClass('coc-star-btn--active');
    expect(stars[1]).not.toHaveClass('coc-star-btn--active');

    stars[1].click();
    expect(onToggleFavorite).toHaveBeenCalledWith('fld_skills.opt_lore');
  });

  it('renders the star statically in the creator, where nothing can be toggled', () => {
    const { container } = render(<CustomSheetBody sections={tableSections()} showAffordances />);
    expect(container.querySelector('.coc-star-btn--static')).not.toBeNull();
    expect(container.querySelector('button.coc-star-btn')).toBeNull();
  });

  it('shows no star at all with neither a handler nor the creator flag', () => {
    const { container } = render(<CustomSheetBody sections={tableSections()} />);
    expect(container.querySelector('.coc-star-btn')).toBeNull();
  });
});
```

W `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.chromeSeam.test.jsx` zamień
w obu testach `showRollMarkers` na `showAffordances` i przepisz nazwy testów (`showAffordances`
w miejsce `showRollMarkers`), a na końcu bloku `describe('CustomSheetBody roll affordance — three
callers')` dopisz:

```jsx
  test('the creator flag also turns on the favourites star, so the row width does not lie', () => {
    const { container } = render(
      <CustomSheetBody sections={rollableSections} renderChrome={() => <b />} showAffordances />
    );
    // attr_ws is not a skill row, so the star is asserted where it lives — see
    // CustomSheetBody.skillTable.test.jsx. Here only the rename matters: the old prop is dead.
    expect(container.querySelector('.custom-sheet__roll-btn--static')).not.toBeNull();
  });

  test('the old prop name does nothing, so no caller can keep using it by accident', () => {
    const { container } = render(
      <CustomSheetBody sections={rollableSections} showRollMarkers />
    );
    expect(container.querySelector('.custom-sheet__roll-btn')).toBeNull();
  });
```

- [ ] **Step 2: Uruchom testy i potwierdź, że failują**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='skillTable|chromeSeam'`

Expected: FAIL — `expect(container.querySelector('.coc-star-btn--static')).not.toBeNull()` (received `null`) oraz w `chromeSeam` „the old prop name does nothing" nadal renderuje marker.

- [ ] **Step 3: Przemianuj prop i dodaj `starAffordance`**

W `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx`:

1. W liście propsów zamień `showRollMarkers = false,` na `showAffordances = false,`.
2. W `rollAffordance` zamień `if (showRollMarkers) {` na `if (showAffordances) {` i przepisz komentarz
   nad helperem (linie 216-222) tak, by mówił o wszystkich afordansach, nie tylko o kostce:

```js
  // An affordance the player will see — the die on a rollable field, the favourites star, the
  // development checkbox, the player's own "add skill" button — is content, not editing furniture,
  // so the creator has to show it too. Without live handlers it renders static/disabled: the
  // creator's job is to look exactly like the sheet in play, and a control it silently drops is a
  // control the row width lies about (that gap is what hid FEATURE-212's bug). Gated on the
  // explicit `showAffordances` prop rather than on `renderChrome`'s presence, because the creator
  // has two renders — edit view and clean preview — and only one of them passes chrome.
```

3. Dodaj helper zaraz po `rollAffordance`:

```jsx
  const starAffordance = (skillKey) => {
    const active = favoriteSkills.includes(skillKey);
    if (onToggleFavorite) {
      return (
        <button
          className={`coc-star-btn${active ? ' coc-star-btn--active' : ''}`}
          onClick={() => onToggleFavorite(skillKey)}
          title={t('customSheet.favorite')}
        >
          <StarIcon style={{ fontSize: 12 }} />
        </button>
      );
    }
    if (showAffordances) {
      return (
        <span className="coc-star-btn coc-star-btn--static" aria-hidden="true">
          <StarIcon style={{ fontSize: 12 }} />
        </span>
      );
    }
    return null;
  };
```

4. W `case 'skill_table'` policz `showStar` i użyj helpera:

```jsx
        const showStar = !field.hideFavorites && (!!onToggleFavorite || showAffordances);
```

…przekaż `showStar` do `skillGridTemplate({ …, showStar, … })`, a blok `{onToggleFavorite && (<button …>)}`
z zadania 3 zamień na:

```jsx
              {showStar && starAffordance(row.key)}
```

5. W drzewie: w `renderTreeNode` i `renderCustomNodes` zamień oba bloki
   `{onToggleFavorite && (<button className={`coc-star-btn…`}>…</button>)}` na
   `{opts.fieldShowStar && starAffordance(path)}` (odpowiednio `starAffordance(key)`
   w `renderCustomNodes`).
6. W `case 'skill_tree'` wypełnij pole, które zadanie 3 zostawiło na `false`:

```jsx
          fieldShowStar:   !field.hideFavorites && (!!onToggleFavorite || showAffordances),
```

   Komentarz `// set in Task 4` usuń — ma nie zostać w kodzie.

- [ ] **Step 4: Przemianuj call site w kreatorze**

W `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:1879` zamień
`showRollMarkers` na `showAffordances`.

- [ ] **Step 5: Dodaj statyczny wariant gwiazdki i klucz i18n**

W `warhammer-battle-helper-front/src/style.css`, po `.coc-star-btn--active` (linia 4206):

```css
/* The creator's read-only twin of the star button: same box, no pointer, no hover. */
.coc-star-btn--static {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    opacity: 0.25;
    pointer-events: none;
}
```

W `locales/en/translation.json` → `customSheet`: `"favorite": "Add to the short character card",`
W `locales/pl/translation.json` → `customSheet`: `"favorite": "Dodaj do skróconej karty postaci",`

- [ ] **Step 6: Uruchom testy — muszą przejść**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='skillTable|skillTree|chromeSeam|domShape'`

Expected: PASS we wszystkich czterech plikach.

- [ ] **Step 7: Potwierdź, że stara nazwa propa nie została nigdzie**

Run: `grep -rn "showRollMarkers" warhammer-battle-helper-front/src`

Expected: brak wyników **poza** testem „the old prop name does nothing" w `chromeSeam`.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx \
        warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTable.test.jsx \
        warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.chromeSeam.test.jsx \
        warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx \
        warhammer-battle-helper-front/src/style.css \
        warhammer-battle-helper-front/src/locales/en/translation.json \
        warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat: FEATURE-217 gate the favourites star behind a template flag"
```

---

### Task 5: Sortowanie alfabetyczne w drzewie — scalone rodzeństwo

Tabela sortuje już od zadania 3 (przez `buildSkillRows`). Drzewo wymaga zmiany strukturalnej: dziś
każdy poziom renderuje najpierw węzły szablonowe, potem osobnym wywołaniem węzły gracza — dwie
listy pod rząd, których nie da się przepleść.

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (`renderTreeNode`, `renderCustomNodes`, `case 'skill_tree'`)
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTree.test.jsx`

**Interfaces:**
- Consumes: `sortAlphabetically` z zadania 1 (już wpisane w `opts.fieldSort` w zadaniu 3); `siblingItems`, `sortItems` z zadania 2.
- Produces: `renderSiblings(parentPath, depth, items, opts)` oraz `renderCustomNode(key, depth, opts)` wewnątrz `CustomSheetBody`. `renderSiblings` przyjmuje **gotową listę** `items` (a nie same dzieci szablonowe), bo zadanie 6 musi tę listę posortować i pociąć na kolumny, zanim dojdzie do renderu.

- [ ] **Step 1: Napisz failujący test**

Dopisz w `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTree.test.jsx`:

```jsx
describe('CustomSheetBody skill_tree — alphabetical sort', () => {
  const sortTree = (over = {}) => ([{
    id: 'sec1',
    columns: 1,
    fields: [{
      key: 'fld_tree',
      type: 'skill_tree',
      label: 'Umiejętności',
      tree: {
        key: 'tree_123',
        label: 'Kategoria',
        children: [
          { key: 'n_walka', label: 'Walka', children: [
            { key: 'n_topor', label: 'Topór' },
            { key: 'n_miecz', label: 'Miecz' },
          ] },
          { key: 'n_alchemia', label: 'Alchemia' },
        ],
      },
      ...over,
    }],
  }]);

  const labels = (container) =>
    [...container.querySelectorAll('.custom-sheet__skill-tree-node-label')].map(el => el.textContent);

  it('keeps the template order by default', () => {
    const { container } = render(<CustomSheetBody sections={sortTree()} />);
    expect(labels(container)).toEqual(['Walka', 'Topór', 'Miecz', 'Alchemia']);
  });

  it('sorts each level on its own, leaving the hierarchy intact', () => {
    const { container } = render(<CustomSheetBody sections={sortTree({ sortAlphabetically: true })} />);
    expect(labels(container)).toEqual(['Alchemia', 'Walka', 'Miecz', 'Topór']);
  });

  it('weaves the player\'s own skills in among the template ones', () => {
    const { container } = render(
      <CustomSheetBody
        sections={sortTree({ sortAlphabetically: true })}
        customSkillNodes={{ 'fld_tree.n_walka.skill_1': { label: 'Rapier' } }}
      />
    );
    expect(labels(container)).toEqual(['Alchemia', 'Walka', 'Miecz', 'Rapier', 'Topór']);
  });
});
```

Uwaga: węzły gracza renderują się z klasą `custom-sheet__skill-tree-node-label--custom`, która
**też** ma klasę bazową, więc selektor powyżej łapie oba rodzaje — o to tu chodzi.

- [ ] **Step 2: Uruchom test i potwierdź, że failuje**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillTree`

Expected: FAIL — `expect(labels).toEqual(['Alchemia', 'Walka', …])` zwraca kolejność szablonową
`['Walka', 'Topór', 'Miecz', 'Alchemia']`.

- [ ] **Step 3: Scal rodzeństwo w jedną listę**

Dodaj do importu z `./skillLayout`: `siblingItems, sortItems`.

Rozbij `renderCustomNodes(parentPath, depth, opts)` na `renderCustomNode(key, depth, opts)` —
render **jednego** węzła gracza, czyli dotychczasowe ciało funkcji bez `map` i bez filtrowania
kluczy. Starą funkcję usuń: wybór rodzeństwa przenosi się do `renderSiblings`.

W `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` dodaj helper przed
`renderCustomNode`:

```jsx
  // One level of a tree, template nodes and the player's own rendered from ONE list. They used to
  // render as two lists in a row (template children, then custom children), which is exactly why
  // alphabetical order needed this change: two lists rendered one after the other cannot be woven.
  // Sorting is per level — siblings reorder among themselves and the indent still means what it says.
  const renderSiblings = (parentPath, depth, items, opts) =>
    items.map(item => item.node
      ? renderTreeNode(item.node, depth, parentPath, opts)
      : renderCustomNode(item.customKey, depth, opts));
```

W `renderTreeNode` zamień blok dzieci (dziś `templateChildren.map(...)` + `renderCustomNodes(...)`):

```jsx
        {showChildArea && (
          <div>
            {renderSiblings(path, depth + 1, sortItems(siblingItems(path, templateChildren, customSkillNodes), opts.fieldSort), opts)}
            {addingUnderPath === path && renderAddForm(path, depth + 1, opts.fieldAssignAttr, attrFields)}
          </div>
        )}
```

…a w `renderCustomNode` analogicznie, z `key` w miejsce `path` i `[]` w miejsce `templateChildren`
(węzeł gracza nie ma dzieci z szablonu).

W `case 'skill_tree'` zamień dwa wywołania na jedno:

```jsx
              {renderSiblings(field.key, 0, sortItems(siblingItems(field.key, field.tree?.children || [], customSkillNodes), opts.fieldSort), opts)}
```

Zwróć uwagę, że `siblingItems` liczy `customDirectKeys` tak samo jak dotychczasowy filtr w
`renderCustomNodes` i `renderTreeNode` — po tej zmianie ten filtr istnieje w **jednym** miejscu.
Zmienna `customDirectKeys` w `renderTreeNode` służy jeszcze do wyliczenia `hasChildren`; zostaw ją
albo policz `hasChildren` z długości listy `siblingItems`, ale nie zostawiaj dwóch kopii filtra.

- [ ] **Step 4: Uruchom testy drzewa**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillTree`

Expected: PASS, 8 testów. W szczególności test „renders no skill row for a tree that has no nodes
yet" (FEATURE-160) musi dalej przechodzić: `field.tree?.children || []` broni przypadku bez `children`.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx \
        warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTree.test.jsx
git commit -m "feat: FEATURE-217 alphabetical sort per tree level, siblings merged into one list"
```

---

### Task 6: Layout 2-kolumnowy — tabela po wierszach, drzewo po gałęziach

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (`case 'skill_table'`, `case 'skill_tree'`)
- Modify: `warhammer-battle-helper-front/src/style.css`
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTable.test.jsx`
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTree.test.jsx`

**Interfaces:**
- Consumes: `splitHalf`, `subtreeSize`, `splitBranchesWeighted` z zadania 2; `renderSiblings` z zadania 5; `twoColumns` z zadania 1.
- Produces: klasy `custom-sheet__skill-table--two-col`, `custom-sheet__skill-tree--two-col`, `custom-sheet__skill-col`.

- [ ] **Step 1: Napisz failujące testy**

Dopisz w `CustomSheetBody.skillTable.test.jsx`:

```jsx
describe('CustomSheetBody skill_table — two columns', () => {
  const fourRows = (over = {}) => ([{
    id: 'sec1',
    columns: 1,
    fields: [{
      key: 'fld_skills',
      type: 'skill_table',
      label: 'Umiejętności',
      skills: [
        { id: 'o1', label: 'A' }, { id: 'o2', label: 'B' },
        { id: 'o3', label: 'C' }, { id: 'o4', label: 'D' }, { id: 'o5', label: 'E' },
      ],
      ...over,
    }],
  }]);

  it('renders one column by default', () => {
    const { container } = render(<CustomSheetBody sections={fourRows()} />);
    expect(container.querySelectorAll('.custom-sheet__skill-col')).toHaveLength(0);
    expect(container.querySelectorAll('.custom-sheet__skill-row')).toHaveLength(5);
  });

  it('splits rows in halves, the odd row going left', () => {
    const { container } = render(<CustomSheetBody sections={fourRows({ twoColumns: true })} />);
    const cols = container.querySelectorAll('.custom-sheet__skill-col');
    expect(cols).toHaveLength(2);
    expect([...cols[0].querySelectorAll('.custom-sheet__skill-name')].map(e => e.textContent))
      .toEqual(['A', 'B', 'C']);
    expect([...cols[1].querySelectorAll('.custom-sheet__skill-name')].map(e => e.textContent))
      .toEqual(['D', 'E']);
  });

  it('gives each column its own header, so both line up with their rows', () => {
    const { container } = render(
      <CustomSheetBody sections={fourRows({ twoColumns: true, hasAdvances: true })} />
    );
    expect(container.querySelectorAll('.custom-sheet__skill-table-header')).toHaveLength(2);
  });
});
```

Dopisz w `CustomSheetBody.skillTree.test.jsx`:

```jsx
describe('CustomSheetBody skill_tree — two columns', () => {
  // Walka weighs 3 nodes, the three others 1 each: a split by branch count (2 + 2) would leave
  // the left column twice as tall, so the weighted cut has to put Walka alone.
  const weightedTree = (over = {}) => ([{
    id: 'sec1',
    columns: 1,
    fields: [{
      key: 'fld_tree',
      type: 'skill_tree',
      label: 'Umiejętności',
      tree: {
        key: 'tree_123',
        label: 'Kategoria',
        children: [
          { key: 'n_walka', label: 'Walka', children: [
            { key: 'n_miecz', label: 'Miecz' }, { key: 'n_topor', label: 'Topór' },
          ] },
          { key: 'n_a', label: 'A' },
          { key: 'n_b', label: 'B' },
          { key: 'n_c', label: 'C' },
        ],
      },
      ...over,
    }],
  }]);

  const colLabels = (col) =>
    [...col.querySelectorAll('.custom-sheet__skill-tree-node-label')].map(e => e.textContent);

  it('renders one column by default', () => {
    const { container } = render(<CustomSheetBody sections={weightedTree()} />);
    expect(container.querySelectorAll('.custom-sheet__skill-col')).toHaveLength(0);
  });

  it('cuts by subtree weight, never through a branch', () => {
    const { container } = render(<CustomSheetBody sections={weightedTree({ twoColumns: true })} />);
    const cols = container.querySelectorAll('.custom-sheet__skill-col');
    expect(cols).toHaveLength(2);
    expect(colLabels(cols[0])).toEqual(['Walka', 'Miecz', 'Topór']);
    expect(colLabels(cols[1])).toEqual(['A', 'B', 'C']);
  });

  it('counts the player\'s own nodes into the weight', () => {
    const { container } = render(
      <CustomSheetBody
        sections={weightedTree({ twoColumns: true })}
        customSkillNodes={{
          'fld_tree.n_a.skill_1': { label: 'A1' },
          'fld_tree.n_a.skill_2': { label: 'A2' },
        }}
      />
    );
    const cols = container.querySelectorAll('.custom-sheet__skill-col');
    // Walka 3 + A 3 = 6 on the left against B 1 + C 1 = 2 would be worse than 3 against 5,
    // so the cut lands right after Walka.
    expect(colLabels(cols[0])).toEqual(['Walka', 'Miecz', 'Topór']);
    expect(colLabels(cols[1])).toEqual(['A', 'A1', 'A2', 'B', 'C']);
  });
});
```

- [ ] **Step 2: Uruchom testy i potwierdź, że failują**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='skillTable|skillTree'`

Expected: FAIL — `expect(cols).toHaveLength(2)`, received 0 (klasa `custom-sheet__skill-col` nie istnieje).

- [ ] **Step 3: Podziel tabelę**

W `case 'skill_table'` zamień zwracany blok tabeli na:

```jsx
        const columns = field.twoColumns ? splitHalf(rows) : null;

        return (
          <div key={field.key} className="custom-sheet__field custom-sheet__field--skill-table">
            <div className="custom-sheet__section-title">{field.label}</div>
            {columns ? (
              <div className="custom-sheet__skill-table custom-sheet__skill-table--two-col">
                {columns.map((colRows, i) => (
                  <div key={i} className="custom-sheet__skill-col">
                    {header}
                    {colRows.map(renderRow)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="custom-sheet__skill-table">
                {header}
                {rows.map(renderRow)}
              </div>
            )}
          </div>
        );
```

Dodaj `splitHalf` do importu z `./skillLayout`.

- [ ] **Step 4: Podziel drzewo**

Podział operuje na tej samej liście `items`, którą render i tak by zobaczył — dzięki temu żaden
węzeł nie może się zdublować ani zginąć, a węzły gracza dodane na poziomie root są gałęziami jak
każde inne (mają wagę 1 plus swoje dzieci). Sortowanie idzie **przed** podziałem, więc alfabet
czyta się w dół kolumny, nie zygzakiem.

W `case 'skill_tree'` zamień jedno wywołanie `renderSiblings` na:

```jsx
        const rootItems = sortItems(
          siblingItems(field.key, field.tree?.children || [], customSkillNodes),
          opts.fieldSort
        );
        // Branch order is never touched — only where the single cut falls. The weight counts every
        // node in a branch regardless of whether it is currently expanded: weighing only visible
        // rows would throw branches between columns under the player's fingers each time they
        // collapsed something. A stable layout beats a perfectly even one.
        const branchWeight = (item) => item.node
          ? subtreeSize(item.node, `${field.key}.${item.node.key}`, customSkillNodes)
          : subtreeSize({ key: item.customKey }, item.customKey, customSkillNodes);
        const treeColumns = field.twoColumns
          ? splitBranchesWeighted(rootItems, branchWeight)
          : null;
```

…i zamień zawartość `<div className="custom-sheet__skill-tree">` na:

```jsx
            <div className={`custom-sheet__skill-tree${treeColumns ? ' custom-sheet__skill-tree--two-col' : ''}`}>
              {treeColumns
                ? treeColumns.map((colItems, i) => (
                    <div key={i} className="custom-sheet__skill-col">
                      {renderSiblings(field.key, 0, colItems, opts)}
                    </div>
                  ))
                : renderSiblings(field.key, 0, rootItems, opts)}
              {/* The add button and its form stay under both columns: they belong to the field,
                  not to a column — so this block is untouched by the split. */}
              {opts.allowPlayerAdd && onAddCustomSkill && (
                addingUnderPath === field.key
                  ? renderAddForm(field.key, 0, opts.fieldAssignAttr, attrFields)
                  : <button
                      className="custom-sheet__skill-tree-add-btn"
                      style={{ paddingLeft: 8 }}
                      onClick={() => { setAddingUnderPath(field.key); setAddingLabel(''); setAddingAttr(''); }}
                    >+ dodaj</button>
              )}
            </div>
```

Literał `+ dodaj` zostaje tu nietknięty — przenosi go do `t()` zadanie 7, razem z pozostałymi
polskimi stringami drzewa. Podmiana go tutaj dałaby klucz i18n, którego jeszcze nie ma, i przycisk
wyświetlałby surowe `customSheet.addSkill`.

Dodaj `splitBranchesWeighted, subtreeSize` do importu z `./skillLayout`.

Pułapka do sprawdzenia w teście: `subtreeSize` dla węzła gracza dostaje sztuczny `{ key }` — jego
`children` jest `undefined`, więc `templateCount` zwraca 1, a dzieci-gracza dolicza skan po
prefiksie. Gdyby zamiast tego przekazać sam `customKey` jako `node`, `templateCount` wywaliłoby się
na `node.children` dopiero przy pierwszym drzewie z węzłem gracza na poziomie root — czyli nie
w teście, a u gracza.

- [ ] **Step 5: Dodaj CSS obu układów**

W `warhammer-battle-helper-front/src/style.css`, po bloku `.custom-sheet__skill-table`:

```css
/* Two columns side by side. min-width: 0 on each column is what lets a long skill name ellipsis
   instead of pushing its column wider than half the sheet. */
.custom-sheet__skill-table--two-col,
.custom-sheet__skill-tree--two-col {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 12px;
}

.custom-sheet__skill-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
}
```

- [ ] **Step 6: Uruchom testy**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='skillLayout|skillTable|skillTree'`

Expected: PASS we wszystkich trzech plikach.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx \
        warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTable.test.jsx \
        warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTree.test.jsx \
        warhammer-battle-helper-front/src/style.css
git commit -m "feat: FEATURE-217 two-column layout for skill tables and trees"
```

---

### Task 7: Gracz dodaje umiejętności w tabeli

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (nowy stan, wiersz w trybie edycji, przycisk dodawania, i18n w drzewie)
- Modify: `warhammer-battle-helper-front/src/style.css`
- Modify: `warhammer-battle-helper-front/src/locales/{en,pl}/translation.json`
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTable.test.jsx`

**Interfaces:**
- Consumes: `PlayerCanAddSkills` (istniejące pole), `onAddCustomSkill` / `onUpdateCustomSkill` / `onRemoveCustomSkill` (istniejące propsy), `genId` (istniejący helper), `buildSkillRows` z `newKeys` z zadania 2.
- Produces: klucze i18n `customSheet.addSkill`, `customSheet.skillNamePlaceholder`, `customSheet.saveSkill`, `customSheet.editSkill`, `customSheet.removeSkill`, `customSheet.attrNone`, `customSheet.addChildSkill`; klasy `custom-sheet__skill-name-input`, `custom-sheet__skill-row-actions`, `custom-sheet__skill-add-btn`.

- [ ] **Step 1: Napisz failujące testy**

Dopisz w `CustomSheetBody.skillTable.test.jsx`:

```jsx
describe('CustomSheetBody skill_table — player-added rows', () => {
  const addable = (over = {}) => tableSections({ playerCanAddSkills: true, ...over });

  it('shows no add button when the template does not allow it', () => {
    const { container } = render(
      <CustomSheetBody sections={tableSections()} onAddCustomSkill={jest.fn()} />
    );
    expect(container.querySelector('.custom-sheet__skill-add-btn')).toBeNull();
  });

  it('creates the node immediately, keyed under the field, with an empty label', () => {
    const onAddCustomSkill = jest.fn();
    const { container } = render(
      <CustomSheetBody sections={addable()} onAddCustomSkill={onAddCustomSkill} onChange={{ skill: jest.fn() }} />
    );

    container.querySelector('.custom-sheet__skill-add-btn').click();

    expect(onAddCustomSkill).toHaveBeenCalledTimes(1);
    const [key, node] = onAddCustomSkill.mock.calls[0];
    expect(key.startsWith('fld_skills.skill_')).toBe(true);
    expect(node).toEqual({ label: '' });
  });

  it('renders a name input on the player\'s row and reports every keystroke', () => {
    const onUpdateCustomSkill = jest.fn();
    const { container } = render(
      <CustomSheetBody
        sections={addable()}
        customSkillNodes={{ 'fld_skills.skill_1': { label: '' } }}
        onAddCustomSkill={jest.fn()}
        onUpdateCustomSkill={onUpdateCustomSkill}
        onRemoveCustomSkill={jest.fn()}
        onChange={{ skill: jest.fn() }}
      />
    );

    // A node with an empty label is one the player is still naming, so the row opens in edit mode.
    const input = container.querySelector('.custom-sheet__skill-name-input');
    expect(input).not.toBeNull();

    input.value = 'Tresura psów';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onUpdateCustomSkill).toHaveBeenCalledWith('fld_skills.skill_1', { label: 'Tresura psów' });
  });

  it('offers an attribute picker only when the field links skills to attributes', () => {
    const withAttr = [{
      id: 'sec1', columns: 1, fields: [
        { key: 'attr_fel', type: 'attr', label: 'Ogłada', abbr: 'Ogd' },
        { key: 'fld_skills', type: 'skill_table', label: 'Umiejętności', playerCanAddSkills: true,
          assignAttrToSkill: true, skills: [] },
      ],
    }];
    const { container } = render(
      <CustomSheetBody
        sections={withAttr}
        customSkillNodes={{ 'fld_skills.skill_1': { label: '' } }}
        onAddCustomSkill={jest.fn()}
        onUpdateCustomSkill={jest.fn()}
        onRemoveCustomSkill={jest.fn()}
        onChange={{ skill: jest.fn() }}
      />
    );
    const select = container.querySelector('.custom-sheet__skill-attr-select');
    expect(select).not.toBeNull();
    expect([...select.options].map(o => o.value)).toEqual(['', 'attr_fel']);
  });

  it('leaves edit mode on the check button and comes back on the pencil', () => {
    const { container } = render(
      <CustomSheetBody
        sections={addable()}
        customSkillNodes={{ 'fld_skills.skill_1': { label: 'Tresura psów' } }}
        onAddCustomSkill={jest.fn()}
        onUpdateCustomSkill={jest.fn()}
        onRemoveCustomSkill={jest.fn()}
        onChange={{ skill: jest.fn() }}
      />
    );

    // A named node renders as a plain row: no input, but a pencil and a bin.
    expect(container.querySelector('.custom-sheet__skill-name-input')).toBeNull();
    container.querySelector('.custom-sheet__skill-edit').click();
    expect(container.querySelector('.custom-sheet__skill-name-input')).not.toBeNull();
    container.querySelector('.custom-sheet__skill-save').click();
    expect(container.querySelector('.custom-sheet__skill-name-input')).toBeNull();
  });

  it('removes the player\'s row by key, and gives GM rows no bin at all', () => {
    const onRemoveCustomSkill = jest.fn();
    const { container } = render(
      <CustomSheetBody
        sections={addable()}
        customSkillNodes={{ 'fld_skills.skill_1': { label: 'Tresura psów' } }}
        onAddCustomSkill={jest.fn()}
        onUpdateCustomSkill={jest.fn()}
        onRemoveCustomSkill={onRemoveCustomSkill}
        onChange={{ skill: jest.fn() }}
      />
    );

    const bins = container.querySelectorAll('.custom-sheet__skill-del');
    expect(bins).toHaveLength(1);
    bins[0].click();
    expect(onRemoveCustomSkill).toHaveBeenCalledWith('fld_skills.skill_1');
  });

  it('shows the add button statically in the creator', () => {
    const { container } = render(<CustomSheetBody sections={addable()} showAffordances />);
    const btn = container.querySelector('.custom-sheet__skill-add-btn');
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Uruchom testy i potwierdź, że failują**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillTable`

Expected: FAIL — `expect(container.querySelector('.custom-sheet__skill-add-btn')).not.toBeNull()` (received `null`).

- [ ] **Step 3: Dodaj stan i akcje wiersza**

W `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` dodaj importy:

```js
import CheckIcon from '@mui/icons-material/Check';
import DeleteIcon from '@mui/icons-material/Delete';
```

Dodaj stan obok pozostałych (`useState` przy linii ~282):

```js
  // Keys of table rows the player has just created and not yet named. Kept here rather than derived
  // from an empty label, because a player may deliberately blank a name mid-edit and the row must
  // not jump to the bottom of a sorted list while they type.
  const [newSkillRows, setNewSkillRows] = useState(() => new Set());
```

W `case 'skill_table'` dolicz flagi i akcje:

```jsx
        const playerAdd = !!field.playerCanAddSkills && (!!onAddCustomSkill || showAffordances);

        const addSkillRow = () => {
          const key = `${field.key}.${genId('skill')}`;
          setNewSkillRows(prev => new Set(prev).add(key));
          setEditingPath(key);
          onAddCustomSkill(key, { label: '' });
        };

        const finishSkillRow = (key) => {
          setNewSkillRows(prev => { const next = new Set(prev); next.delete(key); return next; });
          setEditingPath(null);
        };

        const removeSkillRow = (key) => {
          finishSkillRow(key);
          onRemoveCustomSkill(key);
        };
```

`skillGridTemplate` dostaje `showActions: playerAdd`, a `buildSkillRows` — trzeci argument `newSkillRows`.

W `renderRow` zamień nazwę na wariant edytowalny i dopisz kolumnę akcji:

```jsx
          const editing = row.custom && (editingPath === row.key || (newSkillRows.has(row.key) && !row.label));
          const attrFields = Object.values(attrByKey);
```

```jsx
              {editing ? (
                <span className="custom-sheet__skill-name-edit">
                  <input
                    type="text"
                    className="custom-sheet__skill-name-input"
                    value={row.label}
                    autoFocus
                    placeholder={t('customSheet.skillNamePlaceholder')}
                    onChange={e => onUpdateCustomSkill(row.key, {
                      ...customSkillNodes[row.key],
                      label: e.target.value,
                    })}
                    onKeyDown={e => { if (e.key === 'Enter') finishSkillRow(row.key); }}
                  />
                  {field.assignAttrToSkill && (
                    <select
                      className="custom-sheet__skill-attr-select"
                      value={row.attr}
                      onChange={e => onUpdateCustomSkill(row.key, {
                        ...customSkillNodes[row.key],
                        linkedAttr: e.target.value || undefined,
                      })}
                    >
                      <option value="">{t('customSheet.attrNone')}</option>
                      {attrFields.map(f => <option key={f.key} value={f.key}>{f.abbr || f.label}</option>)}
                    </select>
                  )}
                </span>
              ) : (
                <span className="custom-sheet__skill-name">{displayName}</span>
              )}
```

```jsx
              {playerAdd && (
                <span className="custom-sheet__skill-row-actions">
                  {row.custom && onUpdateCustomSkill && (editing ? (
                    <button className="custom-sheet__skill-save" onClick={() => finishSkillRow(row.key)} title={t('customSheet.saveSkill')}>
                      <CheckIcon style={{ fontSize: 13 }} />
                    </button>
                  ) : (
                    <button className="custom-sheet__skill-edit" onClick={() => setEditingPath(row.key)} title={t('customSheet.editSkill')}>
                      <EditIcon style={{ fontSize: 12 }} />
                    </button>
                  ))}
                  {row.custom && onRemoveCustomSkill && (
                    <button className="custom-sheet__skill-del" onClick={() => removeSkillRow(row.key)} title={t('customSheet.removeSkill')}>
                      <DeleteIcon style={{ fontSize: 12 }} />
                    </button>
                  )}
                </span>
              )}
```

Przycisk dodawania idzie pod tabelą (i pod obiema kolumnami), w bloku `return` obok
`custom-sheet__skill-table`:

```jsx
            {playerAdd && (
              <button
                className="custom-sheet__skill-add-btn"
                onClick={onAddCustomSkill ? addSkillRow : undefined}
                disabled={!onAddCustomSkill}
              >
                + {t('customSheet.addSkill')}
              </button>
            )}
```

- [ ] **Step 4: Przenieś polskie stringi drzewa do i18n**

W tym samym pliku zamień pięć zahardkodowanych napisów:

| Było | Ma być |
|---|---|
| `placeholder="Nazwa umiejętności…"` (`renderAddForm`) | `placeholder={t('customSheet.skillNamePlaceholder')}` |
| `<option value="">— atrybut —</option>` (dwa miejsca) | `<option value="">{t('customSheet.attrNone')}</option>` |
| `title="Dodaj podrzędną umiejętność"` (dwa miejsca) | `title={t('customSheet.addChildSkill')}` |
| `title="Edytuj nazwę"` | `title={t('customSheet.editSkill')}` |
| `title="Usuń"` | `title={t('customSheet.removeSkill')}` |
| `>+ dodaj</button>` | `>+ {t('customSheet.addSkill')}</button>` |

- [ ] **Step 5: Dodaj klucze i18n**

`locales/en/translation.json` → `customSheet`:

```json
    "addSkill": "Add skill",
    "skillNamePlaceholder": "Skill name…",
    "saveSkill": "Save name",
    "editSkill": "Edit name",
    "removeSkill": "Remove skill",
    "attrNone": "— attribute —",
    "addChildSkill": "Add a skill under this one",
```

`locales/pl/translation.json` → `customSheet`:

```json
    "addSkill": "Dodaj umiejętność",
    "skillNamePlaceholder": "Nazwa umiejętności…",
    "saveSkill": "Zapisz nazwę",
    "editSkill": "Edytuj nazwę",
    "removeSkill": "Usuń umiejętność",
    "attrNone": "— atrybut —",
    "addChildSkill": "Dodaj podrzędną umiejętność",
```

- [ ] **Step 6: Dodaj CSS**

W `warhammer-battle-helper-front/src/style.css`, po blokach z zadania 3:

```css
.custom-sheet__skill-name-edit {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
}

.custom-sheet__skill-name-input {
    flex: 1;
    min-width: 0;
    background: #fff9f0;
    border: 1px solid #c4a882;
    border-radius: 4px;
    padding: 3px 6px;
    color: #3a2f1f;
    font-size: 0.88rem;
}

.custom-sheet__skill-name-input:focus {
    outline: none;
    border-color: #7a5c42;
}

.custom-sheet__skill-row-actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
}

.custom-sheet__skill-save,
.custom-sheet__skill-edit,
.custom-sheet__skill-del {
    background: none;
    border: none;
    padding: 1px;
    cursor: pointer;
    color: #7a5c42;
    display: inline-flex;
    align-items: center;
}

.custom-sheet__skill-save:hover,
.custom-sheet__skill-edit:hover,
.custom-sheet__skill-del:hover {
    color: #c9975b;
}

.custom-sheet__skill-add-btn {
    align-self: flex-start;
    margin-top: 4px;
    background: none;
    border: 1px dashed #c4a882;
    border-radius: 4px;
    padding: 2px 8px;
    color: #7a5c42;
    font-family: 'Crimson Text', serif;
    font-size: 0.82rem;
    cursor: pointer;
}

.custom-sheet__skill-add-btn:hover:not(:disabled) {
    border-color: #7a5c42;
    color: #3a2f1f;
}

.custom-sheet__skill-add-btn:disabled {
    cursor: default;
    opacity: 0.55;
}
```

- [ ] **Step 7: Uruchom testy**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern='skillTable|skillTree'`

Expected: PASS w obu plikach.

- [ ] **Step 8: Sprawdź, czy w komponencie nie zostały polskie stringi**

Run: `grep -n "Nazwa umiejętności\|atrybut\|Dodaj podrzędną\|Edytuj nazwę\|dodaj<" warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx`

Expected: brak wyników.

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx \
        warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.skillTable.test.jsx \
        warhammer-battle-helper-front/src/style.css \
        warhammer-battle-helper-front/src/locales/en/translation.json \
        warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat: FEATURE-217 let players add skills to a skill table"
```

---

### Task 8: Panel kreatora — grupa „Wyświetlanie"

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:862-945` (`PropsGroup` „Zawartość" i nowa grupa)
- Modify: `warhammer-battle-helper-front/src/locales/{en,pl}/translation.json` (blok `creator`)
- Test: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.skillFlags.test.jsx` (nowy)

**Interfaces:**
- Consumes: nazwy flag z zadania 1.
- Produces: funkcja `skillDisplayFlags(fieldType)` eksportowana z `TemplateBuilder.jsx` — lista flag, które dany typ pola pokazuje. Test sprawdza ją bez renderu, tak jak `updateWeaponColumns` w `TemplateBuilder.weaponColumns.test.jsx` (import `TemplateBuilder` ciągnie axios, więc render panelu w jsdom się nie opłaca).

- [ ] **Step 1: Napisz failujący test**

Create `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.skillFlags.test.jsx`:

```jsx
import { skillDisplayFlags } from './TemplateBuilder';

// Importing TemplateBuilder pulls in api/axios and, through the system registry, axios itself —
// the ESM import jest cannot parse. Mocking the instance is enough to load the module.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

test('a table offers all four display flags', () => {
  expect(skillDisplayFlags('skill_table'))
    .toEqual(['hideFavorites', 'showDevelopment', 'sortAlphabetically', 'twoColumns']);
});

test('a tree offers them too — its two-column split works by branch', () => {
  expect(skillDisplayFlags('skill_tree'))
    .toEqual(['hideFavorites', 'showDevelopment', 'sortAlphabetically', 'twoColumns']);
});

test('any other field type gets no display group at all', () => {
  expect(skillDisplayFlags('attr')).toEqual([]);
  expect(skillDisplayFlags('weapons_table')).toEqual([]);
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że failuje**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillFlags`

Expected: FAIL — `(0 , _TemplateBuilder.skillDisplayFlags) is not a function`.

- [ ] **Step 3: Dodaj `skillDisplayFlags` i grupę „Wyświetlanie"**

W `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx`, obok pozostałych
eksportowanych helperów:

```js
// Which FEATURE-217 display flags a field type offers. Both skill types offer all four; the
// two-column split simply means something different in each (rows vs. root branches), which is the
// renderer's business, not the panel's.
export function skillDisplayFlags(fieldType) {
  if (fieldType === 'skill_table' || fieldType === 'skill_tree') {
    return ['hideFavorites', 'showDevelopment', 'sortAlphabetically', 'twoColumns'];
  }
  return [];
}

// Labels and optional hints per flag. hideFavorites is the only inverted one: the switch reads
// "show the star", so its checked state is the negation of the stored flag.
const SKILL_FLAG_LABELS = {
  hideFavorites:      { labelKey: 'creator.skillShowFavorites', hintKey: 'creator.skillShowFavoritesHint', inverted: true },
  showDevelopment:    { labelKey: 'creator.skillShowDevelopment', hintKey: 'creator.skillShowDevelopmentHint' },
  sortAlphabetically: { labelKey: 'creator.skillSortAlphabetically' },
  twoColumns:         { labelKey: 'creator.skillTwoColumns' },
};
```

W `FieldPropertyPanel`, między grupą „Zawartość" a grupą „Rzut", dodaj:

```jsx
      {skillDisplayFlags(field.type).length > 0 && (
        <PropsGroup title={t('creator.propsGroupDisplay')}>
          {skillDisplayFlags(field.type).map(flag => {
            const meta = SKILL_FLAG_LABELS[flag];
            const checked = meta.inverted ? !field[flag] : !!field[flag];
            return (
              <div key={flag}>
                <FormControlLabel
                  labelPlacement="start"
                  control={
                    <Switch
                      size="small"
                      checked={checked}
                      onChange={e => up({ [flag]: meta.inverted ? !e.target.checked : e.target.checked })}
                    />
                  }
                  label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.9rem' }}>{t(meta.labelKey)}</Typography>}
                  sx={switchRowSx}
                />
                {meta.hintKey && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.75, fontStyle: 'italic' }}>
                    {t(meta.hintKey)}
                  </Typography>
                )}
              </div>
            );
          })}
        </PropsGroup>
      )}
```

- [ ] **Step 4: Włącz „gracz może dodawać" dla tabeli**

W tym samym pliku zmień warunek przełącznika `playerCanAddSkills` (dziś linia ~925) z
`{field.type === 'skill_tree' && (` na:

```jsx
          {(field.type === 'skill_table' || field.type === 'skill_tree') && (
```

- [ ] **Step 5: Dodaj klucze i18n kreatora**

`locales/en/translation.json` → `creator` (obok `propsGroupRoll`):

```json
    "propsGroupDisplay": "Display",
    "skillShowFavorites": "Favourites star",
    "skillShowFavoritesHint": "A starred skill goes onto the short character card.",
    "skillShowDevelopment": "Mark for improvement",
    "skillShowDevelopmentHint": "A checkbox the player ticks for skills used this session.",
    "skillSortAlphabetically": "Sort alphabetically",
    "skillTwoColumns": "Two columns",
```

`locales/pl/translation.json` → `creator`:

```json
    "propsGroupDisplay": "Wyświetlanie",
    "skillShowFavorites": "Gwiazdka ulubionych",
    "skillShowFavoritesHint": "Umiejętność z gwiazdką trafia na skróconą kartę postaci.",
    "skillShowDevelopment": "Zaznaczanie do rozwoju",
    "skillShowDevelopmentHint": "Checkbox, którym gracz zaznacza umiejętności użyte na sesji.",
    "skillSortAlphabetically": "Sortuj alfabetycznie",
    "skillTwoColumns": "Dwie kolumny",
```

- [ ] **Step 6: Uruchom test i potwierdź, że przechodzi**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=skillFlags`

Expected: PASS, 3 testy.

- [ ] **Step 7: Sprawdź komplet kluczy i18n**

Run: `cd warhammer-battle-helper-front && node -e "const a=require('./src/locales/en/translation.json'),b=require('./src/locales/pl/translation.json');const f=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'?f(v,p+k+'.'):[p+k]);const A=new Set(f(a)),B=new Set(f(b));console.log('only en:',[...A].filter(k=>!B.has(k)));console.log('only pl:',[...B].filter(k=>!A.has(k)));"`

Expected: `only en: []` i `only pl: []`.

- [ ] **Step 8: Uruchom cały front i cały backend**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`
Expected: wszystko PASS poza `App.test.js` (znany baseline).

Run: `cd warhammer-battle-helper-backend && go test ./...`
Expected: wszystkie pakiety `ok` lub `no test files`.

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx \
        warhammer-battle-helper-front/src/components/creator/TemplateBuilder.skillFlags.test.jsx \
        warhammer-battle-helper-front/src/locales/en/translation.json \
        warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat: FEATURE-217 creator panel switches for skill display flags"
```

---

## Weryfikacja ręczna (po zadaniu 8)

Testy nie widzą layoutu — jsdom nie liczy szerokości. Te cztery rzeczy trzeba zobaczyć w przeglądarce:

1. Kolumny w tabeli i w drzewie faktycznie mają po połowie szerokości karty i nie wychodzą poza popup przy wąskiej karcie (`sheetWidth` na minimum).
2. Nagłówek trafia w kolumny wierszy przy każdej kombinacji flag — zwłaszcza `showDevelopment` **bez** `hasAdvances`.
3. Kreator pokazuje gwiazdkę, checkbox rozwoju i przycisk dodawania jako wyszarzone, a wiersz ma tam tę samą szerokość co w grze.
4. Zaznaczenie „do rozwoju" przeżywa odświeżenie strony (czyli `developmentSkills` przeszło przez `ComputeDerived` i wróciło z API).

Recepta na lokalne uruchomienie stacka i zdobycie JWT: patrz pamięć „Local e2e verification recipe".
