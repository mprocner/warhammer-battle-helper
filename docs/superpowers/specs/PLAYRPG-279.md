# PLAYRPG-279 — Role członków szablonów systemów (viewer / editor / owner)

## Cel

Dziś szablon (custom system) ma jednego właściciela (`OwnerID`) i listę `SharedWith`, która daje
wyłącznie odczyt i klonowanie, plus flagę `IsPublic`. Zmiana: każdy szablon ma listę członków z
rolą. Edytorzy mogą zmieniać treść szablonu, ownerzy dodatkowo zarządzają dostępem i mogą go
usunąć. Kilku równorzędnych ownerów pozwala przekazać rozwój szablonu innej osobie bez klonowania.

## Decyzje

| Temat | Decyzja |
|---|---|
| Role | `viewer`, `editor`, `owner`. Twórca jest zwykłym wpisem `owner` na liście członków. |
| Ownerzy | Równi: każdy edytuje, udostępnia, zmienia role (także innych ownerów), przełącza `isPublic`, usuwa. |
| Niezmiennik | Szablon ma zawsze ≥1 ownera. Operacja, która zostawiłaby zero ownerów → 400. |
| Rola → uprawnienia | Jedna mapa akcji w Go. Frontend dostaje obliczone `permissions`, nie interpretuje ról. |
| Równoczesna edycja | Optimistic locking na `version`. Konflikt → 409, banner z wyborem „Wczytaj ich wersję” / „Nadpisz moją”. |
| `isPublic` | Uprawnienie `share`; osobny endpoint, poza body autosave. |
| Opuszczenie | Każdy członek może się sam wypisać (owner tylko, gdy nie jest ostatnim). |
| Zmiana roli na żywo | Bez WS. Lobby pobiera przy otwarciu, kreator dowiaduje się przy zapisie (403). |
| Poza zakresem | Admin przypisujący ownera porzuconemu szablonowi — osobny ticket. Uprawnienia per sekcja. |

## Macierz uprawnień

| Akcja (`TemplateAction`) | Viewer | Editor | Owner | Publiczny, nie-członek |
|---|---|---|---|---|
| `use` — widzi w lobby, tworzy grę, klonuje, `GET /templates/:id` | ✓ | ✓ | ✓ | ✓ |
| `edit` — zapis nazwy, sekcji, ustawień | – | ✓ | ✓ | – |
| `share` — lista członków, dodawanie/usuwanie/zmiana ról, `isPublic` | – | – | ✓ | – |
| `delete` — usunięcie szablonu | – | – | ✓ | – |
| Opuszczenie (usunięcie siebie) | ✓ | ✓ | ✓ (nie ostatni owner) | – |

## Backend

### Model (`internal/models/SystemTemplate.go`)

```go
type TemplateMember struct {
    UserID primitive.ObjectID `bson:"userId" json:"userId"`
    Role   string             `bson:"role" json:"role"` // "viewer" | "editor" | "owner"
}

type TemplatePermissions struct {
    Edit   bool `json:"edit"`
    Share  bool `json:"share"`
    Delete bool `json:"delete"`
}

type TemplateMemberView struct {
    UserID primitive.ObjectID `json:"userId"`
    Email  string             `json:"email"`
    Role   string             `json:"role"`
}
```

Pola `SystemTemplate`:
- **nowe, persystowane:** `Members []TemplateMember` (`bson:"members" json:"-"`),
  `UpdatedBy primitive.ObjectID` (`bson:"updatedBy,omitempty" json:"-"`) — autor ostatniego zapisu
  zmieniającego treść.
- **nowe, liczone per request:** `MyRole string` (`json:"myRole,omitempty"`, puste = publiczny
  nie-członek), `Permissions TemplatePermissions` (`json:"permissions"`),
  `MembersView []TemplateMemberView` (`json:"members,omitempty"`, wypełniane tylko przy `share`),
  `OwnerEmails []string` (`json:"ownerEmails,omitempty"`, wypełniane tylko dla członka, który nie
  jest ownerem — publiczny szablon nigdy nie ujawnia adresów autorów).
- **usuwane:** `OwnerID`, `SharedWith`, `SharedWithUsers`, `IsOwner`, `SharedWithMe`, `OwnerEmail`,
  typ `TemplateShare`.

Token-config (`BaseSystem != ""`) używa tego samego modelu z jednym członkiem-ownerem.
Endpointy członków i `visibility` odrzucają taki szablon (400) — to prywatny singleton użytkownika.

`UpdateTemplateRequest`: usunięte `IsPublic`, dodane wymagane `Version *int`.

### Uprawnienia (`internal/service/authz.go`)

```go
type TemplateAction string

const (
    ActionUse    TemplateAction = "use"
    ActionEdit   TemplateAction = "edit"
    ActionShare  TemplateAction = "share"
    ActionDelete TemplateAction = "delete"
)

var rolePermissions = map[string][]TemplateAction{
    "viewer": {ActionUse},
    "editor": {ActionUse, ActionEdit},
    "owner":  {ActionUse, ActionEdit, ActionShare, ActionDelete},
}

func RoleOf(t *models.SystemTemplate, userID primitive.ObjectID) string        // "" gdy nie-członek
func CanOnTemplate(t *models.SystemTemplate, userID primitive.ObjectID, a TemplateAction) bool
func rolesWith(a TemplateAction) []string                                       // dla filtrów Mongo
func IsValidRole(role string) bool
```

- `CanOnTemplate`: `t == nil` → false; `use` → członek dowolnej roli lub `IsPublic`; pozostałe →
  rola członka ma akcję w mapie.
- Zastępuje `CanUseTemplate` (także w `GameHandler` przy tworzeniu gry).
- Filtry repozytorium budowane z `rolesWith`, np. `members: {$elemMatch: {userId: caller, role: {$in: rolesWith(ActionDelete)}}}`.
  Predykat Go i query czytają tę samą mapę.

### Repozytorium (`TemplateRepository`)

- `ListVisibleToUser`: `$or: [{"members.userId": u}, {isPublic: true}]`, `baseSystem` jak dziś.
- `FindByOwnerAndBaseSystem`: filtr `members` `$elemMatch {userId, role: "owner"}`.
- `Update(id, version, editorID, …)`: `UpdateOne({_id, version: seen}, …)`; przy zmianie treści
  `$inc version` i `$set updatedBy`. `MatchedCount == 0` → odczyt dokumentu rozróżnia
  „nie istnieje” od konfliktu wersji.
- `SetVisibility(id, callerID, isPublic)` — autoryzacja w filtrze (`rolesWith(ActionShare)`).
- `AddMember(id, callerID, target, role)` — filtr: caller ma `share` i `members.userId != target`;
  `$push`. Gdy target już jest członkiem → zmiana roli tą samą ścieżką co `SetMemberRole`.
- `SetMemberRole(id, callerID, target, role)` — `arrayFilters` na `userId`. Gdy nowa rola ≠ owner,
  filtr dodatkowo wymaga innego ownera: `members: {$elemMatch: {role: "owner", userId: {$ne: target}}}`.
- `RemoveMember(id, callerID, target)` — `$pull`; filtr: caller ma `share` **lub** `callerID == target`;
  zawsze wymaga innego ownera niż target, jeśli target jest ownerem.
- `Delete(id, callerID)` — filtr z `rolesWith(ActionDelete)`.
- `PullUserEverywhere(userID)` — dla usuwania konta przez admina (patrz niżej).
- Zmiany członków nie zwiększają `version` (stempel `updatedAt` zostaje) — `version` opisuje
  treść, a operacje na członkach nie mogą wywoływać fałszywych konfliktów u edytorów.

Każde `MatchedCount == 0` w operacjach na członkach → serwis czyta dokument, żeby zwrócić właściwy
błąd: `template not found` / `not authorized` / `template must keep at least one owner`.

### Serwis (`TemplateService`)

- `decorate(templates, viewerID)` zastępuje `attachShares` + `attachOwners`: ustawia `MyRole`,
  `Permissions`, a jednym `FindByIDs` dla całej partii rozwiązuje e-maile do `MembersView`
  (tylko szablony z `share`) i `OwnerEmails` (tylko członek nie-owner). Błąd lookupu e-maili jest
  logowany, nie psuje listy (jak dziś).
- `Get(id, viewerID)` — sprawdza `use`; brak dostępu → `template not found` (404, nie ujawnia
  istnienia).
- `Update` — kolejność: odczyt → `CanOnTemplate(edit)` (403) → walidacja → zapis z wersją (409).
  Brak `Version` w żądaniu → 400. Odpowiedź 409 niesie aktualny stan konkurenta.
- `Create` / `GetOrCreateTokenConfig` / `Clone` — `Members: [{caller, owner}]`. `Clone` wymaga `use`,
  kopia zawsze prywatna (jak dziś).
- `AddMember` — kolejność z dzisiejszego `AddShare` zostaje: najpierw autoryzacja (`share`), potem
  `FindByEmailCI` (ochrona przed sondowaniem adresów). Nieznana rola → 400. Sam sobie → 400
  (`cannot share with yourself`).
- Każda operacja na członkach zwraca świeżo odczytaną listę `[]TemplateMemberView` (nigdy `null`).

### Endpointy

| Metoda | Ścieżka | Uprawnienie | Body / odpowiedź |
|---|---|---|---|
| GET | `/templates` | — | lista z `myRole`, `permissions`, `members`?, `ownerEmails`? |
| GET | `/templates/:id` | `use` | **nowa bramka**; dziś każdy zalogowany czyta dowolny szablon po id |
| PATCH | `/templates/:id` | `edit` | `{name, sections, settings, version}`; 409 `{error:"version conflict", version, updatedBy, updatedAt}` (`updatedBy` = e-mail) |
| PATCH | `/templates/:id/visibility` | `share` | `{isPublic}` → szablon |
| POST | `/templates/:id/members` | `share` | `{email, role}` → lista członków |
| PATCH | `/templates/:id/members/:userId` | `share` | `{role}` → lista członków |
| DELETE | `/templates/:id/members/:userId` | `share` lub sam siebie | → lista członków |
| DELETE | `/templates/:id` | `delete` | |
| POST | `/templates/:id/clone` | `use` | bez zmian |

Usuwane: `POST /templates/:id/shares`, `DELETE /templates/:id/shares/:userId`.

Kody: brak dostępu do odczytu → 404; członek bez uprawnienia → 403; ostatni owner, zła rola, brak
wersji, szablon token-config w endpointach członków → 400; konflikt wersji → 409.

### Usuwanie konta przez admina

`DELETE /admin/users/:id` dodatkowo woła `PullUserEverywhere`. Szablon, którego usunięty użytkownik
był jedynym ownerem, zostaje bez ownera — tak samo osierocony jak dziś (nikt nie edytuje ani nie
usuwa; członkowie dalej go używają). Przypisanie ownera przez admina to osobny ticket.

### Migracja (`cmd/migrate-template-members/main.go`)

Dla każdego dokumentu `system_templates` bez `members`: `members = [{ownerId, "owner"}] +
sharedWith.map(id → {id, "viewer"})`, następnie `$unset: {ownerId, sharedWith}`. Idempotentna
(pomija dokumenty z `members`). Uruchamiana od razu po deployu, jak `migrate-dnd5e-to-srd5`.

## Frontend (`warhammer-battle-helper-front/`)

### Kreator — zapis i konflikt (`components/creator/TemplateBuilder.jsx`)

- `versionRef` inicjowany z `template.version`, aktualizowany z każdej udanej odpowiedzi zapisu
  i po „Wczytaj ich wersję”.
- Body autosave: `{name, sections, settings, version}`. `isPublicRef` znika.
- `saveTemplate` rozróżnia odpowiedzi:
  - **409** → `conflict = {email, updatedAt, version}`; banner pod paskiem tytułu:
    „{email} zapisał szablon o {czas}” + **[Wczytaj ich wersję]** + **[Nadpisz moją]**.
    Autosave wstrzymany (`triggerSave` nie planuje zapisu), lokalna edycja możliwa.
    „Wczytaj” → `GET /templates/:id`, reset stanu jak przy zmianie `template.id`, `conflict = null`.
    „Nadpisz” → zapis bieżącego stanu z `version = conflict.version`, `conflict = null`.
  - **403** → `lostEditAccess = true`; banner „Nie masz już uprawnień do edycji tego szablonu.
    Niezapisane zmiany przepadną po zamknięciu.” Autosave wstrzymany. Bez pełnego trybu read-only.
  - pozostałe błędy — jak dziś (bez komunikatu).
- `handleClose` przy `conflict` lub `lostEditAccess` nie robi flusha zapisu.

### Kreator — karta dostępu (zakładka Ogólne)

- Renderowana tylko gdy `template.permissions.share` (edytor jej nie widzi) i `!isVariant`.
- Switch publiczny → od razu `PATCH /templates/:id/visibility`; błąd przywraca poprzednią wartość.
- Lista członków (`template.members`): ikona, e-mail, „(ty)” przy sobie, `Select` roli
  (Viewer/Editor/Owner, zmiana → `PATCH …/members/:userId`), przycisk usunięcia
  (na sobie: „Opuść szablon” z confirmem; po sukcesie kreator się zamyka, lobby odświeża listę).
- Wiersz dodawania: e-mail + `Select` roli (domyślnie Viewer) + „Udostępnij” → `POST …/members`.
- `shareErrorKey` → `memberErrorKey`, dodany przypadek `template must keep at least one owner`.
- Klasa `.creator__settings-card--visibility` zostaje (kotwica kroku `visibility` w
  `tutorial/tours/creatorGeneral.js`); tekst kroku en/pl przepisany na role.
  Krok dla edytora: karta nie istnieje — sprawdzić, jak `TourRunner` traktuje brakujący target
  i w razie potrzeby pominąć krok bez `permissions.share`.

### Lobby

- `TemplateManagerDialog.jsx`: edycja przy `permissions.edit`, usuwanie przy `permissions.delete`,
  „Opuść” (`LogoutIcon`, confirm) przy `myRole` viewer/editor → `DELETE …/members/<ja>`.
  Zamiast „· udostępniony” chip roli (Editor/Viewer).
- `components/lobby/systemOptions.js`: `mine` = `myRole === 'owner'`, `shared` = pozostałe
  niepuste `myRole`, `public` = reszta. Etykieta autora z `ownerEmails.join(', ')`.
- `hooks/useTemplates.js` i inne miejsca czytające `isOwner` / `sharedWithMe` / `ownerEmail` /
  `sharedWithUsers` — przepięte na nowe pola (lista z grep przy implementacji).

### i18n

Nowe klucze en + pl: nazwy ról, banner konfliktu (tekst + dwa przyciski), banner utraty dostępu,
„Opuść szablon” + confirm, błąd ostatniego ownera, etykieta wyboru roli przy dodawaniu.
Martwe klucze usunięte w tej samej zmianie (`creator.sharedTemplate`, nieużywane `shareRemove` itd.).

## Testy

**Backend**
- `authz_test.go` — tabela `CanOnTemplate`: każda rola × każda akcja, publiczny nie-członek (`use`
  tak, reszta nie), prywatny nie-członek (nic), `nil` (nic). `rolesWith` zgodne z mapą dla każdej akcji.
- Serwis/repo (wzorzec istniejących testów szablonów):
  - zapis ze starą wersją → 409, także gdy treść się nie zmienia;
  - viewer zapisuje → 403 nawet ze starą wersją (uprawnienia przed wersją);
  - zapis bez `version` → 400;
  - degradacja / usunięcie / opuszczenie ostatniego ownera → błąd; z drugim ownerem → sukces;
  - `AddMember` przez nie-ownera z nieistniejącym e-mailem → `not authorized`, nie `user not found`;
  - `GET /templates/:id` bez dostępu → 404;
  - operacje na członkach nie zmieniają `version`;
  - endpointy członków dla token-config → 400.
- Migracja: dokument z `ownerId` + `sharedWith` → poprawne `members`; drugi przebieg nic nie zmienia.

**Frontend**
- `TemplateBuilder`: 409 → banner, kolejna edycja nie wysyła zapisu; „Nadpisz” wysyła `version`
  z 409; „Wczytaj” resetuje stan; 403 → banner utraty dostępu; karta dostępu ukryta bez `share`.
- `TemplateManagerDialog`: przyciski bramkowane `permissions`, „Opuść” dla viewer/editor.
- `systemOptions`: grupowanie po `myRole`.
- `tourTranslations.test.js` / `creatorTour.coverage.test.jsx` przechodzą.
