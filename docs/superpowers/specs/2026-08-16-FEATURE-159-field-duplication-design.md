# FEATURE-159 — Duplikacja pól w kreatorze kart postaci

Data: 2026-08-16

## Problem

Kreator kart postaci (`TemplateBuilder`) pozwala dodać pole, usunąć je i zmienić kolejność,
ale nie pozwala go skopiować. GM budujący kartę z kilkunastoma podobnymi atrybutami
(ten sam typ, zakres, flagi `rollable` / `showOnShortCard`, ta sama konfiguracja tabeli)
musi każde pole konfigurować od zera.

## Rozwiązanie

Przycisk **Duplikuj** na kafelku każdego pola na kanwie. Kopia ląduje bezpośrednio
za oryginałem w tej samej sekcji i ma identyczną konfigurację poza dwiema rzeczami:
świeżym kluczem i sufiksem w etykiecie.

## A. UI

W `FieldCard` (`warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:842-846`)
dochodzi czwarty przycisk w `.creator__canvas-field-actions`:

- ikona `ContentCopyIcon` z `@mui/icons-material`, `style={{ fontSize: 11 }}` jak pozostałe
- klasa `creator__canvas-field-action-btn` bez modyfikatora `--danger`
- kolejność w rzędzie: ↑ ↓ **⧉** 🗑 — duplikat obok strzałek, kasowanie zostaje ostatnie
- `onClick={e => { e.stopPropagation(); onDuplicate(); }}` — bez `stopPropagation` klik
  zaznaczyłby pole (kafelek ma własny `onClick`)
- bez tooltipa — pozostałe trzy przyciski na kafelku też go nie mają
- zero nowego CSS

`SectionCanvas` przekazuje nowy prop `onDuplicateField(sectionIdx, fieldIdx)`, analogicznie
do `onRemoveField` / `onMoveField`.

## B. Logika duplikacji

### Funkcja czysta

Nowy plik `warhammer-battle-helper-front/src/utils/templateFields.js` (konwencja repo:
logika w `utils/` + test jednostkowy):

```js
duplicateFieldInSections(sections, sectionIdx, fieldIdx, { newKey, copySuffix })
```

Zwraca nową tablicę sekcji. Zasady:

- **deep clone** pola przez `structuredClone`. Płytki spread (`{ ...src }`) współdzieliłby
  referencje do `skills[]`, `columns[]`, `presetWeapons[]`, `tree` z oryginałem.
- `key` = przekazany `newKey` (wołający liczy `genId(field.type)`). Klucz jest opaque
  identyfikatorem, pod którym leżą dane postaci (`attributes.<key>.current`,
  `numbers.<key>`, `progress.<key>.max`), bindy paska HP w token display oraz bloki
  formuł — kopia musi mieć własny.
- **zagnieżdżone id zostają bez zmian**: `columns[].key` (`col_*`), `skills[].id`,
  klucze węzłów `skill_tree`, `presetWeapons[].id`. Są scope'owane pod kluczem pola
  (`<fieldKey>.<optionId>`), a kopia ma nowy klucz pola — kolizji nie ma.
- `label`: jeśli niepuste → `` `${label} ${copySuffix}` ``; puste zostaje puste.
  `abbr` kopiowane bez zmian (sufiks rozwaliłby wąski kafelek abbr).
- wstawka: `splice(fieldIdx + 1, 0, copy)` — ta sama sekcja, tuż za oryginałem.
- referencje do **innych** pól wewnątrz kopii (`linkedAttr`, `skills[].attr`,
  `rollConfig`, `damageFormula`) kopiowane 1:1 — wskazują cudze klucze, nie własny.

### Wrapper w TemplateBuilder

```js
const duplicateField = (sectionIdx, fieldIdx) => {
  const src = sections[sectionIdx].fields[fieldIdx];
  const next = duplicateFieldInSections(sections, sectionIdx, fieldIdx, {
    newKey: genId(src.type),
    copySuffix: t('creator.copySuffix'),
  });
  setSections(next);
  // wstawka przesuwa indeksy pól za oryginałem — utrzymaj zaznaczenie na tym samym polu
  if (selected?.sectionIdx === sectionIdx && selected?.fieldIdx > fieldIdx) {
    setSelected({ sectionIdx, fieldIdx: selected.fieldIdx + 1 });
  }
  triggerSave(next, name);
};
```

Zaznaczenie poza tą korektą nie jest ruszane — po duplikacji panel edycji dalej pokazuje
to, co pokazywał, więc GM może kliknąć Duplikuj kilka razy z rzędu.

`triggerSave` to ta sama ścieżka co reszta operacji: debounce 1200 ms + `findDuplicateKeys`.
Nowy klucz jest unikalny, więc ostrzeżenie „⚠ dup" się nie zapala.

DnD: `SortableContext` używa `field.key` jako `id`, a klucz kopii jest unikalny — nic
do zmiany.

## C. i18n

Nowy klucz w obu plikach równolegle:

- `src/locales/en/translation.json` → `creator.copySuffix`: `"(copy)"`
- `src/locales/pl/translation.json` → `creator.copySuffix`: `"(kopia)"`

Sufiks jest rozwijany w momencie duplikacji i zapisywany do szablonu jako zwykły tekst,
więc jego język to język UI GM-a w chwili kliknięcia. To celowe — etykiety pól są
free-textem GM-a, nie kluczami i18n.

## D. Testy

`src/utils/templateFields.test.js`:

1. kopia ląduje na `fieldIdx + 1`, reszta kolejności bez zmian
2. kopia ma `newKey`, oryginał ma stary klucz
3. `label` dostaje sufiks; puste `label` zostaje puste; `abbr` bez zmian
4. brak współdzielonych referencji — mutacja `copy.skills` / `copy.columns` nie rusza oryginału
5. pozostałe sekcje wracają nietknięte

Korekta indeksu zaznaczenia siedzi w `duplicateField` w `TemplateBuilder`, a kreator nie ma
testów renderowych — weryfikacja ręczna: zaznacz pole, zduplikuj pole stojące przed nim,
sprawdź że panel edycji dalej pokazuje to samo pole.

## Poza zakresem

- duplikacja całych sekcji
- duplikacja pola do innej sekcji
- duplikacja szablonów
