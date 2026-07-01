---
name: add-game-feature
description: >-
  Scaffolduje pionowy przekrój nowego feature gry w warhammer-battle-helper:
  model → repository → service → handler → routing w main.go → eventy WS → front.
  Używaj gdy dodajesz encję osadzoną w grze (jak Notes/Handouts/Scenes) z operacjami
  CRUD i synchronizacją realtime między graczami. Wzorzec referencyjny: feature "Notes".
---

# add-game-feature

Dodaje nowy feature gry przez wszystkie warstwy, zgodnie z aktualnym wzorcem projektu.

## Wzorzec referencyjny — feature "Notes"

**Nie zgaduj konwencji z pamięci — przeczytaj te pliki i naśladuj ich strukturę.**
To żywy, aktualny przykład kompletnego przekroju (dokumentacja w CLAUDE.md bywa nieaktualna):

| Warstwa | Plik referencyjny |
|---|---|
| Model + requesty | `warhammer-battle-helper-backend/internal/models/Game.go` (`type Note`, `CreateNoteRequest`, `UpdateNoteRequest`) |
| Eventy WS (backend) | `internal/websocket/events.go` (blok `// Notes`) |
| Repository | `internal/repository/NoteRepository.go` |
| Service | `internal/service/NoteService.go` |
| Handler | `internal/http/NoteHandler.go` |
| Routing + wiring | `cmd/warhammer-battle-helper/main.go` (szukaj `note`) |
| Eventy WS (front) | `warhammer-battle-helper-front/src/websocket/events.js` (blok `NOTE_`) |
| Merge do stanu | `src/components/GameSession.jsx` (`case WS_EVENTS.NOTE_CREATED` itd.) |

## Krok 0 — zbierz decyzje (NIE zgaduj — to część wymagająca osądu)

Zapytaj użytkownika ALBO oddeleguj do agenta `fullstack-architect`:
- **Nazwa encji** (np. `Marker`) i pola + typy.
- **Operacje**: Create / Update / Delete / Reorder / List — które?
- **Walidacja/dostęp**: kto może? Tylko GM, każdy uczestnik, tylko twórca (jak private notes)?
- **Widoczność**: broadcast do wszystkich, czy z pominięciem nadawcy (`Except`), czy do wybranych userów?
- **Rich text?** — jeśli treść to HTML, użyj sanitizacji `bluemonday` (patrz `noteHTMLPolicy` w NoteService).

## Krok 1 — backend, warstwa po warstwie

Encja `<X>` (np. `Marker`), pole na grze `<Xs>` (np. `Markers`). Naśladuj Notes:

1. **`models/Game.go`**:
   - `type <X> struct` z tagami `bson`/`json` (wzór `Note`, linie ~289).
   - `Create<X>Request` z `binding:"required"` na wymaganych polach.
   - `Update<X>Request` z polami **wskaźnikowymi** (`*string`, `*bool`) — `nil` = nie zmieniaj (partial update).
   - dodaj `<Xs> []<X>` do `type Game struct` (osadzona tablica).

2. **`websocket/events.go`**: dodaj blok stałych `Event<X>Created/Updated/Deleted = "<X>_CREATED"` (grupuj komentarzem, jak `// Notes`).

3. **`repository/<X>Repository.go`** (wzór `NoteRepository.go`):
   - struct owija `*mongo.Collection`, konstruktor `New<X>Repository(collection)`.
   - każda metoda: `context.WithTimeout(..., 5*time.Second)`, `ObjectIDFromHex(gameID)`.
   - Add → `$push`; Delete → `$pull`; Update → `$set` z **arrayFilters** (`"<xs>.$[elem]."+k`, filtr `elem._id`).
   - `MatchedCount == 0` → `fmt.Errorf("game not found")`.
   - metoda `GetGame(gameID)` do sprawdzania uprawnień.

4. **`service/<X>Service.go`** (wzór `NoteService.go`):
   - struct trzyma `repo` + `*websocket.Hub`.
   - każda mutacja: `GetGame` → `isParticipant` (odrzuć z `"not a participant"`) → ewentualny `canAccess` → wywołanie repo → **broadcast**.
   - broadcast: `hub.BroadcastToGameExcept(gameID, Event<X>..., payload, senderID)` — pomijamy nadawcę, bo on już zrobił optimistic update na froncie.

5. **`http/<X>Handler.go`** (wzór `NoteHandler.go`):
   - struct trzyma service. Metody: `c.Param("id")`, `ShouldBindJSON`, `user_id` z JWT claims, `ObjectIDFromHex`.
   - mapowanie błędów: `strings.Contains(err, "not a participant")` → **403**; reszta → **400**; sukces → **200/201**.

## Krok 2 — rejestracja w main.go (NAJCZĘSTSZY POMINIĘTY KROK)

W `cmd/warhammer-battle-helper/main.go`:
- **3 linie wiring** (obok `note*`): `<x>Repo := repository.New...`, `<x>Service := service.New...(repo, hub)`, `<x>Handler := http.<X>Handler{...}`.
- **blok tras** pod komentarzem `// <Xs>`: `game.POST/GET/PUT/DELETE(...)`.

## Krok 3 — frontend

1. **`src/websocket/events.js`**: dodaj `<X>_CREATED: '<X>_CREATED'` itd. do `WS_EVENTS`.
2. **`src/components/GameSession.jsx`**: dodaj `case WS_EVENTS.<X>_CREATED/UPDATED/DELETED` w switchu wiadomości.
   - **Scalaj konkretny payload w stan (`setGameState(prev => ...)`), NIE rób `fetchGameState()`.**
     Created → `[...prev.<xs>, payload.<x>]`; Updated → `.map`; Deleted → `.filter` po id.
   - To aktualny wzorzec (targeted merge). Pełny refetch = przestarzałe, nie kopiuj go.
3. Komponent UI + wywołania API — poza zakresem tego skilla (to warstwa prezentacji).

## Krok 4 — i18n

Nowe stringi UI wpisuj jako klucze `t('...')` (nigdy wprost w JSX). Po dodaniu kluczy
uruchom skill **i18n-sync**, żeby domknąć `en` + `pl`.

## Krok 5 — weryfikacja

- backend kompiluje się: `cd warhammer-battle-helper-backend && go build ./...`
- **każda trasa w main.go ma odpowiednik** w `GameSession.jsx` (event WS) i odwrotnie —
  brak pary = feature nie zsynchronizuje się między graczami.
- każdy `Event<X>` w `events.go` ma bliźniaka w `events.js`.
