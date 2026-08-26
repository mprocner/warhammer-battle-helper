# BUG-178 — Miarka przy przesuwaniu ukrytego tokena wycieka do graczy

**Status:** zaprojektowane, do implementacji
**Data:** 2026-08-26

## Objaw

Gdy MG przeciąga ukryty token, miarka dystansu (linia + odczyt) jest rozgłaszana przez WS do
wszystkich w grze. Gracz nie widzi tokena, ale widzi linię od jego pozycji startowej do docelowej —
czyli dokładnie tę informację, którą ukrycie miało chować.

To samo przy przeciąganiu grupy: jeśli w zaznaczeniu jest choć jeden ukryty token, miarka całej
grupy nie może iść do graczy.

## Gdzie to siedzi

Drag-miarka jest rozgłaszana w `components/DndContext.jsx:75` (`sendDragRuler`) kanałem `MAP_RULER` —
tym samym, którym leci ręczna miarka z narzędzia Measure. Trzy źródła zdarzeń:

| Źródło | Plik | Co wie o ukryciu |
|---|---|---|
| Token postaci | `components/scene/MapCharacterToken.jsx:119` | prop `hidden` |
| Obrazek-token | `components/scene/SceneImage.jsx:143` | `image.hidden` |
| Grupa | `hooks/useGroupDrag.js:36` | `selectedTokens` + `images`/`characters` |

Callbacki `onTokenDragMeasureStart/Move/End` przyjmują wyłącznie `center` — **żadnej tożsamości
tokena**. To jest przyczyna: warstwa wysyłki nie ma z czego wywnioskować, że drag jest prywatny.

Backend nie bierze w tym udziału. Hub jest głupim relayem — `broadcastMessage`
(`internal/websocket/hub.go:178`) rozsyła do wszystkich klientów gry i nie zna ról. `MAP_RULER` nie
występuje w kodzie backendu w ogóle.

## Zakres

Ukrycie = `placement.hidden` tokena postaci **oraz** `image.hidden` obrazka-tokena **oraz** obrazek na
warstwie `gm` (przegląd finalny: warstwa `gm` jest niewidoczna dla graczy tak samo jak `hidden`, więc
grupowy drag niosący obrazek `gm` musi zostać lokalny — patrz `isPrivateDrag` w `useDragRuler.js`).

Wciąż aktualne: pojedyncze przesuwanie obrazka na `background`/`gm` w ogóle nie mierzy.
`SceneViewport.jsx:721,784` nie przekazuje `onTokenDragMeasure*` do `SceneLayer` dla tych warstw —
nie ma czego naprawiać, bo nie ma wysyłki do zabronienia. To dotyczy tylko pojedynczego draga;
grupowy drag (`useGroupDrag`) mierzy niezależnie od warstwy, więc obejmuje go reguła powyżej.

GM w grze jest tylko jeden — rola `gm` jest nadawana wyłącznie twórcy
(`internal/service/GameService.go:63,197`). Dlatego „nie propaguj do graczy" realizujemy jako
„nie wysyłaj wcale": nie ma drugiego MG, który by na tym tracił.

**Znany, akceptowany skutek uboczny** (znaleziony w przeglądzie finalnym): gracz, który trzyma kartę
postaci dla placementu ukrytego przez MG, może przeciągnąć ten token na mapie — i wtedy miarka jest
ukrywana także przed samym MG, bo `isPrivateDrag` nie rozróżnia, kto ciągnie. To poprawne zachowanie
fail-closed, nie bug: naprawienie tego wymagałoby przekazywania roli ciągnącego przez WS i
rozgałęzienia rozgłoszenia po roli (osobny strumień dla MG, osobny dla graczy) — dokładnie tego
rodzaju „relay świadomy ról", który ten dokument wyżej świadomie wyklucza (hub jest głupim relayem).
Zapisane tutaj, żeby nie zostało odkryte drugi raz jako bug.

## Rozwiązanie

### 1. Nowy hook `src/hooks/useDragRuler.js`

Drag-miarka wyprowadzona z `DndContext` (~30 linii: stan `imageDragRuler`, `dragRulerFromRef`,
`lastDragRulerSendRef`, `sendDragRuler`, trzy handlery) do własnego hooka. `DndContext` ma już
~1100 linii i nie da się go sensownie przetestować; hook — da się (`renderHook` jest w projekcie
używany: `hooks/useGameMusic.volume.test.js`, `analytics/ConsentContext.test.jsx`).

Powód niekosmetyczny: bug siedzi w oplataniu wysyłki, nie w samej regule „co jest ukryte". Test
czystego predykatu nie broni przed regresją; test hooka broni.

```js
useDragRuler({ sendMessage, sceneId, userId, userName, images, characters })
// → { dragRuler, onMeasureStart, onMeasureMove, onMeasureEnd }
```

Bramka: `onMeasureStart(center, tokens)` rozstrzyga prywatność **raz**, zapisuje w `privateRef`,
wewnętrzne `send` wychodzi wcześniej gdy `privateRef.current` jest ustawione. `onMeasureEnd` czyści
ref po próbie wysyłki. Skoro przy prywatnym dragu nie poszło żadne `active: true`, gracze nie mają
czego czyścić — brak zawieszonej miarki po stronie odbiorcy i 3-sekundowy timeout
(`GameSession.jsx:832`) nie ma znaczenia.

Lokalny stan `dragRuler` jest ustawiany **zawsze** — gate tnie tylko `sendMessage`. MG nadal widzi
swój odczyt dystansu przy ukrytym tokenie.

`images`/`characters` pochodzą z `currentScene` — te same tablice, których `DndContext` używa do
`placedCharacters` (`DndContext.jsx:996`).

### 2. Predykat

Czysta funkcja na poziomie modułu w `useDragRuler.js`, eksportowana osobno do testu (jeden
konsument, więc bez nowego pliku w `utils/`):

```js
// A token hidden from players must not leak its position through the broadcast drag ruler.
// Fail closed: an id we cannot resolve counts as hidden — a missing ruler beats a leaked position.
export function isPrivateDrag(tokens, { images = [], characters = [] }) { ... }
```

- `kind: 'image'` → obrazek jest prywatny gdy `image.hidden` **lub** `image.layer === 'gm'`
  (warstwa `gm` jest niewidoczna dla graczy tak samo jak `hidden` — patrz „## Zakres");
  nierozpoznane id ⇒ `true`
- `kind: 'char'` → `!!characters.find(c => c.characterId === id)?.hidden`; nierozpoznane id ⇒ `true`
- `kind` inny niż `'image'` trafia do gałęzi postaci, więc literówka w `kind` też kończy się
  `true` — fail closed w każdym kierunku
- pusta lub brakująca lista tokenów ⇒ `false` (nie ma czego chronić)
- grupa ⇒ `tokens.some(...)`: jeden prywatny token przewraca całe zaznaczenie

### 3. Punkty wywołania

Drugi argument dostaje tylko `start`. `move`/`end` bez zmian — ref trzyma decyzję do końca dragu.

| Plik | Zmiana |
|---|---|
| `components/scene/MapCharacterToken.jsx:119` | `onTokenDragMeasureStart?.(center, [{ kind: 'char', id: character.id }])` |
| `components/scene/SceneImage.jsx:143` | `onTokenDragMeasureStart?.(center, [{ kind: 'image', id: image.id }])` |
| `hooks/useGroupDrag.js:36` | `onMeasureStart?.({ col, row }, selectedTokens)` |

`character.id` to `sc.characterId` także dla widza bez karty — stub w `utils/placedCharacters.js:15`
ustawia `id: sc.characterId`. `selectedTokens` jest już w kształcie `{kind,id}[]`, zero konwersji.

### 4. Sprzątanie

Usunąć martwe propsy `onTokenDragMeasureStart/Move/End` z `components/scene/SceneLayer.jsx:4,33-35`.
`SceneViewport` nie podaje ich ani dla warstwy `background`, ani dla `gm`, więc pass-through nigdy
nie odpala. `SceneImage` swoje propsy zachowuje — dostaje je z `MapTokensLayer`.

## Testy

`src/hooks/useDragRuler.test.js`, `renderHook` + `sendMessage` jako jest-mock:

1. widoczny token postaci — `start`/`move`/`end` wysyłają `MAP_RULER`, ostatni z `active: false`
2. ukryty token postaci — `sendMessage` nie wołane ani razu, a `dragRuler` mimo to ustawiony
3. ukryty obrazek-token — brak wysyłki
4. grupa mieszana (jeden ukryty) — brak wysyłki
5. nierozpoznane id — brak wysyłki (fail closed)
6. throttle — dwa `move` w tym samym oknie 50 ms dają jedną wysyłkę (kod jest przenoszony, więc
   zachowanie trzeba przygwoździć)

Dołożone po przeglądzie finalnym (razem 19 przypadków):

7. obrazek na warstwie `gm` bez flagi `hidden` — prywatny, sprawdzone i na predykacie, i na dragu
8. obrazek na warstwie `tokens` bez `hidden` — publiczny (kontrola, że warunek nie łapie za szeroko)
9. `onMeasureEnd` bez poprzedzającego `start` — brak wysyłki (guard `if (from)`)
10. `dragRuler === null` po `onMeasureEnd`
11. aktualizacja sceny w trakcie dragu nie przewraca prywatnego dragu na publiczny — `rerender`
    hooka z tokenem już nieukrytym, potem `move`/`end`, `sendMessage` nadal niewołane
12. `kind` spoza `'char'`/`'image'` — prywatny (fail closed)
13. `start` w oknie throttle'a poprzedniego dragu — klatka `active: true` i tak wychodzi
    (`lastSendRef` zerowany na starcie)

Bez dedykowanego testu: przełączenie mirroru `sceneRef` z `useEffect` na `useLayoutEffect`. `act()`
z React Testing Library flushuje oba rodzaje efektów synchronicznie, więc unit nie rozróżnia
kolejności — zmiana jest zabezpieczeniem na wypadek zdarzenia wejściowego dostarczonego między
renderem a passywnym efektem, nie zmianą obserwowalnego zachowania.

Bez zmian: backend, i18n, CSS.

## Weryfikacja ręczna

Dwie przeglądarki (MG + gracz), lokalny stack:

- MG ciągnie widoczny token ⇒ gracz widzi miarkę (brak regresji)
- MG ciągnie ukryty token ⇒ gracz nie widzi nic; MG widzi swój odczyt
- MG ciągnie grupę widoczny + ukryty ⇒ gracz nie widzi nic
- ręczna miarka (narzędzie Measure) ⇒ nadal propaguje się do graczy, nietknięta

`MapCharacterToken` / `SceneImage` / `useGroupDrag` / `SceneLayer` nie mają testów renderu
(świadoma decyzja projektu) — te cztery pliki weryfikujemy ręcznie.

Pakiet frontowy: awaria `App.test.js` (axios ESM) jest bazowa, nie regresja.
