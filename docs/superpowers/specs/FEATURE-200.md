# FEATURE-200 — Rejestr skrótów klawiszowych + legenda + `R` = obrót o 45°

**Status:** notatki z brainstormu, NIE gotowy spec — zostaje jedna nierozstrzygnięta decyzja architektoniczna (patrz „Otwarte pytanie")
**Wydzielone z:** BUG-194 (`docs/superpowers/specs/2026-09-11-BUG-194-rotate-handle-equator-design.md`), 2026-09-11

## Skąd się wzięło

BUG-194 przeniósł uchwyt rotacji tokenu do kolumny prawego równika. W trakcie brainstormu padł
pomysł, żeby dołożyć skrót: zaznaczony token + `R` = obrót o 45°, bez modyfikatorów.

Decyzja: **ikona zostaje głównym afordansem, `R` jest przyspieszaczem**. Użytkownik nie ma się
domyślać ani zaglądać do legendy — ikona jest widoczna, a tooltip może nieść podpowiedź klawisza.

`R` NIE trafił do BUG-194, bo dołożenie czwartego rozsypanego listenera `window` byłoby długiem,
który ten ticket właśnie ma spłacić.

## Zakres

1. Rejestr skrótów (jedno miejsce, jeden listener).
2. Migracja trzech istniejących listenerów do rejestru.
3. Legenda skrótów w UI.
4. `R` = obrót zaznaczonego tokenu o 45°.

Punkty 1-2 są warunkiem sensownego 3: legenda pisana ręcznie rozjedzie się z kodem przy pierwszym
skrócie dodanym w pośpiechu.

## Stan obecny

Trzy globalne listenery `keydown`, wszystkie w `components/DndContext.jsx`:

| linia | skrót | warunek |
|---|---|---|
| `:147` | `Escape` — czyści multi-zaznaczenie | `editingLayer === 'select'` |
| `:157` | `Delete` / `Backspace` — usuwa zaznaczony obrazek | `selectedImageId` |
| `:175` | `Delete` / `Backspace` — usuwa wszystkie zaznaczone tokeny | `editingLayer === 'select' && selectedTokens.length` |

Guard na pola tekstowe (`INPUT` / `TEXTAREA` / `SELECT` / `isContentEditable`) jest **zduplikowany**
w `:158` i `:176`. `Escape` guarda nie ma wcale.

## Proponowana architektura

```
constants/shortcuts.js     — katalog: { id, key, i18nKey, category, allowInInputs }
contexts/ShortcutsContext  — JEDEN listener na window, mapa id → handler ref
hooks/useShortcut(id, handler, { enabled })
components/ShortcutsLegend — renderuje katalog, wyszarza to, co nieaktywne
```

### Dlaczego katalog statyczny **plus** rejestracja dynamiczna, a nie jedno z dwóch

- **Sam rejestr żywy** → legenda pokazuje tylko to, co akurat aktywne. Użytkownik nie dowie się
  o `Delete`, dopóki czegoś nie zaznaczy. Legenda ma uczyć, więc musi znać pełną listę.
- **Sam katalog statyczny** → nic nie gwarantuje, że wpis ma handler. Skrót usunięty z kodu zostaje
  w legendzie na zawsze.
- **Razem** → `useShortcut` z `id` spoza katalogu rzuca w dev; wpis bez rejestracji widać w legendzie
  jako nieaktywny. Drift wykluczony z obu stron.

### Zgodność z zasadą z CLAUDE.md

„Konflikty propagacji rozwiązuj usuwając nadmiarowego słuchacza, nie wchodząc wyżej w drzewo."
Jeden listener zamiast N to dokładnie ta zasada.

### Detale, których nie da się pominąć

- **Handler w `useRef`**, deps efektu = `[id, enabled]`. Inaczej każdy render przerejestrowuje.
- **Guard na pola tekstowe w jednym miejscu**, z furtką `allowInInputs` dla `Escape`.
- **Migracja trzech istniejących listenerów w tej samej zmianie.** Dwa mechanizmy obok siebie są
  gorsze niż jeden zły.

## Pułapki specyficzne dla `R`

Żadna z nich nie dotyczyła `Escape` ani `Delete`:

1. **`R` to znak drukowalny.** Czat, notatki, nazwa sceny — wszędzie tam wpisanie „r" nie może
   kręcić tokenem. `Delete` był bezpieczniejszy: w polu tekstowym i tak coś kasował, więc
   użytkownik nie tracił nic zaskakującego.
2. **Jeden `R` = jeden `onCommitRotate` = jeden request** (`MapCharacterToken.jsx:60`). Osiem
   szybkich naciśnięć = 8 PATCH-ów + 8 broadcastów WS. Drag commituje **raz**, na `mouseup`, bo
   `useTokenRotate` trzyma kąt lokalnie. Do rozstrzygnięcia: debounce commitu (~300ms) albo świadoma
   zgoda na spam.
3. **Gating.** `R` musi respektować dokładnie ten sam predykat co ikona (`canManipulateToken` /
   `locked` / warstwa / GM), inaczej gracz obróci token, którego nie może chwycić.
4. **`snapAngle` to magnes, nie kwantyzator.** `utils/angleSnap.js`: `SNAP_STEP = 45`,
   `SNAP_THRESHOLD = 10`. Przy kącie 20° `R` da 65° (obrót względny) albo 45° (skok do najbliższej
   krotki) — dwie różne semantyki, trzeba wybrać.
5. **Modyfikatory + kółko są zajęte.** W schemacie `classic` (`SceneViewport.jsx:189-211`)
   `Ctrl`/`Cmd`+scroll = zoom, `Shift`+scroll = przewijanie poziome. Zostaje goła litera.

## Otwarte pytanie — rozstrzyga architekturę, do odpowiedzi przed pisaniem specu

`useShortcut('rotateToken', fn, { enabled })` wywołany wewnątrz `MapCharacterToken` — a ten
komponent renderuje się **raz na każdy token na scenie**. Gracz zaznacza 5 tokenów.

Ile handlerów wyląduje w rejestrze pod `R`, i co po naciśnięciu `R` powinno się stać?

Z odpowiedzi wynika, czy rejestracja siedzi w tokenie, czy wyżej — w `DndContext`, które i tak już
zna `selectedTokens`.

## Kontekst z innych systemów (zebrany przy BUG-194)

- **Roll20** — uchwyt rotacji na górze tokenu i **ten sam bug co BUG-194** (wątek „How do I rotate
  the token when the three bubbles keep covering the spoke…"). Obejście społeczności to nie
  przesunięcie uchwytu, tylko klawisz: `E` + kółko (snap 45°/30°), `ALT` = 1°.
- **Foundry VTT** — brak uchwytu w ogóle: `Shift`+kółko / `Shift`+WASD/strzałki, `Ctrl`+kółko na
  drobny krok.

Obie ścieżki potwierdzają wybór „ikona + skrót", nie „sam skrót": Roll20 dołożył klawisz *po*
tym, jak uchwyt okazał się zasłaniany.
