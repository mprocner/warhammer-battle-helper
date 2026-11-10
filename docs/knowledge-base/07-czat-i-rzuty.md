# Czat i rzuty

## Jak to działa

**Log** to wspólna lista zdarzeń gry: wiadomości czatu, rzuty z karty, rzuty z czatu, rzuty
przyciskami kości. Każde zdarzenie jest dopisywane do `Game.Events` (`$push`) i rozsyłane przez
WebSocket (`LOG_MESSAGE`, `DICE_ROLLED`, `SKILL_ROLLED`, `WEAPON_ROLLED`). Komponent do
wyświetlenia wpisu wybiera `resolveRollComponent.js`, a dla rzutów systemowych moduł systemu.

**Widoczność rzutu** wybiera się w `DiceRollControls` i dotyczy też rzutów z karty:

| Wartość | Kto widzi |
|---|---|
| `all` | wszyscy |
| `gm_and_roller` | MG i rzucający |
| `gm_only` | tylko MG (rzucający widzi tylko potwierdzenie „wysłano”) |
| `<userId>` | tylko rzucający i wybrany gracz (**bez MG**) |

Routing robi `RollPublisher.Publish`, a przy odczycie historii ten sam filtr stosuje
`GameHandler`. Przełącznik „Moje rzuty” filtruje log lokalnie.

**Komendy czatu** (`src/chat/commands/`): `/roll` (`/r`), `/gmroll` (`/gmr`, wymusza
`gm_only`), `/help`. Parser na froncie rozpoznaje komendę, a wyrażenie liczy backend
(`POST /rollExpression`, pakiet `internal/dice`).

**Składnia wyrażeń** (lexer → parser → evaluate):

| Przykład | Znaczenie |
|---|---|
| `d10`, `3d100` | kości, sumowane |
| `2d6 + 1d4 + 3`, `d100 -1` | suma składników i stałych |
| `4d6kh3`, `2d20kl1` | zachowaj najwyższe / najniższe |
| `6d10>=7` | pula: liczy kości z wynikiem ≥ 7 (musi być jedynym rzutem) |
| `d100-10 vs 45` | test: sukces, gdy wynik ≤ 45 (nie łączy się z pulą) |

Limity (`dice/limits.go`): 100 znaków, 10 składników, 20 kości w składniku, 50 kości łącznie,
1000 ścian, stała do 1000, próg `vs` do 10000. Komunikaty błędów mają klucze
`chat.commands.diceErrors.<powód>`.

**Wiadomości** są normalizowane przez `NormalizeChatMessage`: zwija puste linie, a długość
liczy w runach (znakach), nie bajtach. Limit 500 znaków jest ten sam na froncie (`MAX_MESSAGE_LENGTH`
w `ChatInput.jsx`) i na backendzie.

**Przyciski kości** pod czatem: domyślny zestaw albo `DiceButtons` z szablonu.

**Kolor autora** (PLAYRPG-340). Wpis z autorem (`rollerUserId` albo `userId` w `data`) dostaje
`--author-color` z `participantColor` i klasę `--authored`: lewy pasek w kolorze autora.
Wpisy systemowe zostają przy kolorze typu (info/success/…). Własne wpisy (`--mine`) zachowują
złoty tint tła, ale pasek mają w swoim kolorze. Toast rzutu: lewa krawędź to dalej wynik,
górna to kolor rzucającego.

**Lista kości `dice`** (PLAYRPG-341, pod animację 3D z epiku PLAYRPG-339). Każdy rzut, czyli
`RollResult` z karty, wyrażenie z czatu i przycisk kości, niesie w payloadzie i w zdarzeniu
płaską listę `dice: [{sides, value, dropped?, group?}]`, czyli wszystkie fizycznie rzucone kości.
Typ i helpery są w `internal/systems/dice.go`:

| Przypadek | Zapis w `dice` |
|---|---|
| d100 (Warhammer, CoC, przycisk K100, `1d100` w czacie, kość d100 w custom) | kość dziesiątek `{sides: 100, value: 0–90}` + jedności `{sides: 10, value: 0–9}`; 00 + 0 = 100 |
| Kości bonusowe/karne CoC, kości przewagi custom w trybie dziesiątek | jedna kość dziesiątek na kandydata, wspólna kość jedności, niewybrane dziesiątki `dropped` |
| Przewaga/utrudnienie srd5, kości przewagi custom w trybie formuły | wszystkie kości wszystkich kandydatów, przegrane `dropped` |
| `kh`/`kl` w czacie | odrzucone kości `dropped` |
| Obrażenia broni (wszystkie systemy, też MO w CoC) | `group: "damage"` |
| Pula (custom, `>=` w czacie) | wszystkie kości, żadna nie jest `dropped` — sukcesy liczy log |

Niezmiennik: `dice` pokazuje dokładnie te ścianki, które weszły do wyniku z logu. Tam, gdzie wynik
to suma kości plus stałe (d100, d20, obrażenia, `2d6+3`), suma kości niebędących `dropped`
w grupie (`systems.DiceTotal`) równa się wynikowi bez stałych. Testy `dice_test.go` w każdym
systemie to sprawdzają. Formuła custom może kość mnożyć (`(STR+2)*d6`), wtedy suma się nie
zgadza, ale ścianki dalej tak.

**Kości 3D** (PLAYRPG-343). Świeże zdarzenie rzutu z WS (`DICE_ROLLED`, `SKILL_ROLLED`,
`WEAPON_ROLLED`) przechodzi w `GameSession` przez ten sam filtr co toast (`showsRollNotice`).
Jeśli przełącznik jest włączony, `diceController.play({ dice, color })` odtwarza `dice` z payloadu
na nakładce `DiceOverlay` nad sceną. Kolor bierze `participantColor` rzucającego, a kolor cyfr
dobiera `labelColorFor` (jasne albo ciemne).

| Element | Rola |
|---|---|
| `dice3d/dicePlan.js` | czysta logika: grupy rzutu (główny, potem `damage`), notacja z wymuszonym wynikiem, limit 10 kości, kontrast cyfr |
| `dice3d/diceController.js` | adapter `@3d-dice/dice-box-threejs@0.0.12` (przypięta wersja): leniwy import, kolejka, sprzątanie, Retina, resize, dźwięk |
| `dice3d/diceSound.js` | odgłosy uderzeń z kolizji fizyki: limit głosów, throttling, cicha blokada autoplay |
| `dice3d/DiceOverlay.jsx` + `DiceAnimationContext` | canvas nad sceną, `pointer-events: none`; kontroler żyje w `GameSession`, kontekst łączy go z nakładką bez przepychania propsów przez `DndContext` |
| `hooks/useDiceAnimationSetting.js` | ustawienie konta `diceAnimation` (zobacz [02-konta-i-dostep.md](02-konta-i-dostep.md)) |

Biblioteka trafia do osobnego chunka `dice-3d` (ok. 142 KB gzip) i pobiera się dopiero przy
pierwszym rzucie z włączoną animacją. Dźwięki to 7 plików `public/sounds/dice/*.m4a`
z „Casino Audio” Kenneya (CC0), wpis jest na `/licenses`. Dźwięki dołączone do biblioteki nie
mają podanego źródła ani licencji, dlatego jej loader dźwięków jest wyłączony (`sounds: false`).

**Statystyki rzutów** (`RollStat`): każdy rzut zapisuje kość, wynik i typ. Są dostępne dla gry
(`/games/:id/roll-stats`, `RollStatsPanel`) i łącznie w ustawieniach konta (`DiceStats.jsx`):
liczba rzutów, średnia, krytyki, pechowe rzuty, rozkład.

## Kluczowe pliki

| Co | Gdzie |
|---|---|
| Okno logu i czat | `src/components/LogWindow.jsx`, `src/components/log/` |
| Komendy | `src/chat/commands/commandRegistry.js`, `parseChatInput.js`, `useChatCommands.js`, `useChatHistory.js` |
| Parser kości | `internal/dice/` |
| Rzuty, publikacja | `internal/service/DiceRollService.go`, `roll_publisher.go`, `GameService.executeRoll` |
| Lista kości `dice` | `internal/systems/dice.go` (`RolledDie`, `Faces`, `PercentileDice`, `DiceTotal`) |
| Wiadomości | `internal/service/chat_message.go` |
| Statystyki | `internal/http/StatsHandler.go`, `src/components/stats/` |

## Pułapki

- Kolor autora to **pasek, nigdy kolor tekstu**. Log ma kremowe tło, a jasny kolor gracza
  (np. limonka z palety albo prawie biały z pickera) jako tekst byłby nieczytelny.
- `.log-simple-message--authored` musi stać w `LogWindow.css` **po** modyfikatorach typu
  (`--info`, `--success`…): ta sama specyficzność, wygrywa kolejność źródła.
- `Game.Events` rośnie bez limitu wewnątrz dokumentu gry. MongoDB ma limit 16 MB na dokument,
  więc bardzo długa kampania może go kiedyś dobić. Na razie nic tego nie przycina.
- Rzut `gm_only` nie wraca do rzucającego ani przez WS, ani przez historię. Front pokazuje
  wtedy osobne potwierdzenie, żeby nie wyglądało, że rzut przepadł.
- Zmieniając limit długości wiadomości, zmień go w obu miejscach.
- Rzut do wybranego gracza celowo pomija MG. Jeśli to ma się zmienić, zmieniasz `RollPublisher`
  i filtr historii w `GameHandler` jednocześnie.
- **Biblioteka kości 3D ma ostre krawędzie, które łapie `diceController`.** `roll()` albo
  `clearDice()` w trakcie animacji zostawia Promise bieżącego rzutu nierozwiązany na zawsze
  (upstream #19), stąd ścisła kolejka i licznik `generation` przy sprzątaniu. Zwracane przez nią
  wartości bywają złe (d4, upstream #12), choć ścianka na ekranie jest dobra, więc **wyniku nigdy
  nie czytamy z biblioteki**. Nie ma `destroy` (upstream #11), więc canvas i renderer usuwa
  `teardown()`. Sama nie ustawia `devicePixelRatio` ani nie reaguje na resize.
- Symulacja rzutu biegnie **synchronicznie na wątku głównym** (10 kości ok. 83 ms, 50 ok. 422 ms
  na Macu). Dlatego obowiązuje limit 10 kości na rzut (`MAX_ANIMATED_DICE`): większy rzut, tak
  jak kość, której biblioteka nie narysuje (np. k7), jest tylko w logu.
- Dźwięk uderzeń: kontroler podmienia `box.eventCollide` przed pierwszym rzutem. Biblioteka
  wiąże tę metodę przy każdej nowej kości, więc podmiana działa, ale to zależność od wnętrza
  wersji 0.0.12. Podbijając wersję, sprawdź ją jako pierwszą. W fazie `simulate` kolizje są
  ignorowane: to cicha symulacja z góry, nie animacja.
- Przy ukrytej karcie przeglądarka wstrzymuje `requestAnimationFrame`, więc rzuty przy
  `document.hidden` są pomijane, a nie odkładane. Zaległości ogranicza też kolejka (najwyżej
  3 czekające, najstarsze odpadają).
- `loaded` z `useDiceAnimationSetting`: dopóki zapisany wybór nie przyjdzie z serwera, nic się nie
  animuje. Inaczej użytkownik, który wyłączył kości, pobrałby chunk 3D przy pierwszym rzucie.
- Toast i log pokazują wynik ok. 2–3 s przed wylądowaniem kości. To świadoma decyzja
  z 2026-11-10: nie opóźniamy logu pod animację.
- `dice` budujesz **tam, gdzie wołasz `rng.Intn`**, nigdy z tekstu `DamageBreakdown` ani
  z `AllRolls`. Nowy rzut bez `dice` po prostu się nie zanimuje, a kości z odtworzonego tekstu
  mogą pokazać inny wynik niż log. d100 zawsze przez `Faces`/`PercentileDice`: zwykła kość
  `{sides: 100, value: 47}` byłaby dla animacji nieczytelna.
- `dropped` ma wartość zerową „liczona”. Miejsce, które zapomni ustawić flagę, pokaże kość jako
  liczoną, nie zgubi jej po cichu. Dlatego pole nie nazywa się `kept` (inaczej niż `dice.Die`
  w czacie, gdzie `Kept` zostaje).
- Ujemny bonus do obrażeń w CoC (np. `-1d4`) też trafia do `dice` jako rzucona kość, a w wyniku
  się odejmuje, więc tam suma kości obrażeń nie równa się `DamageRoll`.
- Notacja kości to nie tekst do tłumaczenia: przykłady w `commandRegistry.js` są literałami,
  a tłumaczone są tylko opisy.
