# FEATURE-53: Users Online

## Opis funkcjonalności

Sekcja "Gracze online" widoczna w nagłówku prawego panelu (nad zakładkami). Pokazuje wszystkich uczestników gry (GM + gracze) z ich aktualnym statusem połączenia WebSocket.

**Wygląd:**
```
┌── Prawy panel ──────────────────────────┐
│  ● MK  ● FB  ○ BN   ← bąbelki z dotem │
├─────────────────────────────────────────┤
│ [Chat] [Scenes] [Files] [Music] ...     │
│ ...                                     │
```

- `●` (zielony dot) = połączony przez WebSocket
- `○` (szary dot, przezroczysty bąbelek) = rozłączony
- Hover na bąbelku → portal tooltip: pełna nazwa + rola (GM / Player)
- Inicjały generowane z username (np. "Mateusz K." → "MK")

**Zachowanie:**
- Lista aktualizuje się natychmiast gdy ktoś dołączy lub rozłączy się (WS push)
- Widoczna dla wszystkich uczestników (gracze i GM widzą to samo)
- GM wyświetlany jako pierwszy z oznaczeniem roli

## Dokumentacja techniczna

**WS Event:** `USERS_ONLINE`
```json
{
  "type": "USERS_ONLINE",
  "gameId": "...",
  "payload": {
    "onlineUserIds": ["userId1", "userId2"]
  }
}
```

**Kiedy emitowany:** po każdym connect/disconnect WebSocket w hub.go (Register/Unregister)

**Backend zmiany:**
- `hub.go`: `GetGameOnlineUserIDs(gameID)`, `BroadcastOnlineUsers(gameID)`, trigger w Run() na Register/Unregister

**Frontend — nowe komponenty (modular):**
- `hooks/useOnlineUsers.js` — custom hook: state `onlineUserIds` + obsługa WS event
- `components/online-users/OnlineUsersBar.jsx` — kontener: przyjmuje participants + onlineUserIds, renderuje listę bąbelków
- `components/online-users/OnlineUserBubble.jsx` — jeden bąbelek: inicjały + dot + portal tooltip
- Zmiany istniejących: `GameSession.jsx`, `RightPanel.jsx`, `style.css`, i18n
