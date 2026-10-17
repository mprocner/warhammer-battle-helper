# PLAYRPG-277 — Wartość domyślna umiejętności

## Cel

GM może nadać każdej predefiniowanej umiejętności pola `skill_table` wartość startową. Nowo
utworzona postać dostaje ją jako base umiejętności — tak samo jak `Default` pól `attr`/`number`
i wierszy `attr_table` (FEATURE-158, PLAYRPG-235).

## Decyzje

| Temat | Decyzja |
|---|---|
| Zakres typów | Tylko `skill_table`. `skill_tree` i umiejętności dodane przez gracza poza zakresem. |
| Semantyka | Seeding przy tworzeniu postaci (`SeedDefaults`), nie żywy fallback. Istniejące postacie i zmiana defaultu w szablonie ich nie dotyczą. Clone kopiuje wartości źródła jak dotąd. |
| Co seedujemy | `Skills["<fieldKey>.<opt.id>"] = {Base: default}`, `Advances` = 0. `current` liczy `ComputeDerived`. |
| `nil` vs `0` | `*int`: `nil` = brak defaultu (brak wpisu w stats), `0` = prawdziwa wartość (wpis powstaje). |
| Tryb pochodny (`baseFromAttr && assignAttrToSkill && hasAdvances`) | Kreator ukrywa input, backend nie seeduje. Wartości w szablonie **nie są czyszczone** — przełączenie trybu tam i z powrotem ich nie gubi. |
| Podgląd w kreatorze | Bez zmian — `CustomSheetBody` w kreatorze nie dostaje stats, defaulty innych typów też się tam nie pokazują. |

## 1. Model (backend)

`internal/models/SystemTemplate.go`, `SkillOption`:

```go
Default *int `bson:"default,omitempty" json:"default,omitempty"`
```

Komentarz typu uzupełniony o znaczenie `Default` (wzorzec: `AttrRow.Default`). Bez migracji —
stare szablony mają `nil`.

## 2. Seeding (backend)

`internal/systems/custom/plugin.go`:

- Nowy helper `skillBaseDerived(field models.FieldDef) bool` =
  `field.BaseFromAttr && field.AssignAttrToSkill && field.HasAdvances`. Zastępuje inline'owe
  `derived := ...` w `resolveRollConfig` (`plugin.go:292`), żeby roller i seeding czytały jeden
  warunek. Lustro po stronie JS: `skillLayout.js` (`derived`) — komentarz przy helperze wskazuje
  to miejsce.
- `SeedDefaults`: wczesne `if field.Default == nil { continue }` przeniesione do gałęzi
  `attr`/`number` (pole `skill_table` nie ma własnego `Default`, więc wczesny `continue` wyciąłby
  je w całości). Nowa gałąź:

  ```go
  case "skill_table":
      if skillBaseDerived(field) {
          continue
      }
      for _, opt := range field.Skills {
          if opt.Default == nil {
              continue
          }
          s.Skills[field.Key+"."+opt.ID] = AttrValue{Base: *opt.Default}
      }
  ```

  `s.Skills` inicjalizowane, gdy `nil` (jak `s.Numbers`).
- Komentarz `SeedDefaults` zaktualizowany: obsługiwane typy to `attr`, `number`, `skill_table`.

## 3. Kreator (frontend)

`components/creator/TemplateBuilder.jsx`, `SkillOptionsEditor`:

- Nowy prop `baseDerived` (z `field`: ten sam warunek co w `skillLayout.js`).
- W każdym wierszu i w wierszu dodawania wąski input `type="number"` `step={1}` z wartością
  `opt.default ?? ''`; zmiana → `default: toInt(value)` (pusty → brak wartości, nie 0; ułamek
  obcięty — ułamek 400-uje cały PATCH szablonu, a `saveTemplate` połyka błąd po cichu).
  Wzorzec: `AttrRowsEditor.jsx`; jego lokalny `toInt` eksportujemy i używamy, zamiast pisać kopię.
- Draft dodawania ma własny stan `draftDefault`; `commit` dopisuje `default` tylko gdy ustawiony.
- Input ukryty, gdy `baseDerived`.
- Etykieta / `aria-label` / placeholder przez i18n (`creator.skillDefault*`), en + pl.
- Klasa CSS w BEM obok `creator__option-attr-select` (np. `creator__option-default-input`),
  kolory wg schematu kart (CLAUDE.md).

## 4. Tutorial

Input żyje w istniejącej grupie `content` — bez nowego kroku i selektora. Aktualizacja tekstu
`tutorial.creatorField.content.body.skill_table`:

- en: „The skills on the list with an optional starting value, optionally linked to an attribute,
  and whether players may add their own.”
- pl: „Umiejętności na liście z opcjonalną wartością startową, opcjonalnie powiązane z atrybutem,
  oraz to, czy gracze mogą dodawać własne.”

## 5. Testy

Go — `internal/systems/custom/roller_test.go` (tam żyją testy `SeedDefaults`):

- default → `Skills["<field>.<id>"].Base`, `Advances` 0;
- `nil` → brak wpisu;
- `0` → wpis z `Base: 0`;
- tryb pochodny → brak wpisu;
- regresja: `attr`/`number` z `Default` nadal seedowane obok `skill_table`;
- `skillBaseDerived` — tabela kombinacji flag.

JS — `components/creator/TemplateBuilder.skillDefault.test.jsx`:

- wpisanie liczby w istniejącym wierszu → `skills[i].default` jako int;
- wyczyszczenie → brak wartości (nie 0);
- ułamek obcięty;
- dodanie wiersza z defaultem z draftu;
- input ukryty przy `assignAttrToSkill + hasAdvances + baseFromAttr`.

Bez zmian, mają przejść: `tourTranslations.test.js`, `creatorTour.coverage.test.jsx`.

Ręcznie: szablon z defaultami → nowa postać → wartości na karcie; tryb pochodny → brak seedingu.

## Poza zakresem

- Default dla węzłów `skill_tree`.
- Default rozwinięć (`Advances`).
- Wypełnianie podglądu kreatora defaultami (dotyczyłoby wszystkich typów pól).
- Uzupełnianie istniejących postaci.
