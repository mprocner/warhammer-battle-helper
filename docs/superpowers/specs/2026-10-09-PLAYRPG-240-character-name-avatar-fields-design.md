# PLAYRPG-240 — Pola nazwy postaci, avatara i obrazka w szablonie custom

## Problem

Karta custom ma input nazwy postaci nad treścią karty (`custom-sheet__char-header`,
`systems/custom/CharacterSheet.jsx`). MG nie widzi go w kreatorze, więc w grze pojawia się
element, którego nie projektował. Avatara karty custom nie da się dziś ustawić wcale. Brakuje
też ogólnego pola na obrazek.

## Decyzje

- **Osobne typy pól, nie checkbox-rola na polu.** `char_name` i `char_avatar` czytają i piszą
  top-level `character.name` / `character.avatar`. Odrzucony wariant: flaga roli na `text_short`
  / `image` plus serwer kopiujący wartość z `stats` do `character.name`. Ta kopia rozjeżdża się
  przy przestawieniu flagi, zapisie szablonu i aktualizacji kopii szablonu w grze z publicznego
  źródła. W wybranym wariancie wartość ma jedno miejsce, więc zmiana szablonu przesuwa tylko
  miejsce wyświetlania, nigdy dane.
- **Szkic może być niekompletny, gra nie.** Kreator zapisuje się automatycznie (debounce
  1200 ms, błąd połykany po cichu), więc twarda walidacja przy zapisie szablonu po cichu
  blokowałaby szkice. Wymóg `char_name` sprawdzamy przy kopiowaniu szablonu do gry.
- **Brak kompatybilności wstecznej.** Stare szablony i ich kopie w grach nie dostają `char_name`
  automatycznie. Do czasu dodania pola przez MG gra nie ma edytora nazwy. To akceptowane.
- **`image` ma dowolne proporcje.** MG nie wybiera kształtu.

## Model danych

Nowe typy pól (`models/SystemTemplate.go`, komentarz przy `Type`):

| Typ | Liczność | Wartość |
|---|---|---|
| `char_name` | dokładnie 1 (wymagane przy użyciu w grze) | `character.name` |
| `char_avatar` | 0 lub 1 | `character.avatar` |
| `image` | dowolnie wiele | `stats.images[key]`, URL z `POST /avatars` |

- `custom.Stats` (`systems/custom/character.go`) dostaje
  `Images map[string]string \`bson:"images,omitempty" json:"images,omitempty"\``. Bez tego
  round-trip w `ComputeDerived` usunie wartość przy pierwszym zapisie.
- Model `Character` bez zmian.
- Upload przez istniejący `POST /avatars` (publiczny, niezgadywalny URL). Nie ma nowego
  endpointu.

## Walidacja backend

Helper `CountFieldsOfType` w `models/SystemTemplate.go` liczy wystąpienia typu rekurencyjnie po zagnieżdżonych
sekcjach (FEATURE-211).

- **Create / Update szablonu** (`TemplateService`): 400, gdy `char_name` > 1 lub
  `char_avatar` > 1. Brak `char_name` jest dozwolony, bo to szkic.
- **Kopiowanie szablonu do gry**: 400 z czytelnym komunikatem, gdy `char_name` ≠ 1. Dotyczy
  obu miejsc, które zapisują kopię szablonu custom w grze:
  - `http/GameHandler.go` `CreateGame` (gałąź `gameSystem == "custom"`),
  - `service/GameService.go` `SyncTemplate` (tylko gdy `game.GameSystem == "custom"`;
    gry hardcoded też synchronizują wariant tokenów i nie mają sekcji).

  `attachTokenConfig` (`GameHandler.go`) dotyczy tylko systemów hardcoded i nie podlega tej
  walidacji. Błędy mają kody `template_missing_char_name`, `template_duplicate_char_name`
  i `template_duplicate_char_avatar`, a frontend mapuje je na klucze i18n.

  Frontend wyświetla komunikat błędu w miejscu, które wywołało tworzenie lub synchronizację.

## Kreator (`TemplateBuilder`, `PropertyPopup`)

- Paleta: „Nazwa postaci” i „Avatar” są disabled (z portal tooltipem z wyjaśnieniem), gdy pole
  tego typu już jest na karcie. `image` nie ma limitu.
- Nowy szablon startuje pusty. `char_name` można usunąć.
- Nieblokujące ostrzeżenie, gdy na karcie brak `char_name` („Karta nie ma pola Nazwa postaci”).
  Wzorzec jak ostrzeżenie o zduplikowanych kluczach (`findDuplicateKeys`).
- `PropertyPopup`: etykieta pola jak przy innych typach. Nowe typy nie mają dodatkowych opcji.
- Duplikowanie pola (FEATURE-159) jest wyłączone dla `char_name` i `char_avatar`. Duplikowanie
  sekcji, która je zawiera, pomija je w kopii. Inaczej kopia sekcji dałaby dwa pola nazwy, a
  backend po cichu odrzucałby każdy autosave.
- Szybki wybór typu w sekcji („+” na sekcji) nie pokazuje typów singletonowych już użytych.
- Podgląd: prawdziwy `CustomSheetBody` (zasada z CLAUDE.md). Pusty input nazwy, pusta ramka
  avatara i obrazka. Przyciski uploadu renderowane statycznie jako `disabled` przy
  `showAffordances`.

## Karta gracza

`CustomSheetBody` dostaje nowe gałęzie w switchu typów:

- `char_name`: wygląd `text_short`. Wartość z `values.name`, zmiana przez `onChange.name(value)`,
  nie przez `edited.texts`. Analogicznie `values.avatar`/`onChange.avatar(url)` i
  `values.images`/`onChange.image(key, url)`.
- `char_avatar` i `image`: wspólny komponent `systems/custom/fields/SheetImagePicker.jsx`
  (wariant `avatar`: okrągły, preset `avatar`; wariant `free`: pełna szerokość pola, nowy
  preset `sheetImage: { maxEdge: 1024, aspect: null }`). Pusty pokazuje przycisk uploadu,
  wypełniony obraz oraz akcje „zmień” i „usuń”. Upload robi wywołujący przez prop
  `upload(file) => Promise<url>`, tak samo jak przy `ImageCropModal`. Nie używamy `AvatarUpload`,
  bo importuje klienta axios, a testy `CustomSheetBody` go nie mockują (axios to ESM, którego
  jest z CRA nie transformuje).
- Z tego samego powodu `getApiUrl`/`getApiHeaders` przenosimy do `api/apiUrl.js` bez importu
  axiosa (`api/axios.js` je re-eksportuje), a `utils/fileUrl.js` importuje z `apiUrl`.

`CustomCharacterSheet` (`systems/custom/CharacterSheet.jsx`):

- `edited` dostaje `images` (init, re-sync z propsa, `saveCharacter`).
- Stan `charAvatar` i `charAvatarRef` analogicznie do `charName`. `saveCharacter(currentEdited)`
  traci parametr `name` i czyta oba refy sam, więc żaden z ~20 wywołań nie musi przekazywać
  nazwy ani avatara.
- Avatar i obrazek zapisują się od razu (jedno kliknięcie, jak ulubione), nazwa idzie przez
  debounce autosave.
- Usunięty `custom-sheet__char-header` (input nazwy i nazwa szablonu) wraz z CSS i
  nieużywanymi kluczami i18n.
- Tytuł `DraggablePopup` bez zmian (`charName`).

Konsumenci `character.name` / `character.avatar` (tokeny, short card, uczestnicy, DnD) bez
zmian. Short card zacznie pokazywać avatar.

## i18n

Nazwy typów w palecie, ostrzeżenie o braku nazwy, tooltip disabled, akcje pola `image`,
komunikat błędu kopiowania szablonu do gry. Klucze en i pl przez skill `i18n-sync`.

## Testy

- **Go:** walidacja szablonu (0/1/2 `char_name`, 2 `char_avatar`, pole w zagnieżdżonej
  sekcji). Odrzucenie tworzenia gry z szablonem bez `char_name`. Round-trip `ComputeDerived`
  zachowuje `images`.
- **Front:** `CustomSheetBody` renderuje trzy nowe typy. Wpisanie w `char_name` wywołuje
  `onCharNameChange`, a `texts` się nie zmienia. Kreator: paleta blokuje drugi `char_name`,
  ostrzeżenie pojawia się i znika.

## Poza zakresem

- Sprzątanie osieroconych plików po podmianie obrazka (ten sam dług istnieje przy avatarach).
- Migracja istniejących szablonów i gier.
