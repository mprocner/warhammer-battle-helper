# FEATURE-212 — Konfigurowalna szerokość okna karty postaci

**Status:** do zaplanowania
**Dotyczy:** `warhammer-battle-helper-backend/internal/models/SystemTemplate.go`,
`warhammer-battle-helper-front/src/utils/sheetWidth.js` (nowy),
`src/components/creator/TemplatePreview.jsx` (nowy, wyciągnięty),
`src/components/creator/TemplateBuilder.jsx`, `src/systems/custom/CharacterSheet.jsx`,
`src/locales/{en,pl}/translation.json`
**Powiązane:** FEATURE-211 (zagnieżdżone sekcje — to układ kolumn decyduje, jaka szerokość ma sens)

## Kontekst

MG projektujący szablon w kreatorze układa sekcje w 1–6 kolumn. Sekcja 4-kolumnowa jest czytelna
przy 1200px i nieczytelna przy 700px, ale szerokość okna karty jest dziś zakodowana na sztywno:
`initialWidth={900}` w `systems/custom/CharacterSheet.jsx`. Jeden MG chce wąskiej karty, inny
szerokiej, i żaden nie ma jak tego zmienić.

## Co JUŻ jest w kodzie (i czego przez to nie budujemy)

`DraggablePopup` przycina szerokość startową do okna przeglądarki:

```js
width: Math.min(initialWidth, window.innerWidth)   // DraggablePopup.jsx:31
```

i pilnuje dolnej granicy 600px przy ręcznym rozciąganiu (`minWidth = 600`, linia 98).
`initialWidth` jest **już propem** — feature sprowadza się do podmiany stałej na wartość
z szablonu.

**Dlatego NIE dodajemy drugiego ustawienia „maksymalna szerokość"**, mimo że było w pierwotnym
pomyśle. Trzy powody: (1) to druga liczba zgadywana przez tego samego MG, który nie przetestuje
małych ekranów — jeśli nie ufamy pierwszej, nie ma powodu ufać drugiej; (2) sufit i tak narzuca
przeglądarka, i robi to lepiej, bo zna realny viewport w chwili otwarcia, a wartość MG pochodzi
z czasu projektowania; (3) tak to się robi w sieci — autor podaje wartość **preferowaną**,
granice biorą się z jednostek viewportu (idiom `clamp()` / `min()`). Odpowiednikiem jest tu
`min(<szerokość MG>, 100vw)`, czyli dokładnie to, co kod już liczy w JS.

## Ustalenia projektowe

| Decyzja | Wybór |
|---|---|
| Liczba ustawień | JEDNA — szerokość początkowa okna. Sufit i podłoga już w kodzie |
| Zakres systemów | TYLKO szablony custom. Wbudowane karty ustala programista, MG nie jest ich autorem |
| Kontrolka | Suwak 600–2400px, krok 50, domyślnie 900 |
| Wysokość | NIE. Zostaje 800 |
| Podgląd | Renderuje w ustawionej szerokości |
| Zapamiętywanie rozciągnięcia przez gracza | POZA ZAKRESEM — osobny pomysł na liście użytkownika, niski priorytet |

**Dlaczego nie „dopasuj do treści".** Siatka sekcji używa `repeat(N, minmax(0, 1fr))`, a kolumny
`1fr` nie mają naturalnej szerokości wynikającej z treści — dzielą to, co dostaną. „Dopasuj do
treści" musiałoby znaczyć `max-content`, a wtedy o szerokości karty decyduje najbardziej pechowy
element: jedna tabela broni rozepchnie ją na 2000px, karta z samymi atrybutami skurczy się do
300px. Szerokość przestałaby być decyzją projektową, a stała się skutkiem tego, co gracz wpisał
w notatki.

**Dlaczego tylko custom.** MG jest autorem szablonu wyłącznie w kreatorze. Dla wariantu systemu
wbudowanego kreator pokazuje zakładkę Ogólne (token display, kości, modyfikator), ale sama karta
pochodzi z pluginu — jej szerokość jest decyzją programisty. Karta z tym ustawieniem jest więc
**ukryta dla wariantów** tym samym warunkiem `!isVariant`, którym ukryta jest karta widoczności
publiczny/prywatny. Inaczej MG Warhammera zobaczyłby pole, które nic nie robi.

**Nazewnictwo.** Karta nazywa się „Okno karty postaci", nie „Szerokość karty" — ustawiamy rozmiar
startowy OKNA, nie wymiar dokumentu. Okno jest rozciągalne, więc liczba MG to punkt startowy,
a nie klatka; zły wybór gracz poprawia chwytem za krawędź.

## Model

`TemplateSettings` dostaje jedno pole:

```go
// SheetWidth is the character sheet window's opening width in pixels, authored by the GM in
// the creator's General tab. 0 or absent means the default — a plain int, not a pointer,
// because 0 is not a legal width (the slider floor is 600), so omitempty cannot erase a
// meaningful value the way it could for a field whose 0 is real.
SheetWidth int `bson:"sheetWidth,omitempty" json:"sheetWidth,omitempty"`
```

To ten sam argument, którym uzasadniony jest istniejący `FieldDef.Step` — oba pola mają tę samą
naturę i powinny tłumaczyć się tak samo.

Backend poza przechowywaniem nie robi nic: nie waliduje, nie liczy, nie maskuje. Zmiana jest
addytywna, **migracji nie ma** — istniejące szablony nie mają klucza i czytają się bez zmian.

## Granice w jednym miejscu

Nowy `src/utils/sheetWidth.js`:

```js
export const SHEET_WIDTH_MIN = 600;      // matches DraggablePopup's resize floor
export const SHEET_WIDTH_MAX = 2400;
export const SHEET_WIDTH_STEP = 50;
export const SHEET_WIDTH_DEFAULT = 900;  // today's hardcoded value in the custom sheet

// clampSheetWidth turns whatever is stored into a width worth using: absent, zero or
// out-of-range collapse to a sane value. The slider cannot produce those, but a template
// hand-edited in the database or written before this setting existed can.
export function clampSheetWidth(value)
```

Czysta funkcja bez DOM, jedno źródło dla suwaka i dla fallbacku karty. Bez tego „900" żyłoby
w dwóch plikach i rozjechało się przy pierwszej zmianie.

## Kreator

W zakładce Ogólne nowa karta `creator__settings-card` zatytułowana „Okno karty postaci",
wstawiona za kartą widoczności, ukryta dla wariantów (`!isVariant`). W środku MUI `Slider`
z zakresem `SHEET_WIDTH_MIN`–`SHEET_WIDTH_MAX`, krokiem `SHEET_WIDTH_STEP` i odczytem `{n} px`.
Podpis mówi wprost, że okno nie przekroczy szerokości przeglądarki i że gracz może je rozciągnąć.

Zapis idzie istniejącym `updateSettings({ sheetWidth })` — debounce, autosave i flush przy
zamknięciu działają bez zmian.

Nowe klucze i18n, równolegle w `en/` i `pl/`: `creator.general.sheetWidthTitle`,
`creator.general.sheetWidthHint`, `creator.general.sheetWidthValue`.

## Podgląd

`TemplatePreview` dostaje `width` i nakłada `maxWidth` na kontener karty, więc suwak przesunięty
w Ogólnych natychmiast zmienia to, co widać w Podglądzie.

To jedyny element tego ticketu, który realnie adresuje obawę „MG da dużą szerokość i nie
sprawdzi". Ostrzeżeniem tego nie rozwiążemy — świadomie odrzuciliśmy ostrzeżenia o wąskich
kolumnach w FEATURE-211, ustalając, że **podgląd jest źródłem prawdy**. Ta sama zasada obowiązuje
tutaj.

Kupujemy świadomie: przy 2400px na laptopie podgląd pokaże kartę przyciętą do szerokości okna
kreatora — czyli dokładnie to, co zobaczy gracz z takim ekranem. To nie błąd, to ta sama prawda.

**Przy okazji naprawiana istniejąca rozbieżność.** `.creator__prev-sheet` ma dziś w CSS
`max-width: 860px` (`style.css:9749`), podczas gdy realna karta otwiera się na 900 — podgląd był
więc od zawsze odrobinę węższy niż to, co pokazuje. Styl inline nadpisuje regułę z arkusza, więc
przekazanie szerokości zastępuje ten limit, a nie walczy z nim. Regułę CSS zostawiamy jako
wartość awaryjną, gdyby `width` kiedykolwiek był nieokreślony.

## Karta w sesji

`systems/custom/CharacterSheet.jsx:409`:

```jsx
initialWidth={clampSheetWidth(template?.settings?.sheetWidth)}
```

`template` bywa `null` (obsłużone osobno w linii 368), więc optional chaining jest konieczne,
a `clampSheetWidth` i tak sprowadza `undefined` do wartości domyślnej.

**Nietknięte:** `systems/coc7e` (900), `systems/dnd5e` (1100), `warhammer4e` (domyślne 1400
z `DraggablePopup`), oraz strona samodzielna — `.sheet-standalone` ma `width: 100vw`
(`style.css:2249`) i tak zostaje. Ustawienie dotyczy wyłącznie okna w sesji.

## Co dokładnie znaczy ta liczba

Liczba MG to **szerokość projektowa karty**, używana w dwóch miejscach:

- **Popup w sesji** — szerokość, z jaką okno się otwiera (`initialWidth`). Gracz może je rozciągnąć.
- **Treść karty** — `max-width` opakowania `.custom-sheet`, więc karta wypełnia okno zamiast
  kończyć się wcześniej, a na stronie samodzielnej (`width: 100vw`) nie rozciąga się na całą
  szerokość monitora.

**Znaleziona przy weryfikacji ręcznej i naprawiona w tym samym ticketcie:** `.custom-sheet` miało
w CSS `max-width: 760px`, twardo, od zawsze. Popup rósł, treść nie. Przy dawnych zakodowanych
900 różnica wynosiła ~140px i nikt jej nie zauważył — przy 2400 karta zajmowała jedną trzecią okna.

**Dlaczego podgląd tego nie pokazał.** `TemplatePreview` renderuje `CustomSheetBody` bezpośrednio,
BEZ opakowania `.custom-sheet` — więc limit tam nie obowiązywał. Podgląd dzieli z kartą ciało,
ale nie opakowanie: nie ma paddingu 16px, nie ma limitu szerokości, nie ma nagłówka z nazwą
postaci. Wniosek ogólniejszy niż ten błąd: **„ten sam komponent" nie znaczy „ten sam render"**,
dopóki nie zgadza się też to, co go otacza.

## Kiedy zmiana dociera do trwającej gry

**Gra osadza KOPIĘ szablonu** (`GameService.go:59`), a kopia odświeża się wyłącznie przez
„Synchronizuj szablon" (`GameService.go:2966`). Zmiana szerokości w kreatorze **nie zmienia**
więc automatycznie kart w grach już założonych — karta otworzy się w starej szerokości, dopóki
MG nie uruchomi synchronizacji.

To zachowanie nie jest nowe i nie jest wprowadzane przez ten ticket — dotyczy tak samo kości,
modyfikatora i token display. Zapisane tutaj, bo przy testowaniu tej funkcji prowadzi wprost do
fałszywego wniosku „szerokość nie działa": edytujesz szablon, otwierasz kartę we wczorajszej grze
i widzisz starą wartość.

Efekt uboczny tej samej mechaniki: stara zakładka kreatora otwarta przez deploy wyśle przy
najbliższym autosave obiekt `settings` bez klucza `sheetWidth`, a `TemplateRepository.Update`
podmienia `settings` w całości — czyli skasuje ustawienie. Naprawia się samo po odświeżeniu,
a wartością awaryjną jest 900, więc awaria jest niewidoczna. Warto o tym wiedzieć, gdyby MG
zgłosił „szerokość mi się zresetowała".

## Testy

- `src/utils/sheetWidth.test.js` — `clampSheetWidth`: brak wartości, `0`, poniżej minimum,
  powyżej maksimum, wartość w zakresie, wartość nienumeryczna.
- `TemplatePreview` **wychodzi do własnego pliku** `src/components/creator/TemplatePreview.jsx`.
  Dziś jest funkcją modułową wewnątrz 1700-linijkowego `TemplateBuilder.jsx` i nie jest
  eksportowany, więc nie da się go wyrenderować w teście bez wciągania całego kreatora z MUI
  i dnd-kit. Wyciągnięcie to czyste przeniesienie bez zmiany zachowania, po którym jeden mały
  test renderujący pokrywa jedyne wiązanie, na którym MG polega wzrokowo.
- Test renderujący `TemplatePreview`: `maxWidth` trafia na `.creator__prev-sheet`, oraz przypadek
  pustego szablonu renderuje się dalej bez zmian.
- **Test renderujący szerokość suwaka w ogólnym panelu** — `src/components/creator/TemplateBuilder.sheetWidth.test.jsx` (3 testy): czy karta pojawia się dla szablonu niestandardowego, czy ukrywa się dla wariantu systemu wbudowanego, i czy suwak pisze szerokość przez `updateSettings`. `TemplateBuilder` importuje `api/axios` i przez rejestr systemów także `axios` — ESM import, który jest nie do parsowania dla jesta. Mockowanie samej instancji (`../../api/axios`) NIE wystarcza — trzeba zamockować `axios`. Po zamockowaniu `axios` cały kreator montuje się w jsdom bez problemu — blokadą był więc tranzytywny import, a nie sam komponent, i to samo odblokowuje testy renderujące dla reszty kreatora, gdyby kiedyś były potrzebne.

Uruchamianie frontu: `CI=true npm test -- --watchAll=false` z `warhammer-battle-helper-front/`.
Znany baseline fail `App.test.js` (axios ESM) nie jest regresją.
