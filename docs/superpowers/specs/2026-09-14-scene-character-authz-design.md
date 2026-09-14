# Autoryzacja na endpointach postaci sceny + wspólny helper `requireGM`

Data: 2026-09-14
Status: zaakceptowany, do implementacji

Znalezione przy finalnym review BUG-195. Zakres wyłącznie backendowy.

## Problem

Trzy endpointy operujące na **postaciach umieszczonych na scenie** nie sprawdzają uprawnień
w ogóle. Wszystkie pozostałe operacje na scenie sprawdzają.

| endpoint | serwis | bierze `userID` | sprawdzenie |
|---|---|---|---|
| `POST /games/:id/scenes/:sceneId/characters` | `AddCharacterToScene` (`GameService.go:1483`) | tak, jako `placedBy` | **brak** |
| `PUT /games/:id/scenes/:sceneId/characters/:charId` | `UpdateSceneCharacterGeometry` (`:1516`) | **nie bierze** | **brak** |
| `DELETE /games/:id/scenes/:sceneId/characters/:charId` | `RemoveCharacterFromScene` (`:1778`) | **nie bierze** | **brak** |

Handlery (`SceneHandler.go:204` i `:236`) również nigdy nie wołają `getUserIDFromContext` — nie ma
więc gdzie dołożyć sprawdzenia bez zmiany sygnatur.

### Kto może to wykorzystać

Cała grupa `/games/:id` siedzi za `JWTAuthMiddleware()` **i** `GameParticipantMiddleware(gameRepo)`
(`main.go:220`). Napastnikiem może być wyłącznie **uczestnik tej konkretnej gry** — nie anonim
z internetu. To psucie stołu przez gracza, nie publiczna dziura. Dlatego rzecz jest ważna, ale nie
krytyczna.

### Co realnie da się zrobić

1. **Przesunąć, obrócić, przeskalować i przestawić `zIndex` dowolnego tokena na scenie** — także
   NPC-a MG.
2. **Usunąć dowolny token ze sceny.**
3. **Postawić dowolną postać na scenie.**
4. **Odsłonić ukryty token — i to jest najpoważniejsze.** `UpdateSceneCharacterRequest`
   (`models/Game.go:278`) niesie nie tylko geometrię:

```go
type UpdateSceneCharacterRequest struct {
	PositionX *float64
	PositionY *float64
	W         *float64
	H         *float64
	Rotation  *float64
	ZIndex    *int
	Hidden    *bool
}
```

`Hidden` to przełącznik oka MG. Gracz wysyłający `{"hidden": false}` na cudzy ukryty token zmienia
stan, który serwer egzekwuje przy każdym refetchu:

```go
// GameService.go:2569 — jedyny punkt egzekwowania widoczności tokenów
func keepSceneCharacterForViewer(gc models.GameCharacter, hasCard map[primitive.ObjectID]bool) bool {
	return !gc.Hidden || hasCard[gc.CharacterID]
}
```

Token staje się realnie widoczny dla **wszystkich** graczy. To ujawnienie informacji, nie kosmetyka.

### Dlaczego akurat te trzy

Nie przypadek. Wszystkie endpointy **obrazów** sceny (`AddImageToScene`, `UpdateSceneImage`,
`DeleteSceneImage`, `DuplicateSceneImage`, `BatchMoveSceneTokens`, `PatchSceneImageToken*`) biorą
`userID` i sprawdzają MG, bo obrazy są z definicji narzędziem MG. Postacie są jedyną encją sceny,
którą **gracz też ma prawo ruszać** — i właśnie tam, gdzie reguła nie brzmi „tylko MG", nikt jej
nie napisał.

Sprawdzenie ma dziś postać siedmiu linii preambuły powtórzonych **34 razy** w samym
`GameService.go`:

```go
game, err := s.gameRepo.GetByID(gameID)
if err != nil {
	return err
}

if game.GameMasterID != userID {
	return fmt.Errorf("only the game master can <akcja>")
}
```

Brak takiej preambuły nie rzuca się w oczy przy przeglądzie — i dokładnie dlatego trzy funkcje
przeżyły bez niej. To jest prawdziwa przyczyna, nie zapomniana linijka.

I nie jest tak, że projekt tego wzorca nie zna — **zna go wszędzie poza `GameService`**:

```go
// FogService.go:24 — ten sam helper, napisany osobno w trzech serwisach
func (s *FogService) isGM(gameID string, userID primitive.ObjectID) error {
	game, err := s.fogRepo.GetGame(gameID)
	...
}
```

`FogService`, `DrawingService` i `YahtzeeService` mają własne `isGM` nad własnymi repozytoriami.
Odstaje wyłącznie `GameService` — największy plik, 34 kopie, i jedyny, w którym te trzy dziurawe
funkcje siedzą.

## Rozwiązanie

Dwa ruchy, w tej kolejności: wspólny helper, potem trzy brakujące sprawdzenia napisane już przy
jego użyciu.

### Reguła per endpoint

| endpoint | reguła |
|---|---|
| `POST .../characters` | MG **lub** właściciel postaci |
| `PUT .../characters/:charId` | geometria: MG **lub** właściciel; `Hidden`: **tylko MG** |
| `DELETE .../characters/:charId` | MG **lub** właściciel |

Ani `add`, ani `remove` nie mogą być GM-only: `handleGridToggle`
(`front/src/components/DndContext.jsx:881`) to przełącznik „na siatce / poza siatką" w panelu
bocznym, którego gracz używa na własnych postaciach. GM-only zabiłoby istniejącą funkcję gracza.

**Własność** = `CreatedBy == userID || VisibleTo zawiera userID`.

Szersza niż samo `VisibleTo`, którego serwer używa do budowy `hasCard` (`GameService.go:2617-2628`)
— celowo. Musi pokryć frontowe `isOwnCharacter` (`DndContext.jsx`), które sprawdza oba warunki;
gdyby serwer był węższy, legalne kliknięcia w UI zaczęłyby wracać z 403.

**`Hidden` egzekwujemy per pole.** `req.Hidden != nil` znaczy „przyszła prośba o zmianę
widoczności" i tylko ta gałąź wymaga MG; pozostałe pola przechodzą regułą właściciela. Typ `*bool`
daje to rozróżnienie za darmo — nie trzeba dodatkowego flagowania w żądaniu.

Odebranie graczowi `Hidden` niczego mu nie zabiera: `keepSceneCharacterForViewer` zwraca `true` dla
posiadacza karty **niezależnie** od flagi, więc właściciel widzi swój token zawsze. Jedyny efekt tej
flagi dotyczy innych widzów, a to decyzja MG.

### `internal/service/authz.go`

```go
// requireGM fetches the game and rejects anyone who is not its GM. It returns the game because
// most callers need it right after the check; discard it with `_` when you don't.
//
// `action` completes the sentence "only the game master can %s", so the client-facing message is
// unchanged from the 34 hand-written copies this replaces.
func (s *GameService) requireGM(gameID string, userID primitive.ObjectID, action string) (*models.Game, error)

// requireGMOrCharacterOwner allows the GM, or a player who holds the character — created it, or is
// listed in its VisibleTo. Mirrors the frontend's isOwnCharacter so a legitimate UI action never
// 403s; a narrower rule here would break the sidebar's on/off-grid toggle for players.
func (s *GameService) requireGMOrCharacterOwner(gameID string, characterID primitive.ObjectID, userID primitive.ObjectID, action string) (*models.Game, error)
```

Zwracany wskaźnik jest tani (jedno słowo, nie kopia gry z osadzonymi scenami), więc zwracanie go
zawsze nic nie kosztuje. Wywołujący, który gry nie potrzebuje, pisze `if _, err := ...`.

Przy odmowie helper zwraca `(nil, err)` — bez „pustej, ale niepustej" gry na wszelki wypadek.
Odwrócona kolejność sprawdzeń (użycie `game` przed `err`) daje wtedy natychmiastową panikę na
dereferencji `nil`, a nie cichy błąd niosący się dalej. To pożądane.

### Migracja 34 miejsc w `GameService.go`

Każde miejsce to ta sama zamiana siedmiu linii na jedną. Diff jest **czysto strukturalny** —
żaden komunikat błędu widziany przez klienta się nie zmienia, co samo w sobie jest zabezpieczeniem
przy przeglądzie: każda zmiana tekstu w diffie to błąd.

Grupujemy tematycznie, po commicie na grupę, zamiast jednego wielkiego:
gra i zaproszenia → handouty → sceny → obrazy → token gear → reszta.

**`requireGM` jest metodą na `*GameService`** i dotyczy wyłącznie tego pliku. Pozostałe serwisy
zostają nietknięte: każdy sięga po grę przez **własne** repozytorium (`fogRepo.GetGame`,
`drawingRepo.GetGame`), więc metoda na `GameService` byłaby dla nich niewywoływalna, a wspólna
funkcja pakietowa wymagałaby przepięcia ich wszystkich na `gameRepo`. To refaktor bez związku
z tą dziurą.

## Poza zakresem

- **Ujednolicenie `isGM` między serwisami.** `FogService`, `DrawingService` i `YahtzeeService`
  mają dziś po własnej kopii; `DicePokerService` ma warunek bez helpera. Sprowadzenie ich do
  jednej funkcji pakietowej wymaga, żeby wszystkie sięgały po grę tym samym repozytorium — to
  osobne zadanie, nie ta dziura.
- **Sprawdzenia w warstwie HTTP** — `CharacterHandler.go:606`, `:678`, `HandoutHandler.go:82`.
  Zwracają odpowiedzi HTTP bezpośrednio, więc nie pasują do helpera zwracającego `error`.
  Trzy miejsca, inny kształt, osobna decyzja.
- **`BatchMoveSceneTokens` pozostaje GM-only.** Dopuszczenie gracza wymaga walidacji per-id po
  stronie serwera (batch musi zawierać wyłącznie jego postacie i zero obrazów) — to zadanie
  wyciągnięte już przy BUG-195 jako osobny FEATURE i tu się nie zmienia.
- **Frontend.** Bramki w UI zostają jak są; ta zmiana dokłada drugą warstwę, nie zastępuje
  pierwszej.

## Testy

`internal/service/` ma konwencję testów jednostkowych na czystych funkcjach i regułach
(wzorzec: `scene_character_visibility_test.go`).

- `requireGM` — MG przechodzi; gracz dostaje błąd z właściwym tekstem; nieistniejąca gra zwraca
  błąd repozytorium, nie błąd uprawnień
- `requireGMOrCharacterOwner` — MG, twórca (`CreatedBy`), posiadacz karty (`VisibleTo`), obcy gracz
- reguła per pole — gracz-właściciel zmienia `positionX` → OK; ten sam gracz wysyła `hidden`
  → odmowa; MG wysyła `hidden` → OK; żądanie mieszane (geometria **i** `hidden`) od gracza
  → odmowa w całości, bez częściowego zapisu
- regresja na trzy załatane endpointy — obcy gracz nie postawi, nie przesunie i nie usunie cudzej
  postaci

Uruchomienie: `go test ./...` z `warhammer-battle-helper-backend/`.

## Ryzyka

- **Migracja dotyka 34 miejsc w jednym pliku.** Ryzyko nie leży w pojedynczej zamianie, tylko
  w ich liczbie — jedno przeoczone `userID` przekazane w złej kolejności skompiluje się, jeśli oba
  parametry są `primitive.ObjectID`. Grupowanie w commity tematyczne i porównanie komunikatów
  błędów przed/po jest tu główną obroną.
- **Reguła właściciela musi pokrywać frontową.** Jeśli serwer okaże się węższy niż
  `isOwnCharacter`, objawi się to jako losowe 403 przy normalnej grze, nie jako błąd testów.
  Stąd jawny test na `CreatedBy` i na `VisibleTo` osobno.
