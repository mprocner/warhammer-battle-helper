# PLAYRPG-237 — Powiadomienie o nowej wersji szablonu w lobby

## Cel

Przycisk synchronizacji szablonu na kafelku gry w lobby jest dziś widoczny zawsze (dla GM gry
custom). Ma się pojawiać **tylko gdy źródłowy szablon ma nowszą wersję** niż kopia osadzona w grze,
jako wyraźny pasek „Nowa wersja szablonu [Synchronizuj]”. Synchronizacja wymaga potwierdzenia.
Gracze nie widzą niczego.

## Stan obecny

- `Game.CustomSystemTemplate` — osadzona kopia szablonu (z polem `Version`), `Game.TemplateSourceID` — źródło.
- `TemplateRepository.Update` robi `$inc: {version: 1}` przy każdym update — także przy samej zmianie `isPublic`.
- `GameCard.jsx` — ikona `SyncIcon` w pigułce akcji, warunek `isGM && game.gameSystem === 'custom'`.
- `useGames.syncTemplate` — `POST /games/:id/syncTemplate`, potem `fetchGames()`.
- `GetGamesForUser` nie zna wersji źródłowych szablonów.

## Decyzje

1. **Definicja „nowej wersji”**: `source.version > game.customSystemTemplate.version`.
   `isPublic` przestaje podbijać `version` (fałszywy alarm po przełączeniu widoczności). Zmiana
   `name`, `sections` lub `settings` nadal podbija — sync przenosi je do gry.
2. **Wykrycie na backendzie** (nie we froncie): lista szablonów frontu zawiera tylko szablony
   widoczne dla usera — po cofnięciu share'a flaga by znikała, choć sync działa. Reguła „kto widzi
   flagę” zostaje obok logiki GM w serwisie.
3. **Usunięty szablon źródłowy** → brak nowej wersji → nic się nie wyświetla (sync i tak by się nie udał).
4. **Umiejscowienie**: pasek między plakietką a przyciskiem „Wejdź”. Ikona Sync z pigułki znika.
5. **Potwierdzenie**: istniejący `ConfirmDialog`, bez `danger` (rutynowa akcja, ostrzeżenie w treści).

## Backend

### `TemplateRepository.Update`
`$inc: {version: 1}` dodawany tylko gdy `name != nil || sections != nil || settings != nil`.
Sam `isPublic` stempluje wyłącznie `updatedAt`. Komentarz wyjaśnia dlaczego (jak przy `updateShares`).

### `TemplateRepository.GetVersionsByIDs(ids []primitive.ObjectID) (map[primitive.ObjectID]int, error)`
Jedno zapytanie `{_id: {$in: ids}}` z projekcją `{_id, version}`. Pusta lista → pusta mapa bez
zapytania. Brak dokumentu (usunięty) → brak klucza w mapie.

### `models.Game`
```go
// TemplateUpdateAvailable is computed per-request for the game's GM only: the source template
// has a newer version than the embedded copy. Never persisted, never true for a player.
TemplateUpdateAvailable bool `bson:"-" json:"templateUpdateAvailable,omitempty"`
```

### `GameService.GetGamesForUser`
Po pobraniu gier:
- zbierz `TemplateSourceID` gier, gdzie `GameMasterID == userID`, `!TemplateSourceID.IsZero()`,
  `CustomSystemTemplate != nil`;
- jedno `GetVersionsByIDs`; błąd → flagi zostają `false`, lobby zwraca się normalnie (best-effort,
  jak sortowanie);
- `TemplateUpdateAvailable = srcVersion > game.CustomSystemTemplate.Version` (tylko gdy klucz istnieje).

`GameService` ma już pole `templateService *TemplateService` — dochodzi przelotowe
`TemplateService.GetVersionsByIDs`, serwis gier woła je stamtąd (bez nowej zależności).

## Frontend

### `GameCard.jsx`
- Usunąć `IconButton` z `SyncIcon` z pigułki.
- Gdy `isGM && game.templateUpdateAvailable`: złoty pasek nad przyciskiem „Wejdź”
  (`borderTop` w tonie `#c9975b`, tło jasnozłote), zawartość: `SyncIcon` + tekst
  `t('game.templateUpdateAvailable')` + mały `Button` `t('game.syncTemplateAction')`.
  Podczas `syncing`: przycisk `disabled`, ikona się kręci (istniejąca animacja `spin`).
- Przycisk woła `onSync(game)` (cały obiekt — dialog potrzebuje nazwy).

### `GameLobby.jsx`
- `gamePrompt` dostaje typ `'sync'`: `onSync={game => setGamePrompt({ type: 'sync', game })}`.
- `ConfirmDialog` dla `'sync'`: tytuł `game.syncTemplateTitle`, treść
  `game.syncTemplateConfirm` (`{{name}}` gry), przycisk `game.syncTemplateAction`, `danger={false}`.
- `handleConfirmGamePrompt` dla `'sync'` woła `syncTemplate(game.id)`; refetch w hooku chowa pasek.

### i18n (en + pl)
| klucz | en | pl |
|---|---|---|
| `game.templateUpdateAvailable` | New template version | Nowa wersja szablonu |
| `game.syncTemplateAction` | Sync | Synchronizuj |
| `game.syncTemplateTitle` | Sync template | Synchronizacja szablonu |
| `game.syncTemplateConfirm` | The template of "{{name}}" will be updated. Values of fields removed in the new version will be lost. | Szablon gry „{{name}}” zostanie zaktualizowany. Wartości pól usuniętych w nowej wersji zostaną utracone. |

Usunąć nieużywany `creator.syncTemplate` (en + pl). `creator.syncFailed` zostaje (hook).

**Uwaga o prawdziwości komunikatu**: sync nie kasuje danych z `Stats` — wartość usuniętego pola
zostaje w dokumencie pod nieprzezroczystym kluczem, ale nic jej nie renderuje, a ponowne dodanie
pola tworzy nowy klucz. Dla użytkownika wartość jest utracona — stąd sformułowanie.

## Testy

**Go**
- `TemplateRepository`/`TemplateService`: update z samym `isPublic` nie zmienia `version`;
  update `sections` podbija.
- `GetGamesForUser` (wzorzec konstrukcji serwisu z istniejących testów `GameService`): źródło nowsze → `true`; równe → `false`; brak źródła
  (usunięte) → `false`; user jest graczem w tej grze → `false`; błąd repo → `false`, brak błędu.

**Front** (`GameCard` render test, `import '../../i18n';`)
- pasek widoczny dla GM z `templateUpdateAvailable: true`;
- brak paska bez flagi i dla gracza;
- brak ikony Sync w pigułce;
- klik „Synchronizuj” woła `onSync` z obiektem gry.
- `GameLobby`: potwierdzenie dialogu `'sync'` woła `syncTemplate`, anulowanie nie — jeśli render
  `GameLobby` w jsdom jest wykonalny bez nadmiernego mockowania; inaczej pomijamy i weryfikujemy ręcznie.

## Poza zakresem

- `SyncTemplate` nie sprawdza, czy GM wciąż ma dostęp do szablonu po cofnięciu share'a.
- Brak live-updatu lobby po edycji szablonu — flaga odświeża się przy wejściu do lobby (fetch-on-mount).
