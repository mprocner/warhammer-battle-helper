# FEATURE-142 — Przywrócenie przesuwania mapy prawym przyciskiem myszy

**Status:** design zatwierdzony
**Data:** 2026-08-28
**Branch:** FEATURE-142 (worktree `.claude/worktrees/FEATURE-142`)

## Cel

Przywrócić przesuwanie sceny przez przeciąganie prawym przyciskiem myszy, tak żeby menu
kontekstowe działało niezawodnie na macOS **i** na Windows.

Zakres: prawy‑drag przesuwa mapę **w każdym trybie** — domyślnym, Select, fog, drawing, measure.
Prawy **klik** (bez ruchu) zachowuje dzisiejsze zachowanie każdego trybu.

## Historia

Funkcjonalność istniała i została wyłączona dwoma commitami z 22 lipca 2026:

| Commit | Co zrobił |
|---|---|
| `548d6ca` | Wyłączył sam pan (zostawił rusztowanie klik‑vs‑drag) |
| `3267a75` | Usunął rusztowanie, bo psuło menu kontekstowe na Windows 11 |

## Analiza przyczyny awarii

Komunikat commita `3267a75` wskazuje jako winowajcę wyścig `setTimeout(0)` z kolejnością
zdarzeń przeglądarki. To była **przyczyna wtórna**. Główna leży gdzie indziej.

### Kolejność zdarzeń różni się między systemami

| System | Kolejność |
|---|---|
| macOS / Chrome | `pointerdown` → `contextmenu` → … → `pointerup` |
| Windows | `pointerdown` → `pointerup` → `contextmenu` *(trailing)* |

Chrome na macOS w ogóle nie wysyła `mouseup` dla przycisku pomocniczego — dlatego stary kod
używał Pointer Events, nie Mouse Events. Ten wybór zostaje.

### Co się działo na Windows przy zwykłym prawym kliku na obrazku

1. `pointerdown` → `rightActiveRef.current = true`
2. `pointerup`, brak draga → replay syntetycznego `contextmenu` → `SceneImage.handleContextMenu`
   otwiera menu → `SceneImageContextMenu` montuje się i rejestruje
   `document.addEventListener('contextmenu', handleClickOutside, true)`
   (`SceneImageContextMenu.jsx:21`, analogicznie `SceneTokenMultiContextMenu.jsx:15`)
3. `setTimeout(0)` zaplanowany na wyzerowanie flagi
4. Przychodzi **trailing trusted `contextmenu`**. W fazie capture trafia najpierw na `document`
   → `handleClickOutside` → target to obrazek, nie menu → **`onClose()`**

Menu gasło natychmiast po otwarciu.

### Dlaczego dławienie nie pomagało

Punkt 4 zachodził **niezależnie od `setTimeout`**. Nawet przy `rightActiveRef === true` dławienie
nie miało szans: siedziało w React `onContextMenuCapture`, a React 17+ podpina listenery do
**root containera** (`#root`), nie do `document`. W fazie capture `document` jest wyżej niż
`#root`, więc listener menu odpalał **przed** dławieniem viewportu.

Na macOS problem nie występował: trusted `contextmenu` przychodził na `pointerdown`, czyli
**zanim** replay zamontował menu. Nie było czego zamykać.

**Wniosek:** naprawa musi usunąć zależność od kolejności zdarzeń, a nie tylko poprawić moment
zerowania flagi. Widoczność efektu zależała od tego, czy przeglądarka zdążyła namalować klatkę
między krokiem 2 a 4 — stąd „unreliably" w commicie.

## Rozwiązanie

Trzy zmiany, każda usuwa jedno ogniwo zależności od kolejności zdarzeń.

### 1. Menu przestaje nasłuchiwać `contextmenu`

W `SceneImageContextMenu.jsx` i `SceneTokenMultiContextMenu.jsx` usuwamy
`document.addEventListener('contextmenu', handleClickOutside, true)` wraz z jego `removeEventListener`.

Ten listener jest **redundantny**: oba komponenty nasłuchują już `mousedown` w fazie capture,
a prawy przycisk generuje `mousedown` na każdym systemie. Zamykanie „kliknij obok" działa dalej,
tylko wcześniej w sekwencji:

```
mousedown (prawy) → handleClickOutside zamyka stare menu
pointerup         → replay → nowe menu na nowej pozycji
contextmenu       → zdławione, nikt go nie słucha
```

To jest zmiana, która faktycznie naprawia Windows. Bez niej trailing `contextmenu` dalej zamyka
świeżo otwarte menu — i **`stopPropagation()` z punktu 2 tego nie powstrzyma**: React podpina
handler viewportu do `#root`, a listener menu siedzi na `document`, który w fazie capture jest
wyżej i odpala wcześniej. Dławienie nie może wyprzedzić czegoś, co jest ponad nim.

### 2. Dławienie natywnego menu — warunek bezstanowy

Handler `onContextMenuCapture` na viewportcie:

```js
if (e.isTrusted && e.button === 2) {
  e.preventDefault();
  e.stopPropagation();
}
```

Warunek opiera się wyłącznie na **własnościach samego zdarzenia** — brak flagi żyjącej pomiędzy
zdarzeniami, brak timera, więc brak wyścigu. To jedyna istotna różnica względem starego kodu,
który sprawdzał `rightActiveRef` ustawiane w innym zdarzeniu.

`e.button === 2` rozróżnia trzy źródła `contextmenu`:

| Źródło | `button` | Efekt |
|---|---|---|
| Fizyczny prawy przycisk | `2` | zdławione — menu otworzy replay |
| Ctrl+klik na macOS (emulacja) | `0` | przechodzi — menu otwiera się normalnie |
| Klawisz Menu / Shift+F10 | `0` | przechodzi |

Bez warunku `button === 2` Ctrl+klik na macOS przestałby otwierać menu: emulacja wysyła
`contextmenu`, ale `pointerdown` ma `button === 0`, więc ani pan, ani replay by nie wystartowały.

`preventDefault()` blokuje natywne menu przeglądarki; `stopPropagation()` powstrzymuje handlery
obrazka/warstw przed reakcją na trusted zdarzenie (zareagują na replay).

### 3. Pan i replay w nowym hooku `useRightDragPan`

Nowy plik `components/scene/useRightDragPan.js` — cała mechanika prawego przycisku poza
`SceneViewport.jsx`, który ma już 976 linii. Lokalizacja obok `useTokenRotate.js`
(hooki specyficzne dla sceny mieszkają w `components/scene/`, ogólne w `hooks/`).

**Sygnatura:**

```js
const { onPointerDownCapture, onContextMenuCapture } = useRightDragPan({
  viewportRef, panOffsetRef, schemeRef, setPanOffset, setIsPanning,
});
```

Stan wewnętrzny w refach (nie w `useState` — nie mogą powodować re‑renderu w trakcie draga):
`startRef` (origin: `clientX/Y`, `panOffset.x/y`, `scrollLeft/Top`) oraz `didPanRef`.

**Przepływ:**

- **`pointerdown` (capture, `button === 2`)** — zapis origin, `didPanRef = false`.
- **`pointermove` (window)** — po przekroczeniu progu: `didPanRef = true`, `setIsPanning(true)`,
  następnie pan wg schematu — `classic` → `el.scrollLeft/scrollTop`, `modern` → `setPanOffset`
  + `panOffsetRef`. Identycznie jak przed `548d6ca`.
- **`pointerup` / `pointercancel` (window)** — wyczyszczenie refów, `setIsPanning(false)`.
  Jeśli **nie było draga** → replay:

  ```js
  document.elementFromPoint(e.clientX, e.clientY)?.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, view: window,
      clientX: e.clientX, clientY: e.clientY, button: 2,
    })
  );
  ```

  Replay jest **synchroniczny** w `pointerup` — bez `setTimeout`. `isTrusted` syntetycznego
  zdarzenia to `false`, więc handler z punktu 2 je przepuszcza.

`pointercancel` jest nowy względem starego kodu — bez niego przerwany gest (np. przez gest
systemowy) zostawiał `isPanning === true` i kursor `grabbing`.

**Konsumenci menu (`SceneImage`, group menu w `SceneViewport`, `FogLayer`, `DrawingLayer`,
`components/token-display/TokenRingChrome.jsx:87` — prawy klik zmniejsza poziom stanu tokena) nie
wymagają żadnych zmian** — dostają replay przez zwykły `onContextMenu`.

### Próg draga

**8px** (stary kod: 5px). Prawy klik w trybie fog zamyka wielokąt (`FogLayer.jsx:371`), a w trybie
drawing porzuca kreskę lub usuwa ścieżkę (`DrawingLayer.jsx:344`). Drgnięcie ręki powyżej 5px
zamiast tego przesunęłoby mapę. 8px jest nadal wyraźnie poniżej świadomego przeciągnięcia.

## Świadome skutki uboczne

- **Natywne menu przeglądarki znika z viewportu** przy prawym przycisku — ale tylko dla
  samodzielnego prawego kliku (patrz „Poprawka" niżej). Na mapie oferowało tylko „Reload" /
  „Save image as" — bez wartości. Pola edytowalne (`input`, `textarea`, `contenteditable`)
  zachowują natywne menu, bo narzędzie tekstowe rysowania renderuje `<input>` wewnątrz viewportu.
- **Prawy‑drag w fog/drawing przesuwa mapę** zamiast zamknąć wielokąt / porzucić kreskę. Prawy
  **klik** działa jak dziś. To bezpośrednia konsekwencja wybranego zakresu („wszędzie").

## Poprawka po weryfikacji ręcznej — wiele przycisków naraz

Design przeoczył przypadek prawego kliku **w trakcie trzymania innego przycisku**. Objaw: prawy
klik podczas rysowania kreski nie porzucał jej, a kształt mgły (freehand/prostokąt) zostawał
**zapisany** zamiast porzucony. Wielokąt mgły był jedyną ścieżką, która przeszła — bo dodaje
wierzchołki na klik i nie trzyma przycisku.

Przyczyna: mysz to **jeden** pointer. Wciśnięcie prawego przy trzymanym lewym daje `pointermove`
(`buttons` 1→3), nigdy `pointerdown`; puszczenie — znowu `pointermove`, nigdy `pointerup`. Hook nie
rejestrował gestu i nie mógł zrobić replayu, a tłumienie oparte wyłącznie na `button` i tak zabijało
zdarzenie natywne. Handler narzędzia nie dostawał niczego żadną ścieżką.

Naprawa: tłumić tylko gdy prawy jest **jedynym** przyciskiem w grze — `(e.buttons & ~2) === 0`.
Nadal predykat bezstanowy, czytany wyłącznie z samego zdarzenia, więc nie wprowadza wyścigu.
Zmierzone `buttons` na `contextmenu`: `2` samodzielny prawy, `0` po puszczeniu (Windows), `3`
z trzymanym lewym, `6` ze środkowym.

## Znane ograniczenie (bez zmian względem dziś)

Ctrl+klik na macOS przy **już otwartym** menu: kolejność `mousedown` vs `contextmenu` dla
emulacji prawego przycisku jest niezdefiniowana (patrz komentarze w `FogLayer.jsx:262`
i `DrawingLayer.jsx:366`). Zależnie od kolejności menu może zostać zamknięte zamiast przeniesione.
Zachowanie identyczne jak przed zmianą — nie pogarszamy, ale też nie naprawiamy. Skrajny edge case.

## Ryzyko do zweryfikowania empirycznie

Fundament punktu 2 to założenie, że `contextmenu` z fizycznego prawego przycisku ma `button === 2`
we wszystkich docelowych przeglądarkach. **Weryfikacja w prawdziwej przeglądarce jest wymagana
przed uznaniem zadania za skończone** — jsdom tego nie odwzoruje, a dokumentacja nie zastępuje
pomiaru.

**Plan B**, gdyby `button` okazał się niewiarygodny: dławić trusted `contextmenu` bezwarunkowo,
a Ctrl+klik na macOS obsłużyć rozszerzeniem warunku `pointerdown` o `button === 0 && e.ctrlKey`,
tak żeby i on szedł ścieżką replay. Droższe (dotyka interakcji z `FogLayer`/`DrawingLayer`, które
świadomie odrzucają `ctrlKey`), dlatego to plan awaryjny, nie pierwszy wybór.

## Testy

Nowy `components/scene/useRightDragPan.test.jsx`, wzorzec z `useTokenRotate.test.jsx` — komponent-
harness (`render` z `@testing-library/react`), bo hook potrzebuje realnego elementu (`viewportRef`,
`scrollLeft`/`scrollTop`), nie `renderHook`:

| Przypadek | Oczekiwanie |
|---|---|
| Ruch poniżej progu (8px) | brak pana, `setIsPanning` niewywołane |
| Ruch powyżej progu, `modern` | `setPanOffset` z przesunięciem o delta |
| Ruch powyżej progu, `classic` | zmiana `scrollLeft`/`scrollTop` viewportu |
| `pointerup` bez draga | replay `contextmenu` na elemencie pod kursorem |
| `pointerup` po dragu | brak replayu |
| `pointercancel` | `setIsPanning(false)`, brak replayu |
| `contextmenu` trusted, `button === 2` | `preventDefault` + `stopPropagation` |
| `contextmenu` trusted, `button === 0` | przepuszczone (Ctrl+klik macOS) |
| `contextmenu` `isTrusted === false` | przepuszczone (nasz replay) |
| `pointerdown` z `button !== 2` | ignorowane |

Nowy `components/scene/SceneContextMenu.dismiss.test.jsx` renderuje `SceneImageContextMenu` i
`SceneTokenMultiContextMenu` i pokrywa usunięcie listenera: outside `contextmenu` już nie zamyka
menu, outside `mousedown` zamyka jak dotąd.

## Weryfikacja ręczna

Przepis uruchomienia brancha z worktree w przeglądarce: patrz pamięć `worktree-browser-testing`
(kontener frontendu montuje główny checkout — trzeba podmienić samą warstwę frontendu przez
osobny `-p` projekt, bo CORS backendu ma zaszytą whitelistę `localhost:3000`/`3001`).

Do sprawdzenia na macOS **i** na Windows:

1. Prawy‑drag na pustej mapie — przesuwa scenę, brak menu po puszczeniu.
2. Prawy klik na obrazku (GM) — menu obrazka otwiera się i **zostaje** otwarte.
3. Prawy klik obok otwartego menu — menu zamyka się.
4. Prawy klik na obrazku przy otwartym menu innego obrazka — menu przeskakuje.
5. Tryb Select, 2+ zaznaczone — prawy klik daje menu grupy, prawy‑drag przesuwa mapę.
6. Tryb fog, wielokąt w trakcie — prawy klik zamyka wielokąt, prawy‑drag przesuwa mapę.
7. Tryb drawing, kreska w trakcie — prawy klik porzuca kreskę, prawy‑drag przesuwa mapę.
8. Schemat `classic` — prawy‑drag przesuwa przez scroll, nie przez `panOffset`.
9. macOS: Ctrl+klik na obrazku — menu otwiera się.
10. Środkowy przycisk dalej cykluje tryby (`isModeCycleClick`), niezaburzony.
11. Prawy-drag puszczony **poza** viewportem — na Windows nadal może wyskoczyć natywne menu
    przeglądarki, bo trailing trusted `contextmenu` trafia w element spoza subtree React, które
    dławi zdarzenie (subskrypcja jest podpięta tylko na elemencie viewportu).
12. Sprawdź, czy żadna przeglądarka nie wysyła `pointercancel` dla prawego press'u, którego
    `contextmenu` zostało zdławione — gdyby wysyłała, replay poszedłby ścieżką bez odtworzenia
    (`pointercancel` prowadzi do gałęzi bez replayu) i menu obrazka nigdy by się nie otworzyło.
