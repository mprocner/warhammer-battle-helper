# FEATURE-187 — Widoczność tokenów postaci na żywo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ukrycie tokena postaci ikoną oczka ma znikać u gracza natychmiast, bez F5, a posiadacz karty (`VisibleTo`) ma widzieć token dalej — również gdy kartę nadano lub odebrano w trakcie sesji.

**Architecture:** Serwerowy filtr `FilterSceneCharacterTokensForUser` jest już poprawny i pozostaje jedynym miejscem znającym regułę widoczności. Naprawa polega na tym, że handlery WebSocket w `GameSession.jsx` przestają lokalnie zgadywać wynik tej reguły i wywołują `fetchGameState()`, który przechodzi przez filtr. Payload zdarzenia `SCENE_CHARACTER_UPDATED` kurczy się do `{ sceneId }`, bo nikt go już nie czyta, a dziś niesie do wszystkich graczy informację o istnieniu ukrytego tokena.

**Tech Stack:** Go + Gin (backend, `warhammer-battle-helper-backend/`), React + CRA (frontend, `warhammer-battle-helper-front/`), WebSocket hub do broadcastów.

**Spec:** `docs/superpowers/specs/2026-09-04-FEATURE-187-token-visibility-live-design.md`

## Global Constraints

- **Kod, komentarze i nazwy testów w plikach źródłowych: ANGIELSKI.** Decyzja użytkownika, ta sama co w FEATURE-131 i FEATURE-216. Proza planu i teksty UI to osobna sprawa. Istniejących polskich komentarzy w dotkniętych plikach NIE tłumaczymy.
- Wszystkie stringi UI przez `t('klucz')` z angielskimi kluczami, tłumaczenia en + pl równolegle. (To zadanie nie dodaje żadnych stringów UI.)
- Reguła widoczności tokena (`Hidden && !hasCard`) żyje wyłącznie w `GameService.FilterSceneCharacterTokensForUser`. Nie wolno jej duplikować we froncie ani w ścieżce broadcastu.
- Posiadacz karty widzi ukryty token **normalnie, bez żadnego oznaczenia**. Przygaszenie (`map-char-token--hidden`) zostaje wyłącznie dla GM — logika `hiddenFromPlayers = isGM && hidden` w `MapCharacterToken.jsx:277` NIE ulega zmianie.
- Brak backward compat — stare kształty payloadów można usuwać bez okresu przejściowego.
- Kolejność zadań jest wiążąca: Task 1 (front) przed Task 2 (backend). Odwrotna kolejność zostawia commit, w którym front destrukturyzuje nieistniejące już pole `hidden` i zapisuje `undefined` na placemencie, psując przygaszenie u GM.
- Zdarzenie `SCENE_CHARACTER_UPDATED` ma dokładnie jednego producenta (`GameService.go:1533`) i jednego konsumenta (`GameSession.jsx:533`) — zweryfikowane greppem. Ruchy tokena idą osobnym zdarzeniem `SCENE_CHARACTER_MOVED`, więc zmiany w tym payloadzie nie dotykają przeciągania tokenów.

## Uwaga o testach

Ta zmiana nie ma sensownego szwu testowego i plan tego nie udaje:

- **Backend:** `GameService.hub` to konkretny `*websocket.Hub`, nie interfejs (`GameService.go:26`), więc payloadu broadcastu nie da się zaobserwować w teście jednostkowym bez refaktoru wstrzykującego interfejs huba. Refaktor tej wielkości jest poza zakresem naprawy dwóch handlerów. Logika filtra, która faktycznie decyduje o widoczności, ma już pokrycie i zostaje nietknięta.
- **Frontend:** handlery WS są gałęziami `switch` wewnątrz `GameSession.jsx` — komponentu renderującego całą sesję gry, bez żadnego testu. Wyciągnięcie ich do testowalnej jednostki to osobna zmiana strukturalna, nie część tej naprawy.

Zamiast testów automatycznych każde zadanie kończy się lintem i istniejącymi suitami jako regresją, a Task 4 to pełna weryfikacja manualna dwoma sesjami. Nie wolno raportować feature'a jako gotowego przed przejściem Task 4.

---

### Task 1: Handler `SCENE_CHARACTER_UPDATED` pobiera stan z serwera

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/GameSession.jsx:533-556`

**Interfaces:**
- Consumes: `fetchGameState()` — `useCallback` zdefiniowany w tym samym komponencie (`GameSession.jsx:103`), zwraca `Promise<boolean>`; jest już w tablicy zależności handlera WS (`GameSession.jsx:858`), więc żadnych zmian w dependency array nie potrzeba. Wzorzec użycia bez `await` jest w tym samym `switch` (`GameSession.jsx:211`, `221`).
- Produces: brak — zadanie nie eksportuje niczego nowego.

- [ ] **Step 1: Podejrzyj obecny kształt handlera**

Run: `sed -n 533,556p warhammer-battle-helper-front/src/components/GameSession.jsx`

Expected: gałąź `case WS_EVENTS.SCENE_CHARACTER_UPDATED:` z destrukturyzacją `{ sceneId: scuSceneId, characterId: scuCharId, hidden: scuHidden }` i wywołaniem `setGameState` mapującym sceny.

- [ ] **Step 2: Zastąp lokalną mutację refetchem**

Zamień CAŁĄ gałąź (od `case WS_EVENTS.SCENE_CHARACTER_UPDATED: {` do zamykającego ją `}`) na poniższy kod. Komentarze w kodzie źródłowym pisze się po angielsku — patrz Global Constraints:

```jsx
      case WS_EVENTS.SCENE_CHARACTER_UPDATED: {
        // Token visibility toggled. Refetch instead of mutating locally: the rule
        // "hidden && no card" lives only in FilterSceneCharacterTokensForUser, so only a
        // refetch drops the token for a player without the card, keeps it for a card-holder,
        // and delivers the hidden flag the GM's dimming needs. The event payload is bare.
        fetchGameState();
        setCharacterUpdateTrigger(prev => prev + 1);
        break;
      }
```

Znikają: destrukturyzacja `message.payload` i całe `setGameState`. Zostaje `setCharacterUpdateTrigger`, bo odświeża `fightZones` w `DndContext` (`DndContext.jsx:842`).

- [ ] **Step 3: Lint — złap osierocone zmienne**

Run: `cd warhammer-battle-helper-front && npx eslint src/components/GameSession.jsx`

Expected: brak błędów. Ostrzeżenie `Browserslist: browsers data ... is 15 months old` jest normalne i nie jest błędem. Gdyby pojawiło się `no-unused-vars` dla `scuSceneId` / `scuCharId` / `scuHidden` — nie usunięto całej linii destrukturyzacji.

- [ ] **Step 4: Suita frontu jako regresja**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`

Expected: PASS poza znanym baseline'owym failem `App.test.js` (axios ESM). Ten jeden fail nie jest regresją; jakikolwiek inny fail — jest.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/GameSession.jsx
git commit -m "fix: FEATURE-187 refetch game state on token visibility toggle"
```

---

### Task 2: Payload `SCENE_CHARACTER_UPDATED` skurczony do `{ sceneId }`

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/service/GameService.go:1528-1538`

**Interfaces:**
- Consumes: handler z Task 1, który nie czyta już żadnego pola payloadu.
- Produces: zdarzenie `SCENE_CHARACTER_UPDATED` z payloadem `{ "sceneId": string }`. Żaden inny kod ani nie produkuje, ani nie konsumuje tego zdarzenia.

- [ ] **Step 1: Podejrzyj obecny broadcast**

Run: `sed -n 1528,1539p warhammer-battle-helper-backend/internal/service/GameService.go`

Expected: komentarz „Visibility toggle → tell every client to refetch scene characters…" i `if req.Hidden != nil` z payloadem niosącym `sceneId`, `characterId`, `hidden`.

- [ ] **Step 2: Usuń z payloadu `characterId` i `hidden`**

Zamień blok:

```go
	// Visibility toggle → tell every client to refetch scene characters. The refetch re-applies the
	// server filter (FilterSceneCharacterTokensForUser), which drops the token for players without
	// the card and keeps it for the GM (dimmed) and card-holders — no per-user targeting needed here.
	if req.Hidden != nil {
		s.hub.BroadcastToGame(gameID, websocket.EventSceneCharacterUpdated, map[string]interface{}{
			"sceneId":     sceneID.Hex(),
			"characterId": characterID.Hex(),
			"hidden":      *req.Hidden,
		})
		return nil
	}
```

na:

```go
	// Visibility toggle → tell every client to refetch scene characters. The refetch re-applies the
	// server filter (FilterSceneCharacterTokensForUser), which drops the token for players without
	// the card and keeps it for the GM (dimmed) and card-holders — no per-user targeting needed here.
	// The payload is deliberately bare: characterId + hidden would tell every player that a hidden
	// token exists under that character, and nobody reads them now that the client refetches.
	if req.Hidden != nil {
		s.hub.BroadcastToGame(gameID, websocket.EventSceneCharacterUpdated, map[string]interface{}{
			"sceneId": sceneID.Hex(),
		})
		return nil
	}
```

Reszta funkcji (gałąź geometrii budująca `payload` z `x`/`y`/`w`/`h`/`zIndex`/`rotation` i wysyłająca `EventSceneCharacterMoved`) zostaje bez zmian.

- [ ] **Step 3: Kompilacja — złap nieużywany parametr**

Run: `cd warhammer-battle-helper-backend && go build ./...`

Expected: sukces, bez wyjścia. `characterID` jest dalej używane w gałęzi geometrii poniżej, więc nie stanie się nieużywane.

- [ ] **Step 4: Testy backendu jako regresja**

Run: `cd warhammer-battle-helper-backend && go test ./...`

Expected: `ok` dla każdego pakietu z testami. Filtr widoczności nie był ruszany, więc `internal/service` musi przejść bez zmian.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/GameService.go
git commit -m "fix: FEATURE-187 strip hidden-token details from visibility broadcast"
```

---

### Task 3: Handler `CHARACTER_VISIBILITY_UPDATED` dowozi token na żywo

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/GameSession.jsx:313-326`

**Interfaces:**
- Consumes: `fetchGameState()` (jak w Task 1 — ta sama funkcja, ta sama tablica zależności, żadnych zmian).
- Produces: brak.

- [ ] **Step 1: Podejrzyj obecny handler**

Run: `sed -n 313,326p warhammer-battle-helper-front/src/components/GameSession.jsx`

Expected: gałąź `case WS_EVENTS.CHARACTER_VISIBILITY_UPDATED:` z destrukturyzacją `{ characterId: visCharId, visibleTo }`, `setGameState` mapującym `prev.characters` i `setCharacterDataTrigger`.

- [ ] **Step 2: Dołóż refetch, zachowując lokalną aktualizację `visibleTo`**

Zamień CAŁĄ gałąź na:

```jsx
      case WS_EVENTS.CHARACTER_VISIBILITY_UPDATED: {
        const { characterId: visCharId, visibleTo } = message.payload;
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            characters: (prev.characters || []).map(c =>
              c.id === visCharId ? { ...c, visibleTo } : c
            ),
          };
        });
        setCharacterDataTrigger(prev => prev + 1);
        // Granting/revoking a card also changes which hidden tokens we may receive —
        // FilterSceneCharacterTokensForUser decides that, so refetch the scene. The local
        // visibleTo update above stays: the visibility modal must react instantly.
        fetchGameState();
        break;
      }
```

Jedyna zmiana to komentarz i wywołanie `fetchGameState()` przed `break` — reszta gałęzi bez zmian.

- [ ] **Step 3: Lint**

Run: `cd warhammer-battle-helper-front && npx eslint src/components/GameSession.jsx`

Expected: brak błędów (ostrzeżenie Browserslist dopuszczalne).

- [ ] **Step 4: Suita frontu jako regresja**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false`

Expected: PASS poza baseline'owym failem `App.test.js`.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/GameSession.jsx
git commit -m "fix: FEATURE-187 refetch scene tokens when card visibility changes"
```

---

### Task 4: Weryfikacja manualna dwoma sesjami

**Files:**
- Modify: żadnych (zadanie czysto weryfikacyjne).

**Interfaces:**
- Consumes: zmiany z Tasków 1–3.
- Produces: dowód, że feature działa. Bez przejścia tego zadania feature nie jest gotowy.

- [ ] **Step 1: Podnieś stack i zdobądź dostęp dla dwóch kont**

Uruchom lokalny stack docker i przygotuj dwa zalogowane konta w jednej grze: jedno jako GM, drugie jako gracz (dwie przeglądarki albo okno prywatne). Recepta na wydanie JWT na lokalnym stacku (wyczyszczenie `activationToken`, konto nieaktywne) jest w pamięci `local-e2e-verification-recipe`.

Expected: obaj widzą tę samą scenę, GM ma na niej co najmniej jeden token postaci.

- [ ] **Step 2: Oczko na tokenie postaci, której gracz NIE ma w `VisibleTo`**

Jako GM kliknij ikonę oczka na tokenie (pierścień tokena, `token-visibility-toggle`).

Expected: u gracza token znika **natychmiast, bez odświeżania strony**. U GM token zostaje, przygaszony (`map-char-token--hidden`), ikona przełącza się na `VisibilityOffIcon`.

- [ ] **Step 3: Odkrycie tego samego tokena**

Jako GM kliknij oczko ponownie.

Expected: token wraca u gracza natychmiast; u GM przygaszenie znika.

- [ ] **Step 4: Oczko na tokenie postaci, którą gracz MA w `VisibleTo`**

Nadaj graczowi kartę tej postaci (menu zarządzania widocznością), potem jako GM ukryj token oczkiem.

Expected: token zostaje u gracza i wygląda **normalnie — bez przygaszenia**. U GM przygaszony.

- [ ] **Step 5: Nadanie karty przy ukrytym tokenie**

Zostaw token ukryty. Postaci, której gracz nie ma, nadaj mu kartę w menu widoczności.

Expected: ukryty token pojawia się graczowi na mapie natychmiast, bez F5.

- [ ] **Step 6: Odebranie karty przy ukrytym tokenie**

Odbierz graczowi tę kartę.

Expected: token znika graczowi natychmiast, bez F5.

- [ ] **Step 7: Regresja — ruch tokena dalej działa**

Jako GM przeciągnij dowolny widoczny token po mapie.

Expected: gracz widzi ruch. To zdarzenie `SCENE_CHARACTER_MOVED`, osobna ścieżka — sprawdzamy, że skurczenie payloadu `SCENE_CHARACTER_UPDATED` jej nie ruszyło.

- [ ] **Step 8: Zapisz wynik**

Zaraportuj wynik każdego kroku. Jeśli którykolwiek zawiódł — nie zamykaj feature'a, wróć do zadania, którego dotyczy (kroki 2–4 → Task 1/2, kroki 5–6 → Task 3).
