# PLAYRPG-223 — Udostępnianie szablonu konkretnym adresom email

**Status:** zaprojektowane 2026-10-03 (brainstorming zaakceptowany przez użytkownika)
**Dotyczy:**
- `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` (`SharedWith`, `SharedWithUsers`, `TemplateShare`)
- `warhammer-battle-helper-backend/internal/repository/TemplateRepository.go` (`AddShare`, `RemoveShare`, filtr `ListVisibleToUser`)
- `warhammer-battle-helper-backend/internal/repository/TemplateRepository_test.go` (nowy)
- `warhammer-battle-helper-backend/internal/repository/UserRepository.go` (`FindByEmailCI`)
- `warhammer-battle-helper-backend/internal/service/authz.go` (`canUseTemplate`)
- `warhammer-battle-helper-backend/internal/service/authz_test.go` (`TestCanUseTemplate`)
- `warhammer-battle-helper-backend/internal/service/TemplateService.go` (`AddShare`, `RemoveShare`, `attachShares`, zmiana konstruktora)
- `warhammer-battle-helper-backend/internal/http/TemplateHandler.go` (dwa endpointy)
- `warhammer-battle-helper-backend/internal/http/GameHandler.go` (obie gałęzie szablonu przez `canUseTemplate`)
- `warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go` (wstrzyknięcie `userRepo`, routing)
- `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (karta widoczności)
- `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.sharing.test.jsx` (nowy)
- `warhammer-battle-helper-front/src/locales/en/translation.json`, `src/locales/pl/translation.json`
- `warhammer-battle-helper-front/src/style.css` (lista udostępnień)

**Powiązane:** FEATURE-102 (token-config jako prywatny singleton per użytkownik — ta sama bramka
`isVariant` chowa sekcję udostępnień), FEATURE-212 (kreator pokazuje dokładnie to, co gracz zobaczy).

## Kontekst

Szablon custom ma dziś dwa stany widoczności: prywatny (tylko właściciel) i `IsPublic` (wszyscy).
Nie ma nic pomiędzy — nie da się pokazać szablonu trzem znajomym bez wystawiania go całemu światu.

Widoczność jest dziś rozstrzygana w trzech miejscach, osobnymi kopiami tego samego warunku:

| Miejsce | Warunek | Uwaga |
|---|---|---|
| `TemplateRepository.ListVisibleToUser` | `$or: [ownerId, isPublic]` | zapytanie Mongo |
| `TemplateService.Clone` | `!src.IsPublic && src.OwnerID != ownerID` | odrzuca |
| `GameHandler` gałąź `BaseSystem` | `!t.IsPublic && t.OwnerID != userID` | odrzuca |
| `GameHandler` gałąź `gameSystem == "custom"` | **brak** | patrz niżej |

Czwarty wiersz to istniejąca dziura: tworząc grę można podać id dowolnego cudzego prywatnego
szablonu i gra go dostanie. Nie wprowadza jej ta zmiana, ale leży w kodzie, który i tak ruszamy,
i zamyka ją ten sam predykat, co resztę. Użytkownik zaakceptował dołożenie tego do zakresu.

## Zakres

Trzecia ścieżka dostępu: imienna lista odbiorców na szablonie, zarządzana przez właściciela
w kreatorze (zakładka Ogólne, sekcja Widoczność).

**Poza zakresem:** powiadomienie mailowe o udostępnieniu, dostęp do edycji (odbiorca może tylko
używać i klonować), udostępnianie token-configów (`BaseSystem` — prywatny singleton), re-sharing
przez odbiorcę.

## Decyzje projektowe

### Nieznany email jest odrzucany

`POST` rozwiązuje adres na konto w momencie udostępniania. Brak konta → `404`. Alternatywą było
zapisanie samego adresu „na zapas", żeby ktoś, kto zarejestruje się później, dostał szablon
automatycznie. Odrzucone: literówka byłaby wtedy niema — właściciel widziałby adres na liście
i czekał na kolegę, który nigdy nic nie zobaczy. Cena: nie da się udostępnić, zanim druga osoba
założy konto.

### Lista trzyma `userId`, nie adresy

`SharedWith []primitive.ObjectID`. Skoro adres i tak jest weryfikowany przy zapisie, trzymanie
go byłoby drugą kopią danych, które żyją na dokumencie użytkownika. `userId` jest odporny na
ewentualną przyszłą zmianę adresu, a filtr listy i tak dostaje `userId` z JWT za darmo.

Koszt: adresy do wyświetlenia w kreatorze trzeba doczytać. Robi to `attachShares` — **jedno**
`FindByIDs` dla wszystkich szablonów naraz, nie zapytanie na szablon.

### Dopasowanie adresu musi być case-insensitive

Rejestracja (`AuthHandler.go:76`) zapisuje `req.Email` dosłownie, a `FindByEmail` to exact match
po `bson.M{"email": email}` — baza zawiera adresy w takiej wielkości liter, w jakiej je wpisano.
Samo `strings.ToLower` na wejściu rozminęłoby się więc z kontem zapisanym jako `Jan@Example.com`.

Nowe `FindByEmailCI` robi to samo zapytanie z collation `{Locale: "en", Strength: 2}`.
Istniejących danych ani ścieżki rejestracji/logowania **nie ruszamy** — to osobna zmiana
o innym promieniu rażenia.

### Publiczny i lista są niezależne

Widoczność to `OR`, nie tryb. Włączenie `IsPublic` nie czyści listy, wyłączenie przywraca węższy
dostęp. Przełącznik, który po cichu kasuje czyjąś pracę, jest gorszy niż nadmiarowe dane.
Przy `IsPublic` sekcja udostępnień zostaje aktywna, z jednym zdaniem wyjaśnienia, że szablon
i tak widzą wszyscy.

### Dedykowane endpointy zamiast pełnej listy w `PATCH`

Kreator zapisuje ustawienia debounce'owanym `PATCH`-em z całym obiektem. Gdyby lista jechała tą
samą drogą, każdy zapis rozwiązywałby wszystkie adresy na nowo, błąd jednego wywracałby zapis
ustawień, a dwie otwarte karty po cichu nadpisywałyby sobie listę. Udostępnienie to osobna,
natychmiastowa akcja z własnym błędem.

## Projekt — backend

### Model

```go
// SharedWith lists users the owner granted read/clone access to, by user id.
// The email is resolved to an account at share time (an unknown address is
// rejected), so this never holds an address that belongs to nobody.
SharedWith []primitive.ObjectID `bson:"sharedWith,omitempty" json:"-"`

// SharedWithUsers is computed per-request (not persisted) and filled ONLY for the
// owner: the recipients' addresses are nobody else's business.
SharedWithUsers []TemplateShare `bson:"-" json:"sharedWithUsers,omitempty"`

type TemplateShare struct {
    UserID primitive.ObjectID `json:"userId"`
    Email  string             `json:"email"`
}
```

### Predykat widoczności

```go
// internal/service/authz.go — pure and unit-testable, like isGameMaster.
// A nil template authorises nobody.
func canUseTemplate(t *models.SystemTemplate, userID primitive.ObjectID) bool
```

`owner || IsPublic || slices.Contains(t.SharedWith, userID)`.

Zastępuje warunek w `Clone` i w obu gałęziach `GameHandler`. Repozytorium nie może go wołać
(decyzja zapada w Mongo), więc `ListVisibleToUser` dostaje trzecią gałąź `$or`:

```go
bson.M{"sharedWith": ownerID}   // matches when the id is an element of the array
```

Oba miejsca muszą mówić to samo — zmieniając jedno, sprawdź drugie. Tego nie pilnuje żaden test
(ten sam rodzaj pułapki co `skillValue` vs `resolveSkillValues`).

### Repozytorium

```go
func (r *TemplateRepository) AddShare(id string, ownerID, targetID primitive.ObjectID) error
func (r *TemplateRepository) RemoveShare(id string, ownerID, targetID primitive.ObjectID) error
```

`ownerID` siedzi w **filtrze** (`{_id, ownerId}`), nie w sprawdzeniu przed zapisem: autoryzacja
i zapis to jedna operacja, bez okna między odczytem a zapisem. `$addToSet` / `$pull` zamiast
read-modify-write — duplikat nie wymaga czytania dokumentu. `MatchedCount == 0` → „not found or
not owned by user", dokładnie jak w istniejącym `Delete`.

### Serwis

`NewTemplateService` dostaje drugi argument `*repository.UserRepository` (jest w `main.go:102`,
`templateService` powstaje linię niżej).

```go
// attachShares fills SharedWithUsers on the templates the viewer owns, resolving every
// id in ONE FindByIDs across all of them — never one query per template.
func (s *TemplateService) attachShares(templates []*models.SystemTemplate, viewerID primitive.ObjectID) error
```

Wołają go: `ListForUser`, `Update`, `AddShare`, `RemoveShare`.

`Update` **musi** go wołać. Kreator podmienia swój obiekt szablonu odpowiedzią z `PATCH`-a
(`onTemplateUpdated` → `replaceTemplate`), więc odpowiedź bez `sharedWithUsers` wyczyściłaby
listę w UI, nie dotknąwszy bazy.

`AddShare(id, ownerID, email)` w serwisie: normalizacja (`TrimSpace`), `FindByEmailCI`,
odrzucenie samoudostępnienia, `repo.AddShare`, zwrot świeżej listy.

### HTTP

```
POST   /templates/:id/shares        {"email": "..."}   → 200 [{userId, email}]
DELETE /templates/:id/shares/:userId                   → 200 [{userId, email}]
```

| Sytuacja | Kod | Treść |
|---|---|---|
| nie właściciel / szablon nie istnieje | 403 / 404 | jak w `UpdateTemplate` |
| email bez konta | 404 | `user not found` |
| własny adres właściciela | 400 | `cannot share with yourself` |
| adres już na liście | 200 | lista bez zmian (idempotentnie) |

## Projekt — frontend

### Lobby: bez zmian

`CreateGameDialog` grupuje przez `templates.filter(tpl => !tpl.isOwner)` → „Szablony społeczności".
`TemplateManagerDialog` renderuje przycisk klonowania dla każdego szablonu, a edycję i usuwanie
tylko dla `isOwner`. Oba wymagania z ticketu spełnia sama trzecia gałąź `$or` w repozytorium.
Zero nowego kodu w lobby.

### Kreator: karta widoczności

Pod istniejącym przełącznikiem publiczny/prywatny w `TemplateBuilder.jsx` (ok. linia 1828):

```
┌ Widoczność ─────────────────────────────┐
│ [x] Udostępnij publicznie               │
│     Opis publiczny/prywatny             │
│ ─────────────────────────────────────── │
│ Udostępnij konkretnym osobom            │
│ [ email@example.com      ] [Udostępnij] │
│ ⚠ Nie znaleziono użytkownika            │  ← helperText, tylko po błędzie
│                                          │
│ 👤 kolega@example.com            [🗑]   │
│ 👤 druga@example.com             [🗑]   │
└──────────────────────────────────────────┘
```

Stan lokalny: `shares` (inicjowany z `template?.sharedWithUsers`), `shareEmail`, `shareError`,
`sharing`. Obie akcje zwracają świeżą listę, więc `setShares(await res.json())` — stan nie jest
składany ręcznie z odpowiedzi cząstkowej.

Konwencje:
- ikony z `@mui/icons-material` (`PersonIcon`, `DeleteIcon`, `ShareIcon`)
- tooltip kosza przez `usePortalTooltip`, nigdy MUI `<Tooltip>`
- wszystkie stringi przez `t('creator.general.share*')`, komplet w `en` i `pl`
- sekcja tylko gdy `!isVariant` (ta sama bramka co przełącznik publiczny)
- Enter w inpucie dodaje, nie tylko przycisk

**Bez optymistycznej aktualizacji.** Rozstrzygnięcie email→konto zapada na backendzie, klient nie
zna wyniku z góry. Input zachowuje wpisany tekst po błędzie, lista zmienia się dopiero
z odpowiedzi serwera. Celowy wyjątek od optymistycznych aktualizacji używanych gdzie indziej.

## Testy

**Backend**
- `TestCanUseTemplate` w `authz_test.go` — właściciel, publiczny, na liście, obcy, `nil` szablon
  nie autoryzuje nikogo (wzorzec `TestIsGameMaster`).
- `TemplateRepository_test.go` (nowy) — `mtest` z `ClientType(mtest.Mock)`, jak
  `UserRepository_test.go`: `AddShare` wysyła `$addToSet`, `RemoveShare` wysyła `$pull`, oba
  z `ownerId` w filtrze.
- `attachShares` i normalizacja adresu bez testów jednostkowych: pierwsze wymaga repozytorium,
  a `TemplateService` trzyma typy konkretne, nie interfejsy (granica opisana na górze `authz.go`);
  drugie to `TrimSpace` plus collation, czyli zachowanie sterownika, nie nasza logika.

**Frontend**
- `TemplateBuilder.sharing.test.jsx` (wzorzec `TemplateBuilder.sheetWidth.test.jsx`, `fetch`
  zamockowany): udane udostępnienie wysyła właściwy `POST` i pokazuje zwróconą listę; `404`
  pokazuje komunikat i zostawia listę nietkniętą; kosz wysyła `DELETE` z właściwym `userId`.

**Weryfikacja ręczna**
- `go test ./...` w backendzie
- `CI=true npm test -- --watchAll=false --testPathPattern=TemplateBuilder` z frontu
  (baseline: `App.test.js` pada na axios ESM — to nie regresja)
- lokalny docker, dwa konta: udostępnienie, sekcja społeczności u odbiorcy, klonowanie,
  cofnięcie udostępnienia i zniknięcie szablonu z listy odbiorcy
