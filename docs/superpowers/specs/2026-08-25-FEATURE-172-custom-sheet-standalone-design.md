# FEATURE-172 — Karta postaci systemu custom nie działa w osobnym oknie

**Status:** zaprojektowane
**Data:** 2026-08-25

> **Uwaga o numeracji:** plik `docs/superpowers/specs/FEATURE-172.md` opisuje inny temat
> (podpis odległości przy linijce, backlog z 2026-08-21). Numery się dublują — do rozstrzygnięcia
> osobno, ten dokument dotyczy karty postaci.

## Objaw

Gra w systemie `custom`. Otwarcie karty postaci, klik „Otwórz w nowym oknie" — nowe okno wywala się:

```
WindowManagerContext.jsx:108 Uncaught Error: useWindowManager must be used within a WindowManagerProvider
    at DraggablePopup.jsx:11
    at CharacterSheetPage.jsx:21
```

Systemy `warhammer4e`, `coc7e`, `dnd5e` działają poprawnie.

## Przyczyna 1 — brak gałęzi `isStandalone`

`systems/custom/CharacterSheet.jsx` przyjmuje prop `isStandalone` (linia 18) i przekazuje go do
`useCharacterSheetHeaderButtons` (linia 307), ale render **bezwarunkowo** wchodzi w `DraggablePopup`
(linia 343).

`DraggablePopup.jsx:11` woła `useWindowManager()` bez warunku. Provider żyje wyłącznie w
`GameSession.jsx:990`. Route `/character-sheet` (`App.js:173`) jest poza nim, więc hook rzuca.

Trzy pozostałe systemy mają gałąź, która omija `DraggablePopup`:

| System | Gałąź `isStandalone` |
|---|---|
| `warhammer4e` | `CharacterSheet.jsx:193` |
| `coc7e` | `CharacterSheet.jsx:390` |
| `dnd5e` | `CharacterSheet.jsx:609` |
| `custom` | **brak** |

`custom` powstał później i wzorzec nie został skopiowany. Nic go nie wymuszało.

## Przyczyna 2 — brak propa `game` w standalone

Ujawni się dopiero po naprawie pierwszej.

`CharacterSheetPage.jsx` pobiera wyłącznie postacie (linie 20-21) i nie przekazuje `game` (57-66).

`systems/custom/CharacterSheet.jsx:23` czyta `const template = game?.customSystemTemplate`. Bez propa
`template` jest `undefined`, więc render trafia w gałąź `{!template ? t('creator.noTemplate') : ...}`.
Zamiast karty pojawi się komunikat o braku szablonu.

Asymetria wynika z tego, gdzie leży definicja pól:

- `warhammer4e` / `coc7e` / `dnd5e` — zaszyta w JSX, komponent sam wie, co renderować
- `custom` — w bazie, w `Game.CustomSystemTemplate` (`models/Game.go:59`)

## Przyczyna 3 — `isGM` i `rollVisibility` nie docierają do standalone

`CharacterSheetPage` nie przekazuje żadnego z nich, więc obowiązują wartości domyślne.

`rollVisibility` ma skutek widoczny dla innych graczy: `systems/custom/CharacterSheet.jsx:272` wysyła
`visibility: rollVisibility` przy każdym rzucie. Gracz ustawia „tylko ja", wyrywa kartę do osobnego
okna, rzuca — i rzut leci publicznie. Cicha zmiana zachowania.

W `GameSession.jsx:54` to `useState('all')` — stan ulotny, nigdzie nie zapisany. Nowe okno to osobny
kontekst JS i nie ma jak go odczytać.

`isGM` (`GameSession.jsx:869`) to `gameState?.gameMasterId === userId`. Da się policzyć w standalone,
bo `gameMasterId` przychodzi w tej samej odpowiedzi co szablon.

## Martwy kod przy okazji

`CharacterSheetPage.jsx:20`:

```js
const url = gameId ? `/games/${gameId}/characters` : `/characters`;
```

Gałąź `else` jest nieosiągalna i wskazuje na nieistniejący endpoint:

- backend nie ma gołego `GET /characters` — tylko `game.GET("/characters")` w grupie `/games/:id`
  (`main.go:220`, `main.go:240`)
- `usePopOut` jest wołany wyłącznie z czterech `CharacterSheet.jsx`, te renderuje wyłącznie
  `CharacterSheetHost`, a ten wyłącznie `DndContext.jsx:1124` — czyli zawsze wewnątrz `GameSession`,
  gdzie `gameId` istnieje

Fallback zostaje usunięty.

## Rozwiązanie

Standalone staje się samowystarczalne: dociąga to, czego potrzebuje, i renderuje kartę bez menedżera
okien. Nie budujemy mostu między oknami.

### Zmiany

| Plik | Zmiana |
|---|---|
| `systems/custom/CharacterSheet.jsx` | wyciągnąć `sheetContent`, dodać gałąź `if (isStandalone)` |
| `components/CharacterSheetPage.jsx` | dociągnąć `game`, policzyć `isGM`, odczytać `rollVisibility` z query, usunąć martwy fallback |
| `systems/shared/useCharacterSheetActions.js` | `usePopOut` dokleja `rollVisibility` do URL |

### Przepływ danych

```
window.open('/character-sheet?characterId=X&gameId=Y&rollVisibility=gm_only')
        │
        ▼
CharacterSheetPage
  ├─ GET /games/:gameId/characters ──► character (normalizeCharacter)
  ├─ GET /games/:gameId ────────────► game { customSystemTemplate, gameMasterId }
  ├─ useCurrentUser(token) ─────────► userId  (JWT payload.user_id)
  ├─ isGM = game.gameMasterId === userId
  ├─ rollVisibility ← searchParams  (domyślnie 'all')
  └─ useWebSocket(gameId, token)    ► CHARACTER_UPDATED → setCharacter
        │
        ▼
<CustomCharacterSheet isStandalone game={game} isGM rollVisibility ... />
        │
        └─ if (isStandalone) → <div class="sheet-standalone character-sheet-popup">
                                  bez DraggablePopup, bez useWindowManager
```

Oba requesty są niezależne — `Promise.all`.

Gałąź standalone używa klas `.sheet-standalone.character-sheet-popup`, identycznie jak trzy pozostałe
systemy. CSS istnieje (`style.css:2251`), nic nie dochodzi.

### Decyzje i odrzucone warianty

**`useWindowManager` nadal rzuca.** Rozważona zamiana na cichy no-op fallback usunęłaby crash globalnie,
ale zamieniłaby głośny błąd na kartę renderowaną w przeciągalnym popupie wewnątrz osobnego okna — źle
wyglądającą, bez sygnału. Throw to poprawny kontrakt hooka.

**Nie owijamy `/character-sheet` w `WindowManagerProvider`.** To samo co wyżej, dodatkowo gałęzie
`isStandalone` w trzech systemach stałyby się martwym kodem.

**`rollVisibility` przez parametr URL.** Rozważone: własny selektor w oknie standalone (nowe UI + i18n,
dwa niezależne stany) oraz persystencja per uczestnik (model, handler, broadcast WS). Parametr URL jest
snapshotem z chwili otwarcia i rozjedzie się, gdy gracz zmieni ustawienie w głównym oknie. Akceptowalne
— okno i tak jest snapshotem sesji.

Dozwolone wartości pochodzą z selektora `components/log/DiceRollControls.jsx:123-131`:
`all` | `gm_and_roller` | `gm_only` | `<userId>` konkretnego gracza. Standalone przepisuje wartość
bez interpretacji — walidację robi backend.

**Używamy istniejącego `GET /games/:id`.** Zwraca cały obiekt gry (sceny, eventy, handouty), a okno
potrzebuje dwóch pól. Lekki `GET /games/:id/template` to backend plus testy dla oszczędności, której
nikt nie zmierzył. Dodamy, jeśli payload zaboli.

## Stany brzegowe

| Sytuacja | Zachowanie |
|---|---|
| brak `characterId` | „Character not found" — bez zmian |
| `GET /games/:id` pada | `setError`, tak jak przy postaciach |
| gra bez `customSystemTemplate` | karta pokazuje `creator.noTemplate` — istniejące zachowanie |
| brak `gameId` | nie może wystąpić; fallback usunięty |

## Testy

Dwa testy renderu, w istniejącej konwencji (`systems/custom/CharacterDetails.favorites.test.jsx`):

1. `CustomCharacterSheet` z `isStandalone` **bez** `WindowManagerProvider` — renderuje się, nie rzuca.
   Test regresyjny na przyczynę 1.
2. Ten sam render z `game={{ customSystemTemplate }}` — pola z szablonu widoczne. Chroni przyczynę 2.

`CharacterSheetPage` bez testu: to warstwa fetchująca, a `App.test.js` już wywraca się na ESM axiosa
(znany baseline). Nie mnożymy tego problemu.

## Poza zakresem

Zmiana szablonu przez `POST /games/:id/syncTemplate` nie odświeży otwartego okna — WS w
`CharacterSheetPage` obsługuje tylko `CHARACTER_UPDATED`. Osobny temat.
