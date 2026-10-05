# PLAYRPG-224 — Wyszukiwarka systemów w dialogu tworzenia gry

**Status:** zaprojektowane 2026-10-05 (brainstorming zaakceptowany przez użytkownika)
**Dotyczy:**
- `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` (`SharedWithMe`, `OwnerEmail`)
- `warhammer-battle-helper-backend/internal/service/TemplateService.go` (`ListForUser`, nowe `attachOwners`)
- testy serwisu dla `attachOwners`
- `warhammer-battle-helper-front/src/components/lobby/CreateGameDialog.jsx` (`Select` → `Autocomplete`)
- `warhammer-battle-helper-front/src/components/lobby/systemOptions.js` (nowy — budowa, sortowanie, filtrowanie opcji)
- `warhammer-battle-helper-front/src/components/lobby/systemOptions.test.js` (nowy)
- `warhammer-battle-helper-front/src/components/lobby/CreateGameDialog.test.jsx` (nowy)
- `warhammer-battle-helper-front/src/locales/en/translation.json`, `src/locales/pl/translation.json`

**Powiązane:** PLAYRPG-223 (udostępnianie szablonu po emailu — źródło grupy „Udostępnione mi”).

## Kontekst

`CreateGameDialog` wybiera system jednym MUI `<Select>`: płaska lista z trzema nagłówkami
(`ListSubheader`) — Systemy gry, Moje szablony, Szablony społeczności. Przy rosnącej liczbie
szablonów lista robi się długa i nie da się w niej szukać.

Stan danych, który wpływa na projekt:

| Fakt | Konsekwencja |
|---|---|
| `ListVisibleToUser` sortuje po `createdAt` malejąco | „Moje” mają kolejność utworzenia, nie ostatniej pracy |
| „Społeczność” = publiczne cudze **oraz** udostępnione mi (PLAYRPG-223) | dwa różne stopnie bliskości w jednej grupie |
| Szablon nie niesie żadnej informacji o autorze | dwa cudze szablony o tej samej nazwie są nieodróżnialne |
| `User` nie ma nazwy wyświetlanej — tylko `Email` | „autor” = email albo nic |
| `ListForUser` połyka błąd `attachShares` (warn w logu) | dekoracje listy nie mogą decydować o jej strukturze |

## Decyzje

1. **MUI `Autocomplete` z `groupBy`** zamiast `Select`. Odrzucone: pole tekstowe wstrzyknięte
   do menu `Select` (typeahead `Select`a kradnie wpisywane znaki — walka z komponentem) i lista
   zawsze widoczna w dialogu (za duża zmiana UX na obecną skalę).
2. **Cztery grupy** zamiast trzech, w tej kolejności:
   1. **Systemy gry** — kolejność z `registry.js` (bez zmian).
   2. **Moje szablony** — `updatedAt` malejąco (ostatnio edytowany na górze). Zmiana udostępnień też podbija `updatedAt` (`TemplateRepository` ustawia je przy każdym `$addToSet`/`$pull`), więc udostępniony właśnie szablon wskakuje na górę — akceptowalne.
   3. **Udostępnione mi** — alfabetycznie; druga linia: email właściciela.
   4. **Publiczne** — alfabetycznie; **bez autora**.
3. **Szablon publiczny i jednocześnie udostępniony mi** trafia do „Udostępnione mi” (z emailem) —
   właściciel świadomie dał go temu użytkownikowi.
4. **Prywatność autora rozstrzyga backend.** Email właściciela trafia do JSON wyłącznie dla
   szablonów, w których `SharedWith` pytającego zawiera. Maskowanie po stronie frontu byłoby
   kosmetyką — adres i tak leżałby w odpowiedzi HTTP. Przy publicznym szablonie email autora
   widziałby każdy zalogowany, czyli każdy, kto założy konto, żeby zebrać adresy.
5. **Grupę wyznacza `sharedWithMe`, nie obecność `ownerEmail`.** `sharedWithMe` liczy się z
   dokumentu bez zapytań; `ownerEmail` wymaga `FindByIDs`, którego błąd `ListForUser` połyka. Gdyby
   grupa zależała od emaila, awaria tego zapytania przerzuciłaby udostępnione szablony do
   „Publiczne”. Brak emaila = wiersz bez drugiej linii, nie zmiana grupy.
6. **Dopasowanie**: podciąg nazwy, bez wielkości liter i polskich znaków. `normalize('NFD')` +
   usunięcie znaków łączących **nie rozkłada `ł`** (to osobna litera, nie `l` + diakrytyk), więc
   `ł→l` mapujemy ręcznie. W grupie „Udostępnione mi” fraza dopasowuje też email właściciela.
7. **Popularność jako kryterium sortowania — poza zakresem.** Wymagałaby licznika gier per
   szablon w backendzie; brak danych, brak potrzeby dziś.

## Backend

### Model

```go
// SharedWithMe is computed per-request (not persisted): true when the requesting user is in
// SharedWith and does not own the template. The lobby groups on it.
SharedWithMe bool `bson:"-" json:"sharedWithMe,omitempty"`
// OwnerEmail is computed per-request (not persisted) and filled ONLY when SharedWithMe is true:
// the owner chose to reveal themselves to this user. Public templates never carry it.
OwnerEmail string `bson:"-" json:"ownerEmail,omitempty"`
```

### Serwis

`ListForUser` po ustawieniu `IsOwner` ustawia `SharedWithMe` (`!IsOwner && SharedWith zawiera
ownerID`), a następnie woła nowe `attachOwners(refs)`:

- zbiera unikalne `OwnerID` z wierszy `SharedWithMe` — jedno `userRepo.FindByIDs` na całą listę
  (ten sam wzorzec co `attachShares`, bez N+1);
- uzupełnia `OwnerEmail`; id bez konta jest pomijane;
- błąd → `log.Printf("warn: ...")`, lista wraca bez emaili (jak `attachShares`).

Pozostałe ścieżki (`Get`, `Update`, `Clone`) nie potrzebują tych pól — używa ich tylko lobby.

### Testy backendu

- właściciel: `SharedWithMe == false`, `OwnerEmail == ""`;
- cudzy publiczny, nieudostępniony: oba puste;
- udostępniony mi (także publiczny + udostępniony): `SharedWithMe == true`, `OwnerEmail` = email właściciela;
- jedno zapytanie `FindByIDs` dla wielu szablonów tego samego właściciela.

## Frontend

### `systemOptions.js` (czysty moduł)

- `buildSystemOptions(systems, templates)` → płaska, posortowana tablica
  `{ value, label, group, ownerEmail? }`, gdzie `value` to klucz systemu albo `custom:<id>`
  (prefiks bez zmian), a `group` ∈ `systems | mine | shared | public`. Kolejność tablicy =
  kolejność grup (`groupBy` łączy tylko sąsiednie elementy). Sortowanie alfabetyczne przez
  `localeCompare(..., { sensitivity: 'base' })`.
- `normalizeForSearch(text)` — małe litery, `NFD`, usunięcie `\p{M}`, `ł→l`.
- `filterSystemOptions(options, query)` — puste zapytanie zwraca wszystko; inaczej podciąg na
  `label` (i `ownerEmail` dla `shared`).

### `CreateGameDialog.jsx`

- `Autocomplete` z `disableClearable`, `options` z `buildSystemOptions`, `groupBy` → przetłumaczony
  nagłówek grupy, `filterOptions` → `filterSystemOptions`, `isOptionEqualToValue` po `value`.
- `renderOption`: nazwa z pogrubionym dopasowanym fragmentem; dla `shared` druga linia z emailem
  (mniejsza, `text.secondary`).
- `renderGroup`: nagłówek w dotychczasowym stylu `subheaderSx`.
- `noOptionsText`: `t('creator.noSystemMatch')`; placeholder pola: `t('creator.searchSystem')`.
- Zachowane bez zmian: reset formularza przy otwarciu, powrót do `DEFAULT_SYSTEM`, gdy wybrany
  szablon zniknie, `handleSubmit` z rozbiciem `custom:`, bramka `customAllowed` (bez niej grupy
  szablonów są puste), `maxHeight` listy.
- Styl pergaminowy przez `sx` / `slotProps` — klasy w `style.css` przegrywają z emotion na
  korzeniach MUI.

### i18n

Nowe klucze (en + pl): `creator.groupSharedWithMe`, `creator.groupPublic`,
`creator.noSystemMatch`, `creator.searchSystem`. `creator.groupCommunity` usuwamy — jedyne użycie
jest w tym dialogu.

### Testy frontendu

- `systemOptions.test.js`: kolejność grup; „moje” po `updatedAt`; „udostępnione” i „publiczne”
  alfabetycznie; publiczny + udostępniony → `shared`; `sharedWithMe` bez `ownerEmail` → nadal
  `shared`; „lowca” → „Łowca”, „ZOLW” → „Żółw”; email dopasowuje tylko w `shared`.
- `CreateGameDialog.test.jsx` (`import '../../i18n';`): wpisanie frazy zawęża listę i chowa puste
  grupy; brak wyników → komunikat; wybór szablonu i „Utwórz” → `onCreate` z
  `gameSystem: 'custom'` i `customTemplateId`.

## Poza zakresem

- Nazwa wyświetlana konta (pozwoliłaby pokazać autora także przy publicznych szablonach).
- Sortowanie po popularności.
- Przebudowa `TemplateManagerDialog` — ma własną listę, nie dotykamy jej.
