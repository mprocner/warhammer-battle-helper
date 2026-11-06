# Architektura w pigułce

## Jak to działa

Trzy aplikacje: backend w Go (Gin + MongoDB), frontend w React (port 3000) i osobny panel
admina w React Admin (port 3001).

**Przepływ zapisu** (np. gracz przesuwa token):

```
React → axios PATCH /games/:id/scenes/:sceneId/tokens/batch
      → JWTAuthMiddleware → GameParticipantMiddleware
      → SceneHandler → GameService (autoryzacja, walidacja) → GameRepository ($set z arrayFilters)
      → hub.BroadcastToGame(gameID, "SCENE_TOKENS_MOVED", payload)
      → każdy klient w grze: GameSession.jsx → switch (message.type) → setGameState(prev => …)
```

**Gra to jeden dokument MongoDB.** `Game` osadza sceny (a w nich tokeny, obrazki, mgłę,
rysunki), handouty, foldery, notatki, uczestników, stan muzyki i kopię szablonu własnego
systemu. Postacie (`Character`) to osobna kolekcja, bo ich `Stats` (`bson.Raw`) bywają duże.

**WebSocket: delty zamiast pełnego odświeżania.** Starsza wersja `architecture.md` mówi, że
każde zdarzenie wywołuje `fetchGameState()`. To już nieprawda: większość zdarzeń (ruch tokenu,
rysunek, handout, notatka…) jest scalana lokalnie przez `setGameState(prev => …)`. Pełny
refetch zostaje tam, gdzie zmiana może wpłynąć na to, **co** dany użytkownik w ogóle widzi:
widoczność postaci, ukrycie tokenu, zapis konfiguracji tokena, ustawienia mapy.

**Filtrowanie widoczności po stronie serwera.** Gracz nie dostaje danych, których nie powinien
widzieć, bo serwer je wycina przed wysłaniem: `FilterSceneCharacterTokensForUser`,
`FilterSceneImageTokensForUser`, maskowanie kości w pokerze. Gracz bez „karty” postaci (nie ma
go w `VisibleTo`) dostaje tylko gotową projekcję tokenu (`TokenView`), nigdy surowe `Stats`.

**Storage plików** jest lokalny (`storage.NewLocalStorage`): avatary, pliki użytkownika, muzyka
i handouty leżą na dysku serwera i są serwowane pod `/avatars`, `/user-files`, `/music-files`,
`/handouts`. `wassabi_s3_integration.md` to plan, nie stan obecny.

## Co jest nieaktualne w `docs/architecture.md`

- Systemów jest pięć: `warhammer4e`, `coc7e`, `coc7e_dark_ages`, `srd5`, `custom`.
- Tryby sceny to `select | measure | fog | drawing` (nie `grid | fog | drawing`).
- Narzędzia rysowania obejmują też `polygon` i `select`.
- Warstwy obrazków: `background | gm | tokens`.
- WebSocket scala delty (patrz wyżej), a lista zdarzeń jest dużo dłuższa
  (`internal/websocket/events.go`).

## Kluczowe pliki

| Co | Gdzie |
|---|---|
| Routing i składanie zależności | `warhammer-battle-helper-backend/cmd/warhammer-battle-helper/main.go` |
| Hub WebSocket, typy zdarzeń | `internal/websocket/hub.go`, `internal/websocket/events.go` |
| Logika biznesowa | `internal/service/GameService.go` (główny), pozostałe `*Service.go` |
| Modele | `internal/models/Game.go`, `Character.go`, `SystemTemplate.go` |
| Stan gry na froncie, obsługa zdarzeń WS | `warhammer-battle-helper-front/src/components/GameSession.jsx` |
| Połączenie WS z reconnectem | `src/hooks/useWebSocket.js` |
| Klient API | `src/api/*.js`, `src/api/axios.js` |

## Pułapki

- Nowe zdarzenie WS wymaga obsługi w `GameSession.jsx`. Bez tego klienci zobaczą zmianę
  dopiero po odświeżeniu strony.
- Jeśli zmiana może ukryć lub odsłonić dane dla kogoś, nie scalaj delty — zrób refetch albo
  przefiltruj na serwerze. Delta wysłana wszystkim to wyciek danych.
- Przy dopisywaniu elementu z delty sprawdzaj, czy nie ma go już w stanie. Refetch mógł go
  przynieść wcześniej, a wtedy dostaniesz dwa wpisy z tym samym id (patrz `HANDOUT_CREATED`).
- `GameService.go` ma kilka tysięcy linii. Decyzje autoryzacyjne trzymaj w czystych
  predykatach (`authz.go`, `access.go`), bo tylko je da się testować bez bazy.
