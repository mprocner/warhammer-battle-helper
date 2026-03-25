# FEATURE-76: Players Management Tab

---

## Opis funkcjonalności

Nowa zakładka **"Gracze"** w prawym panelu, widoczna wyłącznie dla MG. Umieszczona między zakładką "Muzyka" a "Ogólne".

Zakładka wyświetla listę wszystkich uczestników gry (z wyłączeniem MG). Dla każdego gracza widoczne są:
- Avatar (lub inicjał jako fallback)
- Zielona/szara kropka statusu online
- Nazwa wyświetlana (signature → accountSignature → email)
- Adres email

MG może usunąć gracza z gry przyciskiem z ikoną. Operacja wymaga potwierdzenia w modalu. Po usunięciu gracz otrzymuje WS event `PARTICIPANT_LEFT`, który powoduje wyrzucenie go z sesji.

---

## Dokumentacja techniczna

### Architektura — przepływ danych

```
MG klika "Usuń" → ConfirmModal
    ↓ potwierdzenie
DELETE /games/:id/participants/:userId  (Bearer token)
    ↓
GameHandler.KickPlayer
    ↓
GameService.KickPlayer (walidacja: tylko GM, nie można wyrzucić GM)
    ↓
GameRepository.RemoveParticipant ($pull z Participants[])
    ↓
hub.BroadcastToGame("PARTICIPANT_LEFT", { userId })
    ↓
Klient gracza: handleWebSocketMessage → wyrzucenie z sesji (istniejące zachowanie)
Klient MG: onParticipantUpdated() → fetchGameState() → odświeżona lista
```

---

### Backend

#### `internal/service/GameService.go`
Nowa metoda `KickPlayer`:
```go
func (s *GameService) KickPlayer(gameID string, gmUserID primitive.ObjectID, targetUserID primitive.ObjectID) error {
    game, err := s.gameRepo.GetByID(gameID)
    if err != nil { return err }
    if game.GameMasterID != gmUserID {
        return fmt.Errorf("only the game master can kick players")
    }
    if targetUserID == gmUserID {
        return fmt.Errorf("cannot kick the game master")
    }
    if err := s.gameRepo.RemoveParticipant(gameID, targetUserID); err != nil { return err }
    s.hub.BroadcastToGame(gameID, "PARTICIPANT_LEFT", map[string]interface{}{
        "userId": targetUserID.Hex(),
    })
    return nil
}
```

#### `internal/http/GameHandler.go`
Nowy handler `KickPlayer` — odczytuje `gameID` i `userId` z params, `gmUserID` z JWT. Kody błędów: 403 (nie GM), 400 (próba wyrzucenia GM), 500 (inne).

#### `cmd/warhammer-battle-helper/main.go`
```go
r.DELETE("/games/:id/participants/:userId", http.JWTAuthMiddleware(), gameHandler.KickPlayer)
```

---

### Frontend

#### `src/components/tabs/PlayersTab.jsx` *(nowy plik)*
Props: `gameId`, `token`, `gameState`, `onlineUserIds`, `onParticipantUpdated`

- Filtruje `gameState.participants` do graczy (`p.userId !== gameState.gameMasterId`)
- Avatar przez `getAvatarUrl(resolveAvatar(p))` z `components/Avatar`
- Nazwa przez `resolveDisplayName(p)` z `utils/participants`
- Online status: `onlineUserIds.includes(p.userId)`
- Przycisk usunięcia (`PersonRemoveIcon`) → `ConfirmModal`
- Po potwierdzeniu: `DELETE /games/:id/participants/:userId` → `onParticipantUpdated()`

#### `src/components/tabs/PlayersTab.css` *(nowy plik)*
Style BEM: `.players-tab`, `.players-tab__title`, `.players-tab__list`, `.players-tab__item`, `.players-tab__avatar`, `.players-tab__avatar-img`, `.players-tab__avatar-initials`, `.players-tab__online-dot` (+ `--online`), `.players-tab__info`, `.players-tab__name`, `.players-tab__email`, `.players-tab__kick-btn`. Motyw pergaminowy spójny z pozostałymi zakładkami.

#### `src/components/panels/RightPanel.jsx`
- Import `PlayersTab` i `PeopleOutlinedIcon`
- Zakładka `players` dodana w bloku `if (isGM)` po `music`, przed `general`
- Case `'players'` w `renderTabContent()` przekazuje `gameId`, `token`, `gameState`, `onlineUserIds`, `onParticipantUpdated`
- Usunięty nieużywany import `OnlineUsersBar`

#### i18n
```json
// en
"rightPanel": { "tabs": { "players": "Players" } },
"players": { "title": "Players", "kick": "Remove", "kickConfirm": "Remove {{name}} from the game?", "noPlayers": "No players yet" }

// pl
"rightPanel": { "tabs": { "players": "Gracze" } },
"players": { "title": "Gracze", "kick": "Usuń", "kickConfirm": "Usunąć {{name}} z gry?", "noPlayers": "Brak graczy" }
```

---

### Pliki zmienione

| Plik | Zmiana |
|------|--------|
| `internal/service/GameService.go` | +`KickPlayer` |
| `internal/http/GameHandler.go` | +`KickPlayer` handler |
| `cmd/warhammer-battle-helper/main.go` | +route DELETE participants/:userId |
| `src/components/panels/RightPanel.jsx` | +tab, +case, -unused import |
| `src/locales/en/translation.json` | +players.* keys |
| `src/locales/pl/translation.json` | +players.* keys |
| `src/components/tabs/PlayersTab.jsx` | nowy komponent |
| `src/components/tabs/PlayersTab.css` | nowy CSS |

### Utilitki do reużycia
- `src/utils/participants.js` — `resolveDisplayName`, `resolveAvatar`
- `src/components/Avatar.jsx` — `getAvatarUrl` (dołącza domenę do ścieżki `/avatars/...`)
- `src/components/common/ConfirmModal.jsx` — modal potwierdzenia

---

### Weryfikacja

1. Zaloguj jako MG → zakładka "Gracze" widoczna między "Muzyka" a "Ogólne"
2. Lista pokazuje tylko graczy (bez MG), z avatarami i statusem online
3. Kliknięcie ikony usunięcia → modal z potwierdzeniem i imieniem gracza
4. Potwierdzenie → gracz znika z listy, `gameState` odświeżony
5. Gracz po stronie frontendu otrzymuje `PARTICIPANT_LEFT` → wyrzucenie z sesji
6. Anulowanie → modal się zamyka, nic nie zmienione
