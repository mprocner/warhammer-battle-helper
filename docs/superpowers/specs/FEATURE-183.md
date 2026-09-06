# FEATURE-183 — Sloty tokenów postaci nie aktualizują się na żywo u graczy

**Status:** zaprojektowane, gotowe do planu implementacji
**Zgłoszone:** 2026-09-05

## Objaw

MG zmienia wartość na tokenie postaci. Gracz **bez karty** tej postaci nie widzi żadnej zmiany.
Zmiana pojawia się dopiero po tym, jak MG ukryje slot i odkryje go z powrotem.

Zgłoszony scenariusz:

1. MG dodaje slot do tokena (stan „oślepienie") jako widoczny dla graczy; token też jest widoczny.
2. MG podbija poziom stanu na 2.
3. U gracza — bez zmian.
4. MG wyłącza pokazywanie slota.
5. MG włącza pokazywanie slota.
6. Dopiero teraz gracz widzi poziom 2.

Oczekiwane: zmiana widoczna natychmiast po zmianie wartości przez MG.

## Przyczyna

Gracz bez karty **nie renderuje tokena z dokumentu postaci**. Serwer piecze mu gotowy, zamaskowany
DTO — `GameCharacter.TokenView` — w `FilterSceneCharacterTokensForUser`
(`internal/service/GameService.go:2628`). Ten DTO powstaje **wyłącznie podczas pełnego GET gry**.
Żaden broadcast go nie odświeża.

Stąd dwie niezależne dziury.

### A. Zmiany na postaci

`PatchState` → `broadcastCharacterUpdated` (`internal/http/CharacterHandler.go:403`) wysyła
`CHARACTER_UPDATED` z całą postacią. Front (`GameSession.jsx:298`) tylko mapuje po
`prev.characters`. U gracza bez karty tej postaci w liście nie ma — GET filtruje po `VisibleTo`
(`CharacterHandler.go:111`) — więc `.map()` jest no-opem. `tokenView` w placemencie zostaje
nietknięty.

Ta sama ścieżka dotyczy `PatchKilled` i `PatchStatField`.

### B. Zmiany gear

`broadcastCharTokenGear` (`GameService.go:1588`) świadomie wysyła `BroadcastToUsers` tylko do MG
i posiadaczy karty. Komentarz w kodzie sam to nazywa:

> A targeted masked live broadcast to card-less players is a Phase-3 refinement, once the masking
> engine exists.

Silnik maskowania powstał (`token_masking.go`), adresowany broadcast — nie.

Dotyczy 9 granularnych endpointów: `SetCharSlotValue`, `SetCharSlotVisibility`,
`SetCharSlotStructure`, `ClearCharSlotOverride`, `SetCharBarVisibility`, `SetCharBarValuePatch`,
`AddCharBar`, `EditCharBar`, `RemoveCharBar` (`GameService.go:1642–1780`).

### Dlaczego hide/show „naprawia"

Panel gear zapisuje przez `saveGear` (całe PUT). `SetCharGear` robi `BroadcastToGame` **bez** pola
`tokenGear`, front widzi `tokenGear === undefined` (`GameSession.jsx:554`) i woła
`fetchGameState()`. Maska przelicza się od nowa, ze świeżymi stanami. To jedyna działająca ścieżka.

## Przy okazji — wyciek

`broadcastCharacterUpdated` używa `BroadcastToGame` i pakuje **pełną postać** (surowe `Stats`,
wszystkie `States`). GET filtruje po `VisibleTo`, WS nie filtruje wcale. Gracz bez karty dostaje
surowe staty przeciwnika po drucie — nie renderuje ich, ale ma je w pamięci przeglądarki.

Ta sama klasa co otwarty `lobby-scenes-leak`.

---

## Zasada projektowa — dwie klasy zdarzeń, dwa mechanizmy

| | **Przynależność** | **Treść** |
|---|---|---|
| co się zmienia | token pojawia się / znika | wartości na tokenie, który gracz **już widzi** |
| przykłady | toggle `Hidden`, dodanie/usunięcie placementu, zmiana `VisibleTo`, panel gear Save | poziom stanu, HP, ręczny licznik w slocie, `killed` |
| częstotliwość | rzadko, decyzja MG | co kliknięcie +/− |
| mechanizm | pełny `fetchGameState()` | adresowany patch `tokenView` |
| status | **działa, nie ruszamy** | **zakres FEATURE-183** |

Kryterium podziału: **czy zmiana może przesunąć gracza między klasą widzącą a niewidzącą.**
Jeśli tak — tylko serwerowy filtr wie, po której stronie gracz wyląduje, więc musi przemówić pełnym
stanem. Jeśli nie — zbiór odbiorców jest niezmieniony, można dosłać samą różnicę.

To odgradza od klasy błędów, w której optymalizacja szybkości gubi regułę widoczności. Ukrycie
tokena nigdy nie idzie „szybką ścieżką".

Konsekwencja: `SetCharGear` (panel Save) **zostaje na refetchu**, mimo że jest zmianą gear — zmienia
widoczność slotów, czyli przynależność na poziomie elementu.

### Maska jest wspólna dla wszystkich graczy bez karty

Kluczowa obserwacja, na której stoi cały mechanizm:

| | zależy od `userID`? | co to jest |
|---|---|---|
| `keepSceneCharacterForViewer` | tak | **kto** dostaje |
| `buildMaskedTokenView` | **nie** | **co** dostaje |

`userID` nie wpływa na treść maski — wpływa wyłącznie na przynależność do zbioru. Gracze bez karty
to **jedna klasa**; każdy dostaje bajt w bajt to samo. Więc: licz maskę **raz**, wyślij **jedną**
kopią.

Sygnał alarmowy w review: `for _, player := range players { buildMaskedTokenView(...) }`.

### Jednostką maski jest placement, nie postać i nie scena

`TokenGear` siedzi na placemencie (`models/Game.go`):

> TokenGear ... Lives on the placement, NOT the Character, because one card can have several
> placements that must not share gear.

`PatchState` dostaje tylko `charId` — żadnej sceny, żadnego placementu. Zmiana promieniuje na każdy
placement tej karty. Ten sam goblin na scenie „Karczma" i „Las" to dwa gearsy i **dwie różne maski**
z tych samych `stats`/`states`.

W praktyce jeden placement na scenę: wszystkie mutacje placementu adresują przez `characterId`
(`DndContext.jsx:431`), więc duplikat byłby nieadresowalny. Nie jest to jednak nigdzie egzekwowane
— patrz „Poza zakresem".

Dlatego payload jest **listą**, nie pojedynczym obiektem: klient trzyma w `gameState` wszystkie
sceny, nie tylko aktywną.

---

## Projekt

### 1. Hub — bliźniak-denylista

```go
func (h *Hub) BroadcastExceptUsers(gameID, messageType string, payload map[string]interface{}, excludeUserIDs []string)
```

Kopia `BroadcastToUsers` (`hub.go:243`) z odwróconym warunkiem przynależności.

Dlaczego denylista, nie allowlista: allowlista wymagałaby **wyliczenia** zbioru graczy bez karty,
czyli pobrania listy uczestników gry z bazy przy każdym kliknięciu +/−. Denylista odejmuje od tego,
co hub już trzyma w pamięci. Adresowanie przez negację, nie przez wyliczenie.

### 2. Nowe zdarzenie

```
SCENE_CHARACTER_TOKEN_VIEW_UPDATED
{ views: [ { sceneId, placementId, name, avatar, killed, tokenView } ] }
```

Osobne zdarzenie, **nie** trzeci kształt `SCENE_CHARACTER_TOKEN_UPDATED`. Tamto ma kardynalność 1
(`sceneId` + `placementId` w korzeniu payloadu), to jest listą. Wciśnięcie listy w pole zdarzenia
jednoplacementowego to miejsce, gdzie ktoś przeczyta korzeń zamiast elementu.

Ścieżka gear produkuje listę jednoelementową. Jeden kształt, zawsze.

Wysyłane **wyłącznie** przez `BroadcastExceptUsers` z wykluczeniem MG i posiadaczy karty.

### 3. Zawartość wpisu — odwzorowanie pętli wzbogacania

Wpis niesie więcej niż `tokenView`, bo dokładnie odwzorowuje pętlę z `GameService.go:156–166`:

```go
gc.Name = ch.Name
gc.Avatar = ch.Avatar
gc.Killed = ch.Killed // computed-only; lets a card-less token show the dead strike
```

Gracz bez karty nigdy nie dostaje dokumentu postaci. Nazwa, avatar i `killed` docierają do niego
wyłącznie wgrane w placement, przez tę pętlę — a ona chodzi tylko przy pełnym GET.

Dlatego `PatchKilled` ma **ten sam bug**: MG oznacza goblina jako zabitego, gracz nie widzi
przekreślenia do następnego refetchu.

Wpis = ta pętla + maska. Kompletny zbiór tego, co gracz bez karty wyprowadza z postaci.

Front to konsumuje bez zmian: `placedCharacters.js:15–22` buduje stub dla gracza bez karty właśnie
z `sc.name` / `sc.avatar` / `sc.killed`.

### 4. Blueprint w `GameService` — warunek konieczny

`buildMaskedTokenView` potrzebuje blueprintu. Dla systemów wbudowanych blueprint **nie jest
zapisany w grze** — dokłada go `attachTokenConfig` (`GameHandler.go:766`), który żyje w pakiecie
`http` i wymaga `TemplateService`. `GameService` go nie ma.

Dziś trzyma to niepisany warunek: *„attachTokenConfig musi pobiec przed filtrem"*, pamiętany
osobno przez `GameHandler.go:193`, `GameHandler.go:597` i `SceneHandler.go:43`.

Broadcast nie idzie przez żaden z tych handlerów. **Bez tej zmiany dostanie `nil` blueprint i po
cichu wyśle puste maski — kasując graczom overlay zamiast go zaktualizować.** Najgorszy tryb
awarii: cicha utrata danych wyglądająca jak „slot zniknął".

Rozwiązanie: `templateService` wstrzyknięty do `GameService`; rozwiązywanie blueprintu jako funkcja
w pakiecie `service`; `attachTokenConfig` staje się jej cienką nakładką.

Cyklu importów nie ma: `TemplateService` zależy tylko od `repository` (`TemplateService.go:11`),
a `gameService` powstaje w `main.go:126`, przed handlerami z linii 213.

### 5. Wstrzyknięcie `GameService` do `CharacterHandler`

```go
// main.go:213 — dziś
characterHandler := http.CharacterHandler{CharacterRepo: charRepo, GameRepo: gameRepo, Hub: hub}
```

Brakuje `GameService`, a `buildMaskedTokenView` jest nieeksportowane. Dochodzi jedno pole.
`PatchState`, `PatchKilled` i `PatchStatField` wołają po zapisie nowy punkt wejścia.

### 6. Punkty wejścia — dwa, jeden rdzeń

Nowy plik `internal/service/token_view_broadcast.go`, obok `token_masking.go`:

```go
func (s *GameService) BroadcastTokenViewsForPlacement(gameID string, sceneID, placementID primitive.ObjectID)
func (s *GameService) BroadcastTokenViewsForCharacter(gameID string, charID primitive.ObjectID)
```

Oba: zbierz wpisy → odsiej ukryte placementy → policz maski **raz** → jeden
`BroadcastExceptUsers`. Pusta lista → brak wysyłki.

Wywołania:
- `BroadcastTokenViewsForPlacement` — obok każdego z 9 `broadcastCharTokenGear`
- `BroadcastTokenViewsForCharacter` — w `PatchState`, `PatchKilled`, `PatchStatField`

### 7. Ukryty placement wypada przed wysyłką

Placement z `Hidden = true` **nie trafia do listy** dla graczy bez karty. Samo zdarzenie zdradza
istnienie tokena — ten sam wyciek, przed którym broni `keepSceneCharacterForViewer`. Lista bywa
więc krótsza niż liczba placementów.

### 8. Front — dwa pliki

`websocket/events.js` — nowa stała `SCENE_CHARACTER_TOKEN_VIEW_UPDATED`.

`GameSession.jsx` — nowy `case`: dla każdego wpisu z `views` znajdź placement po `placementId`
i wmerguj `{name, avatar, killed, tokenView}`, potem `setCharacterUpdateTrigger`. Logika scalania
wychodzi do czystej funkcji w `utils/` (wzorem `placedCharacters.js`), `GameSession.jsx` woła ją
jedną linijką.

**Zero zmian w `TokenOverlay.jsx`.** Gałąź `if (tokenView)` (linia 82) renderuje maskę dosłownie.
To dywidenda z upieczonego DTO — `models/Game.go` o `CharacterTokenView`:

> The client renders it verbatim: no blueprint lookup, no visibility recomputation, zero
> client/server masking drift.

Renderer jest czystą funkcją tego obiektu; skąd obiekt przyszedł — GET czy WS — nie ma znaczenia.
Gdyby zrealizowano pierwotny §5 planu FEATURE-102 (surowy gear + wycinek statów rozwiązywany na
kliencie), front trzymałby blueprint i logikę maskowania, a drugi kanał musiałby to odtworzyć.

Adresowanie się spina: `placedCharacters.js:33` mapuje `placementId: sc.id`.

### 9. Wyciek

`broadcastCharacterUpdated` (`CharacterHandler.go:409`): `BroadcastToGame` →
`BroadcastToUsers(MG + VisibleTo)`.

Bezpieczne, bo gracz bez karty nie miał tej postaci w `prev.characters` — `.map()` na
`CHARACTER_UPDATED` był u niego no-opem. Zabieramy mu wiadomość, której nie umiał użyć.

---

## Testy

### Backend (obok `token_masking_test.go`)

- ukryty placement wypada z listy dla graczy bez karty
- MG i posiadacz karty są w liście wykluczeń
- pusta lista → brak wysyłki
- ścieżka postaci zbiera po wielu scenach, po jednym wpisie na scenę
- dwa placementy tej samej karty z różnym gear dają **różne** maski
- `BroadcastExceptUsers` — test na samym hubie

### Frontend

- czysta funkcja scalająca `views` w `gameState`: trafienie w placement po `placementId`,
  brak trafienia = no-op, wiele scen naraz

Komponenty sceny nie mają testów renderujących (jsdom, brak layoutu) — dlatego logika scalania musi
wyjść z komponentu, żeby dała się pokryć.

Uruchamianie frontu: `CI=true npm test -- --watchAll=false` z `warhammer-battle-helper-front/`.
Znany baseline fail: `App.test.js` (axios ESM) — nie jest regresją.

## Brzegi

| sytuacja | zachowanie |
|---|---|
| blueprint `nil` / wyłączony | maska `nil` → `tokenView: null`. Poprawny stan (goły token), nie awaria — pod warunkiem §4 |
| wszystkie placementy ukryte | lista pusta → brak wysyłki |
| gracz offline | hub pomija; dogoni przy następnym GET |
| MG i posiadacz karty | wykluczeni; dostają swoją wiadomość z surowym `tokenGear` — ścieżka bez zmian |
| równoległy PATCH gear i stanu | każdy re-czyta z bazy; ostatni wygrywa, stan spójny |

## Poza zakresem

- **Brak serwerowej ochrony przed duplikatem placementu.** `AddCharacterToScene`
  (`GameService.go:1491`) robi goły `$push`, bez sprawdzenia. Trzyma się to wyłącznie na tym, że
  front ciągnie kartę z puli w sidebarze. Uśpiona dziura.
- **`lobby-scenes-leak`** — `GET /games` wysyła pełne dokumenty gry do lobby. Inna klasa, ten sam
  rodzaj przyczyny.
- **„Edit blueprint ↗"** w panelu gear — drugi odłożony punkt z FEATURE-102, niezwiązany.
