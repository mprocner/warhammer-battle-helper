# FEATURE-121 — Tekst w trybie rysowania zostaje na mapie

Data: 2026-08-24

## Problem

W trybie rysowania, przy aktywnym narzędziu `text`: użytkownik klika w mapę, wpisuje
tekst, klika gdzie indziej na mapie — wpisany tekst przepada. Nic nie zostaje na mapie.

Oczekiwanie: skoro coś jest wpisane, powinno wylądować na mapie. Znikać ma tylko to,
co użytkownik świadomie anulował.

## Przyczyna

`SceneViewport.jsx:551-570` + `DrawingLayer.jsx:387-390`.

Input tekstowy commituje się przez `onBlur`. Klik w canvas z narzędziem `text` trafia
w `DrawingLayer.handleMouseDown`, gdzie wołane jest `e.preventDefault()`. To blokuje
domyślną zmianę fokusu, więc `onBlur` inputa **nigdy nie odpala**. Zamiast tego leci
`onTextPlacement(coords)` → `handleTextPlacement` robi `setTextInputPos(newCoords)` +
`setTextInputValue('')`, czyli kasuje wpisaną treść bez zapisu.

Pozostałe ścieżki wyjścia działają poprawnie — `DrawingToolbar` i `LayerSelector` nie
wołają `preventDefault`, więc klik w nie wywołuje blur i commit. Prawy przycisk myszy też
commituje: `handleMouseDown` robi `return` dla `e.button !== 0` **przed** `preventDefault`,
więc fokus się przenosi normalnie.

Zepsuta jest wyłącznie ścieżka lewego kliku w canvas.

## Decyzje projektowe

**Klik w mapę z wpisanym tekstem** → commit + zamknięcie pola. **Nie** otwiera nowego
pola w miejscu kliknięcia. Odrzucone „commit + od razu nowe pole": każdy kolejny klik
otwierałby następne pole, bez sposobu przerwania łańcucha inaczej niż zmianą narzędzia.

**Escape** → anuluje bez zapisu, także gdy coś wpisano. To jedyna droga wyjścia bez
zostawiania śmiecia na mapie; standardowa konwencja „porzuć edycję". Bez niej przypadkowe
kliknięcie zmusza do zapisania i sprzątania ścieżki z mapy.

**Klik w mapę przy pustym polu** → pole się zamyka (nie przeskakuje w nowe miejsce).
Jedna reguła bez wyjątków: klik obok zawsze zamyka. Ponowne postawienie = kolejny klik.

**Wydzielenie hooka** zamiast strażnika inline w `SceneViewport` (924 linie). Reguła ma
trzy przypadki, więc jest warta testu; jako hook testuje się przez `renderHook`, bez
stawiania całego viewportu z mockiem canvasu i fokusu DOM. Precedens w tym samym
katalogu: `useTokenRotate.js` + `useTokenRotate.test.jsx`.

Odrzucono też „nie wołać `preventDefault` dla narzędzia `text`, żeby blur odpalił
naturalnie": opierałoby fix o niespecyfikowaną między przeglądarkami kolejność blur vs
mousedown, a blur i placement odpaliłyby oba — czyli i tak otwierałoby się nowe pole.

## Rozwiązanie

### Nowy plik: `warhammer-battle-helper-front/src/components/scene/useDrawingTextInput.js`

```js
useDrawingTextInput({ onCommit })
  → { pos, value, setValue, placeAt, commit, cancel }
```

Stan: `pos` (współrzędne sceny albo `null`) + `value`. Oba lustrzane w `useRef` — `placeAt`
i `commit` muszą czytać żywą wartość, nie tę z domknięcia z renderu, w którym powstały.
Bez tego wraca ten sam rodzaj buga, który naprawiamy.

Tabela zachowań:

| Wejście | Pole zamknięte | Pole otwarte, puste | Pole otwarte, z tekstem |
|---|---|---|---|
| `placeAt(coords)` (klik w mapę) | otwórz w `coords` | zamknij | commit + zamknij |
| `commit()` (blur / Enter) | no-op | zamknij | commit + zamknij |
| `cancel()` (Escape) | no-op | zamknij | zamknij, nic nie zapisuje |

`commit()` zeruje `posRef` **zanim** wywoła `onCommit`. Gdyby po zamknięciu inputa doleciał
jeszcze jakiś blur, trafi w `pos === null` i będzie no-opem — brak podwójnego zapisu tej
samej etykiety.

`onCommit({ coords, text })` — hook nie wie nic o `brushSize`, `color`, `fontSize`. Te dokleja
`SceneViewport`, budując obiekt ścieżki. Hook testuje się bez znajomości schematu
`drawingPath`, a zmiana palety go nie dotyka.

„Puste" = `value.trim() === ''` — same spacje nie tworzą ścieżki (tak jak dziś,
`SceneViewport.jsx:558`). Zapisywany tekst jest trimowany.

### `SceneViewport.jsx`

Usunąć: `textInputPos`, `textInputValue` (70-71), `handleTextPlacement` (551-554),
`commitText` (556-570).

W ich miejsce:

```js
const text = useDrawingTextInput({
  onCommit: useCallback(({ coords, text: value }) => {
    onDrawingPathComplete?.({
      tool: 'text', points: [coords],
      brushSize, color: drawingColor, fontSize: drawingFontSize,
      text: value,
    });
  }, [brushSize, drawingColor, drawingFontSize, onDrawingPathComplete]),
});
```

Podpięcia: `onTextPlacement={text.placeAt}`; input `value={text.value}`, `onChange` →
`text.setValue`, `onBlur={text.commit}`, Enter → `text.commit`, Escape → `text.cancel`,
warunek renderu `{text.pos && ...}`.

### `DrawingLayer.jsx`

Bez zmian. `e.preventDefault()` zostaje — to on blokuje blur, ale po fixie jest nieszkodliwy,
bo `placeAt` sam commituje. Nie ruszamy go, żeby nie tykać komentarza o macOS ctrl-click
i kolejności zdarzeń.

### Backend

Bez zmian. Narzędzie `text` już istnieje w schemacie ścieżek, zapis idzie istniejącym
`onDrawingPathComplete`.

### i18n

Bez nowych kluczy.

## Testy

Nowy `useDrawingTextInput.test.jsx`, `renderHook`:

1. `placeAt` przy zamkniętym → `pos` ustawione na podane współrzędne
2. `placeAt` gdy jest tekst → `onCommit` z **pierwszymi** współrzędnymi, potem `pos === null`
   (regresja FEATURE-121; jednocześnie pilnuje, że pole się nie otwiera na nowo)
3. `placeAt` gdy pole puste → `onCommit` nie wołane, `pos === null`
4. `cancel` z tekstem → `onCommit` nie wołane, `pos === null`
5. `commit` trimuje; sam whitespace → brak `onCommit`
6. `commit` po `placeAt` (spóźniony blur) → `onCommit` dokładnie raz

`DrawingLayer.test.js` nie dotyka narzędzia `text` — nic tam nie pęka.

## Weryfikacja

`npm test` w `warhammer-battle-helper-front`. Stan bazowy repo: `App.test.js` wywala się na
ESM axiosa — to nie jest regresja tej zmiany.

Ręcznie na docker stacku:
- tryb rysowania → narzędzie tekst → wpisz → klik w mapę obok → etykieta zostaje, pole zamknięte
- klik, nic nie wpisuj, klik obok → pole znika, mapa czysta
- wpisz → Escape → nic nie zostaje
- wpisz → Enter → etykieta zostaje
- wpisz → klik w toolbar → etykieta zostaje (ścieżka blur, dziś już działa — pilnujemy braku regresji)
