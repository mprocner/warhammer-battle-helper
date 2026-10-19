# PLAYRPG-267 — Zmiana kolejności predefiniowanych umiejętności i presetów przeciąganiem

## Cel

GM ustawia kolejność predefiniowanych umiejętności (`skill_table.skills`), predefiniowanych broni
(`weapons_table.presetWeapons`) i predefiniowanych wierszy (`data_table.presetRows`) przeciąganiem
— tak jak dziś kolumny tabel (`TableColumnsEditor`) i wiersze `attr_table` (`AttrRowsEditor`).
Przy okazji wzorzec DnD, dziś skopiowany w dwóch edytorach, staje się wspólnym modułem do
ponownego użycia.

## Decyzje

| Temat | Decyzja |
|---|---|
| Zakres | `SkillOptionsEditor` (umiejętności `skill_table`) + `TablePresetsEditor` (bronie i wiersze `data_table` — jeden komponent, oba dostają DnD). Poza zakresem: `SkillTreeEditor`, `OptionsEditor` (opcje pola `select`). |
| `sortAlphabetically` włączone | Uchwyty aktywne, pod listą adnotacja, że arkusz sortuje alfabetycznie, a ułożona kolejność obowiązuje po wyłączeniu sortowania. Kolejność nie jest czyszczona. |
| Kształt wspólnego modułu | Hook + dwa małe komponenty (headless). Edytor sam decyduje, gdzie stoi uchwyt — w każdym z czterech edytorów stoi gdzie indziej. |
| Backend | Bez zmian. Tablice zapisywane w całości PATCH-em szablonu; kolejność tablicy = kolejność na arkuszu. |

## 1. Wspólny moduł — `components/common/sortable/`

Bez `index.js` (repo nie ma konwencji barreli; wzorzec: `components/common/richText/`).

### `SortableList.jsx`

```jsx
<SortableList items={list} idOf={s => s.id} onReorder={next => onChange(next)}>
  {list.map(...)}
</SortableList>
```

- W środku: `useSensors(PointerSensor {distance: 5}, KeyboardSensor {sortableKeyboardCoordinates})`,
  `DndContext` z `closestCenter` i `modifiers={[lockToVerticalAxis]}`, `SortableContext` z
  `items.map(idOf)` i `verticalListSortingStrategy`.
- `onDragEnd` liczy `reorderById(items, active.id, over?.id, idOf)` i woła `onReorder(next)` tylko
  gdy `next !== items` — brak ruchu = brak zapisu szablonu.
- `idOf` domyślnie `item => item.id`; kolumny podają `c => c.key`.

### `useSortableItem.js`

`useSortableItem(id)` → `{ rootProps, gripProps, isDragging }`:
- `rootProps = { ref: setNodeRef, style: { transform: CSS.Translate.toString(transform), transition } }`
  — komentarz „Translate, nie Transform” przenosi się tu (jedno miejsce zamiast dwóch).
- `gripProps = { ref: setActivatorNodeRef, ...attributes, ...listeners }`.
- Hook nie zna klas BEM — `creator__drag-item--dragging` dokleja edytor na podstawie `isDragging`.

### `DragGrip.jsx`

`<DragGrip label={...} {...gripProps} />` — `forwardRef`, renderuje
`<button type="button" className="creator__drag-grip" aria-label={label}>` z `DragIndicatorIcon`
(`fontSize: 14`). `forwardRef` jest wymagany: `gripProps.ref` musi trafić na przycisk.

### `utils/sortableList.js`

Bez zmian (`reorderById`, `lockToVerticalAxis` — czyste funkcje z własnymi testami).

### Migracja istniejących edytorów

`AttrRowsEditor` i `TableColumnsEditor` przechodzą na moduł; `SortableAttrRow` i `SortableColumn`
usunięte. Własne sensory/`DndContext` w obu plikach znikają. Zachowanie i DOM (klasy, etykiety
uchwytów) bez zmian.

## 2. Nowe miejsca z DnD

### `SkillOptionsEditor` (`TemplateBuilder.jsx`)

- Lista wierszy w `<SortableList items={list} onReorder={onChange}>`; każdy wiersz to mały
  `SortableSkillRow` (hooka nie da się wołać w `.map`).
- `<DragGrip>` jako pierwszy element `.creator__option-row`, etykieta
  `t('creator.skillReorder')` + ` – {label}` gdy label niepusty (wzorzec etykiety kolumn).
- Wiersz dodawania (`.creator__options-add`) bez uchwytu; lewy odstęp o szerokości uchwytu, żeby
  pola wyrównały się z wierszami powyżej.
- Komponent zostaje w `TemplateBuilder.jsx` (przeniesienie do pliku — poza zakresem).

### `TablePresetsEditor.jsx`

- Karty presetów w `SortableList`; każda karta to mały `SortablePreset`.
- Uchwyt na początku paska `.creator__table-preset-actions`, przed przełącznikiem „zawsze na
  arkuszu”. Bez nowego wiersza nagłówka. Etykieta `t('creator.tablePresetReorder')`.
- Działa dla `presetWeapons` i `presetRows`.

### Adnotacja o sortowaniu

- Nowy prop `sortedOnSheet` w `SkillOptionsEditor` i `TablePresetsEditor`. `true` → pod listą
  kursywą `t('creator.reorderSortedHint')`.
- `skill_table`: `!!field.sortAlphabetically`.
- `weapons_table` / `data_table`: `!!sortColumnKey(field)` (`systems/custom/rowTableLayout.js`) —
  nie sama flaga, bo bez kolumny tekstowej `sortColumnKey` zwraca `null` i arkusz nie sortuje.

### i18n (en + pl)

Nowe klucze: `creator.skillReorder`, `creator.tablePresetReorder`, `creator.reorderSortedHint`.

## 3. Tutorial

Brak nowego typu pola i nowej grupy → brak nowego kroku. Selektory bez zmian (kotwica
`.creator__props-group--content`). Dopisane zdania w `tutorial.creatorField.content.body`, en + pl:
- `skill_table`: kolejność umiejętności ustawia się przeciągnięciem uchwytu.
- `weapons_table`, `data_table`: kolumny i presety układa się przeciągnięciem uchwytu (DnD kolumn
  istniał wcześniej, tekst go pomijał).

## 4. Testy

jsdom nie wykona prawdziwego przeciągania — testy warstwami:

- `common/sortable/SortableList.test.jsx` — mock `DndContext` z `@dnd-kit/core` przechwytuje
  `onDragEnd`; test woła go z `{ active: { id }, over: { id } }`:
  - przesunięcie → `onReorder` z przestawioną tablicą;
  - `over === null` lub `active.id === over.id` → `onReorder` nie wołany;
  - `idOf` respektowany (`c => c.key`).
- `common/sortable/useSortableItem.test.jsx` — test „translate, nie scale” przeniesiony z
  `TableColumnsEditor.dragScale.test.jsx`; stary plik usunięty.
- `SkillOptionsEditor` — uchwyt z etykietą `… – {label}` na każdej umiejętności; wiersz dodawania
  bez uchwytu; adnotacja tylko przy `sortedOnSheet`.
- `TablePresetsEditor` — uchwyt na każdym presecie; adnotacja sterowana `sortedOnSheet`.
- `TemplateBuilder` — `data_table` z `sortAlphabetically` bez kolumny tekstowej nie pokazuje
  adnotacji (pilnuje `sortColumnKey`); `skill_table` z `sortAlphabetically` pokazuje.
- Regresja: `TableColumnsEditor.test`, `AttrRowsEditor.test`, `tourTranslations.test`,
  `creatorTour.coverage.test` zielone bez zmian w asercjach.

Weryfikacja ręczna: przeciągnąć umiejętność, broń i wiersz `data_table` w kreatorze; sprawdzić
kolejność na arkuszu gracza przy wyłączonym sortowaniu oraz adnotację przy włączonym.
