# FEATURE-55: Avatar i Podpis Gracza

## Opis Wymagań

### Cel
Każdy użytkownik może mieć **avatar** i **podpis** (display name) na dwóch poziomach:
- **Poziom konta** (globalny) — ustawiany w Ustawieniach → Konto, używany jako domyślny we wszystkich grach
- **Poziom gry** — nadpisuje ustawienia globalne dla konkretnej gry (Ustawienia → sekcja Gracz)

### Priorytety Wyświetlania

| Kontekst | Priorytet 1 | Priorytet 2 | Priorytet 3 |
|----------|-------------|-------------|-------------|
| **Podpis** | Podpis z gry | Podpis z konta | Email |
| **Avatar** | Avatar z gry | Avatar z konta | Inicjały (jak teraz) |

### Miejsca Wyświetlania
1. **OnlineUsersBar** — bąbelki graczy online (avatar zamiast inicjałów + tooltip z podpisem)
2. **ScenesTab** — lista graczy przy przypisaniu do scen (podpis zamiast emaila)
3. **GeneralTab** — lista uczestników w sekcji informacji o grze (podpis zamiast emaila)
4. **Logi rzutów** — identyfikator gracza który wykonał rzut (podpis zamiast emaila)

---

## Funkcjonalności

### 1. Ustawienia Konta — nowa sekcja "Konto" w SettingsPage (domyślna)
- **Avatar**: upload zdjęcia (jpg/png/gif/webp, max 5MB)
- **Podpis**: pole tekstowe (max 50 znaków)
- Sekcja "Konto" wyświetlana domyślnie po wejściu w ustawienia

### 2. Rejestracja — opcjonalne pole Podpis
- Nowe opcjonalne pole tekstowe "Podpis" w formularzu rejestracji
- **Avatar nie** — upload obrazka na etapie rejestracji jest zbyt skomplikowany (wymaga multipart/form-data zamiast JSON)

### 3. Ustawienia w Grze — nowa sekcja "Gracz" w GeneralTab
Widoczna dla WSZYSTKICH uczestników (nie tylko GM):
- **Avatar gry**: upload zdjęcia (jak avatar konta, reużywa tego samego endpointu)
- **Podpis gry**: wybór z 3 opcji:
  1. **Podpis z konta** — readonly podgląd aktualnego podpisu globalnego (lub emaila jeśli brak)
  2. **Nazwa postaci** — dropdown z postaciami widocznymi dla gracza w tej grze:
     - własne postacie (`CreatedBy == userId`)
     - postacie udostępnione przez GM (`VisibleTo` zawiera `userId`)
     - źródło: istniejący endpoint `GET /games/:id/characters` (już filtruje poprawnie)
  3. **Własny podpis** — wolne pole tekstowe

---

## Dokumentacja Techniczna

### Architektura Rozwiązania

#### Przechowywanie Podpisu w GameParticipant — Decyzja Projektowa

**Opcja A (Wybrana): Rozwiązany string**

Przechowujemy gotowy string `Signature string` i `Avatar string` bezpośrednio w `GameParticipant`. Gdy gracz wybierze "nazwę postaci", frontend wysyła aktualną nazwę postaci jako string.

Zalety: prosto, jeden string, brak logiki resolwowania po stronie backendu
Wady: jeśli nazwa postaci zmieni się po ustawieniu podpisu, podpis w grze będzie stary → gracz musi ręcznie odświeżyć

Alternatywa (odrzucona): Structured `{ type, characterId, custom }` + join przy każdym odczycie — bardziej aktualne dane, ale znacznie bardziej złożone. Zmiana nazwy postaci w trakcie sesji to rzadki przypadek.

#### Enrichment Participants przy Pobieraniu Gry

Backend przy `GET /games/:id` wzbogaca tablicę participants o dane z kolekcji `users`:
- `AccountAvatar` (z `User.Avatar`)
- `AccountSignature` (z `User.Signature`)

Implementacja: po pobraniu gry, batch query do `users` po listie userID, mapa userId → user, mapowanie na participants. Nie wymaga aggregation pipeline.

---

### Backend

#### Zmiany Modeli

**`internal/models/User.go`** — dodać dwa pola:
```go
Avatar    string `bson:"avatar,omitempty" json:"avatar,omitempty"`
Signature string `bson:"signature,omitempty" json:"signature,omitempty"`
```

**`internal/models/Game.go` — struct `GameParticipant`** — dodać cztery pola:
```go
Avatar           string `bson:"avatar,omitempty" json:"avatar,omitempty"`
Signature        string `bson:"signature,omitempty" json:"signature,omitempty"`
AccountAvatar    string `bson:"-" json:"accountAvatar,omitempty"`    // tylko JSON, nie zapisywane w DB
AccountSignature string `bson:"-" json:"accountSignature,omitempty"` // tylko JSON, nie zapisywane w DB
```
`bson:"-"` zapewnia że pola transient nie są persystowane — analogia do istniejącego `GameMasterEmail`.

#### Nowe/Zmienione Endpointy

| Method | Path | Opis |
|--------|------|------|
| `GET` | `/profile` | Rozszerzyć odpowiedź o `avatar` i `signature` (wymaga zapytania do DB) |
| `PATCH` | `/profile` | Nowy — aktualizacja `avatar` + `signature` dla konta |
| `PATCH` | `/games/:id/participant` | Nowy — aktualizacja `avatar` + `signature` uczestnika w grze |
| `POST` | `/register` | Dodać opcjonalne pole `signature` |

**`PATCH /profile`**
```json
// Request body
{ "avatar": "/avatars/filename.jpg", "signature": "Mój podpis" }
// Response
{ "email": "...", "user_id": "...", "avatar": "...", "signature": "..." }
```
Implementacja: `UserRepository.UpdateProfile(id, avatar, signature)` — `$set: {avatar, signature}`

**`GET /profile`**
Aktualnie zwraca dane z JWT (bez DB). Rozszerzyć o DB query → `UserRepository.FindByID(userID)`, zwrócić avatar + signature.

**`PATCH /games/:id/participant`**
```json
// Request body
{ "avatar": "/avatars/filename.jpg", "signature": "Podpis w grze" }
```
Autoryzacja: JWT userID musi być uczestnikiem gry. Gracz może aktualizować TYLKO swoją własną pozycję w participants.
Implementacja: `$set: { "participants.$[elem].avatar": ..., "participants.$[elem].signature": ... }` z `arrayFilters: [{ "elem.userId": userObjID }]`

#### Nowe Metody Repository

**`UserRepository.go`**:
```go
UpdateProfile(id primitive.ObjectID, avatar, signature string) error
// $set: {avatar: avatar, signature: signature}

FindByIDs(ids []primitive.ObjectID) ([]User, error)
// batch query dla enrichment participants
```

**`GameRepository.go`**:
```go
UpdateParticipant(gameID, userID primitive.ObjectID, avatar, signature string) error
// $set participants.$[elem].avatar + signature, arrayFilters userId
```

**Enrichment w `GameService.go` lub `GameHandler.go`**:
```go
// Po pobraniu gry, przed zwróceniem response:
userIDs := extractUserIDs(game.Participants)
users := userRepo.FindByIDs(userIDs)
userMap := mapByID(users)
for i := range game.Participants {
    u := userMap[game.Participants[i].UserID]
    game.Participants[i].AccountAvatar = u.Avatar
    game.Participants[i].AccountSignature = u.Signature
}
```

#### Logi Rzutów — Resolve Display Name

W `GameService.go` przy `RollSkill`, `RollWeapon`, `RollSimple` dodać helper:
```go
func resolveDisplayName(participant *models.GameParticipant, user *models.User) string {
    if participant.Signature != "" {
        return participant.Signature
    }
    if user.Signature != "" {
        return user.Signature
    }
    return user.Email
}
```
Ustawić `username = resolveDisplayName(...)` w `broadcastData`. Brak zmian w komponentach logów po stronie frontendu.

#### Rejestracja — `AuthHandler.Register`

Rozszerzyć `RegisterRequest`:
```go
type RegisterRequest struct {
    Email     string `json:"email" binding:"required,email"`
    Password  string `json:"password" binding:"required,min=8"`
    Signature string `json:"signature"` // opcjonalne
}
```

---

### Frontend

#### 1. `components/settings/SettingsSidebar.jsx`
Dodać opcję "Konto" jako pierwszą (domyślnie zaznaczoną), przed "Zmień hasło".

#### 2. Nowy: `components/settings/AccountSettingsForm.jsx`
```
┌─────────────────────────────────┐
│  Konto                          │
│                                 │
│  Avatar                         │
│  [   img   ] [Zmień avatar]     │
│                                 │
│  Podpis                         │
│  [________________________]     │
│                                 │
│            [Zapisz]             │
└─────────────────────────────────┘
```
- Reużyje `AvatarUpload.jsx` (istniejący, z `character-sheet/`)
- Po zapisaniu avatara: URL z `POST /avatars` → `PATCH /profile`
- Podpis: `<input>` tekstowy, maxLength=50
- `PATCH /profile` przy submit

#### 3. `components/Register.jsx`
Dodać pod polami email/hasło opcjonalne pole "Podpis" z placeholderem "Jak inni będą Cię widzieć w grach".

#### 4. `components/tabs/GeneralTab.jsx` — nowa sekcja "Gracz"
Dodać sekcję pod sekcją Muzyki. Wymaga dostępu do:
- `userProfile` (GET /profile) — aktualny avatar i podpis konta
- `gameState.participants` — aktualny gameAvatar i gameSignature gracza
- `characters` (GET /games/:id/characters) — dla opcji "Nazwa postaci" (lazy load)

```
┌─────────────────────────────────┐
│  Gracz                          │
│                                 │
│  Avatar w tej grze              │
│  [   img   ] [Zmień avatar]     │
│                                 │
│  Podpis w tej grze              │
│  ○ Podpis z konta               │
│    → "Mój globalny podpis"      │
│  ○ Nazwa postaci                │
│    [Wybierz postać ▼]           │
│  ○ Własny podpis                │
│    [________________________]   │
│                                 │
│            [Zapisz]             │
└─────────────────────────────────┘
```

State: `signatureType` ("account"|"character"|"custom"), `selectedCharacterId`, `customSignature`

Przy zapisie: resolve string na podstawie wybranego trybu → `PATCH /games/:id/participant`.

#### 5. `components/online-users/OnlineUserBubble.jsx`
```jsx
const avatarUrl = participant.avatar       // game avatar
               || participant.accountAvatar // account avatar
               || null

{avatarUrl
  ? <img src={getAvatarUrl(avatarUrl)} className="online-user-bubble__avatar" />
  : <span className="online-user-bubble__initials">{getInitials(participant.username)}</span>
}
```
Tooltip: `p.signature || p.accountSignature || p.email`

Nowa klasa CSS `.online-user-bubble__avatar` — img okrągłe, wypełniające kontener bąbelka.

#### 6. `components/tabs/ScenesTab.jsx` i `GeneralTab.jsx` — lista uczestników
Zastąpić `participant.email` przez `resolveDisplayName(participant)`.

#### 7. Logi rzutów
Brak zmian po stronie frontendu — backend ustawia `username` na rozwiązany display name.

#### Shared Util: `src/utils/participants.js`
```js
export const resolveDisplayName = (participant) =>
  participant?.signature || participant?.accountSignature || participant?.email || ''

export const resolveAvatar = (participant) =>
  participant?.avatar || participant?.accountAvatar || null
```

---

### i18n — Nowe Klucze

```json
"userSettings": {
  "account": {
    "title": "Account / Konto",
    "avatar": "Avatar",
    "signature": "Signature / Podpis",
    "signaturePlaceholder": "How others will see you in games / Jak inni będą Cię widzieć",
    "save": "Save / Zapisz"
  }
},
"game": {
  "player": {
    "title": "Player / Gracz",
    "avatar": "Avatar in this game / Avatar w tej grze",
    "signature": "Signature in this game / Podpis w tej grze",
    "signatureType": {
      "account": "Account signature / Podpis z konta",
      "character": "Character name / Nazwa postaci",
      "custom": "Custom / Własny podpis"
    },
    "save": "Save / Zapisz"
  }
},
"auth": {
  "signature": "Signature (optional) / Podpis (opcjonalnie)",
  "signaturePlaceholder": "How others will see you / Jak inni będą Cię widzieć"
}
```

---

### Dodatkowe Sugestie

#### Walidacja Długości Podpisu
Backend waliduje `Signature` max 50 znaków — zapobiega długim napisom psującym UI.

#### WebSocket Broadcast `PARTICIPANT_UPDATED` (opcjonalne, v2)
Gdy uczestnik zmieni podpis/avatar w grze, broadcast do pozostałych graczy żeby widzieli zmianę bez odświeżania strony.

---

### Kolejność Implementacji

**Faza 1 — Backend**:
1. `User.go` + `GameParticipant` — dodać pola modeli
2. `UserRepository` — `UpdateProfile`, `FindByIDs` (batch)
3. `GameRepository` — `UpdateParticipant`
4. `PATCH /profile`, `GET /profile` (rozszerzyć o DB query)
5. `PATCH /games/:id/participant`
6. Enrichment participants przy `GET /games/:id`
7. `GameService` — `resolveDisplayName` przy rzutach
8. `POST /register` — opcjonalne `signature`

**Faza 2 — Frontend**:
1. `AccountSettingsForm.jsx` + `SettingsSidebar` (sekcja Konto)
2. `Register.jsx` — pole signature
3. `GeneralTab.jsx` — sekcja Gracz
4. `OnlineUserBubble.jsx` — avatar
5. `ScenesTab.jsx` + `GeneralTab.jsx` — `resolveDisplayName`
6. i18n — nowe klucze

---

### Weryfikacja (End-to-End)

1. Rejestracja z podpisem → podpis widoczny w Ustawieniach → Konto
2. Ustawić avatar w koncie → bąbelek OnlineUsersBar pokazuje avatar zamiast inicjałów
3. Ustawić podpis w koncie → w logach rzutów widoczny podpis zamiast emaila
4. W grze: ustawić avatar z gry → bąbelek pokazuje avatar z gry (priorytet nad kontem)
5. W grze: wybrać podpis "Nazwa postaci" → w logach i listach widoczna nazwa postaci
6. W grze: brak podpisu z gry → fallback do podpisu z konta → fallback do emaila
7. ScenesTab: przy przypisaniu do sceny widoczny podpis zamiast emaila
8. GeneralTab: lista uczestników pokazuje podpis
9. Gracz bez żadnych ustawień → inicjały i email jak teraz (bez regresji)

---

### Krytyczne Pliki

**Backend**:
- `warhammer-battle-helper-backend/internal/models/User.go`
- `warhammer-battle-helper-backend/internal/models/Game.go`
- `warhammer-battle-helper-backend/internal/repository/UserRepository.go`
- `warhammer-battle-helper-backend/internal/repository/GameRepository.go`
- `warhammer-battle-helper-backend/internal/http/AuthHandler.go`
- `warhammer-battle-helper-backend/internal/service/GameService.go`
- `warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go`

**Frontend**:
- `warhammer-battle-helper-front/src/components/settings/SettingsSidebar.jsx`
- `warhammer-battle-helper-front/src/components/settings/AccountSettingsForm.jsx` (nowy)
- `warhammer-battle-helper-front/src/components/Register.jsx`
- `warhammer-battle-helper-front/src/components/tabs/GeneralTab.jsx`
- `warhammer-battle-helper-front/src/components/online-users/OnlineUserBubble.jsx`
- `warhammer-battle-helper-front/src/components/tabs/ScenesTab.jsx`
- `warhammer-battle-helper-front/src/locales/en/translation.json`
- `warhammer-battle-helper-front/src/locales/pl/translation.json`
