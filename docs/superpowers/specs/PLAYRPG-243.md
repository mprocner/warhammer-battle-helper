# PLAYRPG-243 — Konfiguracja dostępności systemów wbudowanych w panelu admina

## Cel

Admin w nowej zakładce **Systems** panelu admina decyduje, którzy użytkownicy mogą **tworzyć gry**
w systemach hardkodowanych (`warhammer4e`, `coc7e`, `coc7e_dark_ages`, `dnd5e`). Dla każdego
systemu: dostęp dla wszystkich albo dla wybranych użytkowników.

Bramka dotyczy wyłącznie tworzenia gry. Gracze nadal widzą gry, do których należą; MG nadal widzi
i prowadzi gry utworzone, gdy jeszcze miał dostęp.

Zastępuje plikowy mechanizm `feature-toggles.json` (`internal/features/`), który na prod nie
działał (plik nie trafia do kontenera → fail-open).

## Decyzje

| Temat | Decyzja |
|---|---|
| Stany dostępu | Dwa: `allUsers: true` albo lista `userIds`. Pusta lista bez `allUsers` = nikt. |
| Zakres | Wszystkie systemy z rejestru **poza `custom`**. `custom` zawsze dostępny dla każdego. |
| Brak wpisu w bazie | **Fail-closed** — system niedostępny dla nikogo. Bez seedu; admin konfiguruje po deployu. |
| Identyfikacja użytkownika | `userId` (ObjectID), wybór z listy kont w panelu. |
| Świeżość w UI gry | `CreateGameDialog` pobiera `/features` przy każdym otwarciu. Bez WS, bez pollingu. |
| Przechowywanie | Nowa kolekcja `system_access`, jeden dokument na system, bez cache w pamięci. |

**Konsekwencja fail-closed bez seedu:** od deployu do wyklikania konfiguracji nikt nie utworzy
nowej gry w systemie hardkodowanym. Istniejące gry działają normalnie.

## Backend

### Model i repozytorium

`internal/models/SystemAccess.go`:

```go
type SystemAccess struct {
    System    string               `bson:"_id" json:"id"`
    AllUsers  bool                 `bson:"allUsers" json:"allUsers"`
    UserIDs   []primitive.ObjectID `bson:"userIds" json:"userIds"`
    UpdatedAt time.Time            `bson:"updatedAt" json:"updatedAt"`
}
```

`_id` = klucz systemu → jeden dokument na system bez osobnego indeksu.

`config/database.go`: `SystemAccessCollection` → `db.Collection("system_access")`.

`internal/repository/SystemAccessRepository.go`:
- `List(ctx) ([]models.SystemAccess, error)`
- `Get(ctx, system) (*models.SystemAccess, error)` — `nil, nil` przy braku dokumentu
- `Upsert(ctx, system string, allUsers bool, userIDs []primitive.ObjectID) error` — ustawia `updatedAt`
- `PullUser(ctx, userID) error` — `UpdateMany({}, {$pull: {userIds: userID}})`

### Rejestr

`registry.HardcodedSystems() []string` — `ListSystems()` bez `custom`. Jedyne miejsce definiujące,
co podlega konfiguracji dostępu.

### Serwis

`internal/service/SystemAccessService.go` (repo wstrzykiwane jako interfejs, testowalne stubem):
- `allowed(doc *models.SystemAccess, userID primitive.ObjectID) bool` — czysta funkcja:
  `doc == nil` → false; `doc.AllUsers` → true; inaczej `userID ∈ doc.UserIDs`.
- `IsAllowed(ctx, system, userID) (bool, error)` — `custom` → true bez odczytu bazy.
- `AllowedSystems(ctx, userID) ([]string, error)` — systemy z `HardcodedSystems()` spełniające
  `allowed`, plus `custom`, w kolejności rejestru. Jedno `List` zamiast zapytania per system.

### Endpointy gry

- `GameHandler.CreateGame`: `FeatureToggles.IsSystemAllowed(system, email)` →
  `SystemAccess.IsAllowed(ctx, system, userID)`. Odpowiedź 403 bez zmian
  (`"game system not available for your account"`). Błąd bazy → 500.
- `GET /features`: `JWTOptionalMiddleware` → `JWTAuthMiddleware`. Odpowiedź `{allowedSystems: [...]}`
  bez zmian w kształcie. Usunięte debugowe `fmt.Printf`.

### Endpointy admina (grupa `/admin`, JWT + isAdmin)

- `GET /admin/systems` — zawsze tyle wierszy, ile `HardcodedSystems()`; rejestr złączony z bazą.
  Brak dokumentu → `{id, allUsers: false, userIds: [], configured: false}`; istniejący →
  `configured: true`. `userIds` zawsze tablicą (nigdy `null`).
- `GET /admin/systems/:id` — jak wyżej, pojedynczy wiersz; 404 gdy `id` nie jest systemem hardkodowanym.
- `PATCH /admin/systems/:id` body `{allUsers: bool, userIds: [string]}` — 400 gdy `id` nie jest
  systemem hardkodowanym (w tym `custom`) lub któreś `userIds` nie parsuje się jako ObjectID.
  Zwraca zaktualizowany wiersz.
- `DELETE /admin/users/:id` — po usunięciu użytkownika dodatkowo `PullUser`, żeby nie zostawiać
  osieroconych ID.

### Usuwane

- pakiet `internal/features/` (`toggle.go`)
- `warhammer-battle-helper-backend/feature-toggles.json`
- pole `GameHandler.FeatureToggles` i `features.Load` w `main.go`

### Celowo bez zmian

- listowanie gier, dołączanie, `GET /games/:id`, WebSocket — brak bramki systemowej
- `EnsureTokenConfig` — konfiguracja tokenów dla systemu bez dostępu jest nieszkodliwa

## Panel admina (`warhammer-battle-helper-admin/`)

- `dataProvider.js`: `RESOURCE_MAP.systems = "/admin/systems"`.
- `dataProvider.getList`: dodane filtrowanie po stronie klienta przed sortowaniem/paginacją —
  `q` = podciąg `email` bez rozróżniania wielkości liter, pozostałe klucze = porównanie
  `String(value)`. Potrzebne dla `AutocompleteArrayInput`; przy okazji zaczynają działać istniejące,
  dziś martwe filtry w `UserList` (`SearchInput`, „Active”).
- `AdminApp.jsx`: `<Resource name="systems" icon={ExtensionIcon} list={SystemList} edit={SystemEdit}
  options={{ label: "Systems" }} />` — bez create/delete.
- `systems/SystemList.jsx`: `Datagrid` (bez bulk actions) — kolumny: System (klucz), Dostęp
  („All users” / „N users” / „Nobody” — wyróżnione, gdy brak konfiguracji lub pusta lista), `EditButton`.
- `systems/SystemEdit.jsx`: `SimpleForm`:
  - `BooleanInput source="allUsers"`
  - `ReferenceArrayInput source="userIds" reference="users"` + `AutocompleteArrayInput optionText="email"`
    — `disabled` gdy `allUsers`; lista nie jest czyszczona (odznaczenie „all” przywraca wybranych)
  - ostrzeżenie, gdy `!allUsers && userIds.length === 0`: „Nobody can create games in this system”
- Etykiety po angielsku inline — panel admina nie używa i18n.

## Frontend gry (`warhammer-battle-helper-front/`)

- `CreateGameDialog.jsx`:
  - usunięty prop `allowedSystems`; lokalny `useState(null)`
  - istniejący `useEffect` na `open` dodatkowo robi `axiosInstance.get('/features')`; flaga
    `cancelled` w cleanupie chroni przed nadpisaniem przez odpowiedź z wcześniejszego otwarcia
  - `null` (ładowanie) i błąd fetchu → brak systemów hardkodowanych na liście (fail-closed;
    backend i tak bramkuje), bez komunikatu
  - `custom` niefiltrowany: usunięte `customAllowed`, szablony zawsze w opcjach; usunięty
    nieaktualny komentarz o bramkowaniu `custom`
- `App.js`: usunięty stan `allowedSystems` i oba bloki fetchu `/features`
  (`checkAuthStatus`, `handleLogin`).
- `GameLobby.jsx`: usunięty prop `allowedSystems` i jego przekazywanie.
- 403 przy tworzeniu: istniejąca ścieżka błędu `createGame` w lobby, bez osobnego komunikatu.
- Bez nowych kluczy i18n.

## Testy

**Backend:**
- `SystemAccessService_test.go` — tabela dla `allowed`: `nil` → false; `AllUsers` → true
  (niezależnie od listy); na liście → true; spoza listy → false; pusta lista → false.
  `IsAllowed("custom", …)` → true bez wywołania repo (stub rzuca/zlicza wywołania).
  `AllowedSystems` — kolejność rejestru, `custom` zawsze obecny.
- `registry` — `HardcodedSystems()` nie zawiera `custom`, zawiera resztę `ListSystems()`.
- handler admina — `PATCH /admin/systems/:id`: nieznany system → 400, `custom` → 400,
  niepoprawny ObjectID → 400.

**Frontend gry** (`CreateGameDialog.test.jsx`, mock axios już istnieje):
- przed odpowiedzią `/features`: brak systemów hardkodowanych, szablony custom widoczne
- po odpowiedzi: tylko dozwolone systemy
- odrzucony fetch: tylko custom
- ponowne otwarcie dialogu → ponowny fetch
- istniejące testy zakładające fail-open dostają w mocku pełną listę

**Panel admina:** brak infrastruktury testowej — weryfikacja ręczna w przeglądarce.

**E2E na lokalnym dockerze (curl + JWT):**
1. pusta kolekcja → `/features` = `["custom"]`; `POST /games` z `warhammer4e` → 403
2. `PATCH /admin/systems/warhammer4e {allUsers: true}` → `/features` zawiera `warhammer4e`, tworzenie 200
3. `dnd5e` z wybranym użytkownikiem B → B widzi `dnd5e`, A nie
4. A ma starą grę `dnd5e` i nie ma dostępu → `GET /games` i otwarcie gry działają
5. `DELETE /admin/users/:id` usuwa ID z `userIds`

## Po wdrożeniu

- skonfigurować wszystkie 4 systemy w panelu (do tego czasu tworzenie gier hardkodowanych zablokowane)
- usunąć z pamięci notatkę `deploy-feature-toggles-todo` — problem przestaje istnieć
