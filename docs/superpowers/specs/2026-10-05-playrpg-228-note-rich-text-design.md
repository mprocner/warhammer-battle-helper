# PLAYRPG-228 — zaawansowana edycja tekstu w notatkach

## Cel

Rozszerzyć edytor notatek (`NoteEditorModal`, Tiptap v3) o: kolor tekstu, rozmiar tekstu,
nagłówki H1–H3, podkreślenie, zakreślacz, wyrównanie, linki i czyszczenie formatowania.

## Decyzje

- **Biblioteka:** zostajemy przy Tiptap v3. Dochodzą `@tiptap/extension-text-style`
  (`TextStyle`, `Color`, `FontSize`), `@tiptap/extension-highlight`, `@tiptap/extension-text-align`.
  Usuwamy nieużywane `@tiptap/extension-link` — Link (i Underline) są w StarterKit v3.
  Odrzucone: BlockNote (ciężki, własne UI, format JSON), Lexical / Quill / Slate (przepisanie
  edytora), TinyMCE / CKEditor (licencja, waga).
- **Format danych bez zmian:** `Note.Content` zostaje stringiem HTML. Brak migracji.
- **Kolor (tekst i zakreślacz):** paleta + „własny kolor" z natywnego `<input type="color">`,
  zapis jako inline `style`, zawsze `#rrggbb`.
- **Rozmiar:** nagłówki H1–H3 definiują rozmiar i pogrubienie w CSS. Niezależnie combobox
  rozmiaru: presety `12 / 14 / 16 / 20 / 24 / 32 px` + własna wartość 8–72 px (clamp, nie odrzucenie).
  Rozmiar na `<span>` wewnątrz nagłówka wygrywa z rozmiarem nagłówka.
- **Toolbar:** jeden rząd z grupami i `flex-wrap`.

### Palety

Tekst (kontrast ≥ 4.5:1 na `#fff9f0`):
domyślny `#3a2f1f` (= zdjęcie koloru), czerwień `#a8322d`, pomarańcz `#b85c1e`, złoto `#9a6b2f`,
zieleń `#2f6b3a`, błękit `#2d5a8a`, fiolet `#6b3f8a`, szarość `#6e6458`.

Zakreślacz: żółty `#fff3a3`, zielony `#d4f0c4`, niebieski `#cfe3f7`, różowy `#f7d4e0`,
pomarańczowy `#fde0c2`, lawendowy `#e3d9f2` + „brak".

## Backend — polityka bluemonday (`NoteService.go`)

Sanityzacja odbywa się na zapisie i jest jedyną granicą bezpieczeństwa (treść renderuje tylko
edytor Tiptap, brak `dangerouslySetInnerHTML`). Bez rozszerzenia polityki serwer po cichu wycina
nowe style, a echo WS kasuje formatowanie.

```go
noteColorRe     = `^#[0-9a-fA-F]{6}$`
noteFontSizeRe  = `^([89]|[1-6][0-9]|7[0-2])px$`   // 8–72px
noteAlignRe     = `^(left|center|right)$`
noteMarkColorRe = `^inherit$`                      // Highlight v3 emits color: inherit
```

- Elementy: dodać `span`, `mark`, `a`.
- `span`: `color` (noteColorRe), `font-size` (noteFontSizeRe).
- `mark`: `background-color` (noteColorRe), `color` (noteMarkColorRe), atrybut `data-color` (noteColorRe).
- `p`, `h1`, `h2`, `h3`: `text-align` (noteAlignRe).
- Linki: `RequireParseableURLs(true)`, `AllowURLSchemes("http", "https", "mailto")`,
  `AddTargetBlankToFullyQualifiedLinks(true)`, `RequireNoReferrerOnLinks(true)`.
  Zamyka istniejącą lukę: dziś `href="javascript:…"` przechodzi.
- Wszystkie regexy zakotwiczone `^…$`.
- Wartości spoza polityki (np. `rgb(...)`, `1.2em` z wklejonego tekstu) są wycinane — akceptowalne.

**Niezmiennik międzyjęzykowy:** zakres rozmiaru 8–72 i format koloru istnieją w Go
(`NoteService.go`) i JS (`noteFormatting.js`). Brak testu spinającego obie strony — każda stała
ma komentarz wskazujący drugą.

## Frontend

```
components/tabs/notes/
  NoteEditorModal.jsx        — okno + autozapis (bez zmian) + <NoteToolbar editor={editor} />
  noteFormatting.js          — palety, presety, FONT_SIZE_MIN/MAX, clampFontSize, parseFontSize, readFontSize, normalizeHref (czyste, bez Tiptap)
  noteExtensions.js          — NOTE_EXTENSIONS (jedyny plik importujący rozszerzenia Tiptap)
  NoteToolbar.jsx            — grupy, flex-wrap, tooltipy, stan otwartego popovera
  toolbar/
    ToolbarButton.jsx        — ToolbarButton + ToolbarPopoverButton (kotwica, zamykanie)
    usePopoverDismiss.js     — klik poza kotwicą / Esc
    HeadingSelect.jsx        — Akapit / H1 / H2 / H3
    FontSizeCombo.jsx        — presety + własna wartość (Enter = zastosuj)
    ColorPopover.jsx         — paleta + własny kolor + wyczyść (tekst i zakreślacz)
    LinkPopover.jsx          — pole URL, Zastosuj / Usuń link
```

Rozszerzenia:
```js
StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } }),
TextStyle, Color, FontSize,
Highlight.configure({ multicolor: true }),
TextAlign.configure({ types: ['heading', 'paragraph'] }),
```

Toolbar:
`[HeadingSelect][FontSizeCombo] | B I U S | Kolor▾ Zakreślacz▾ | ⇤ ≡ ⇥ | • 1. ❝ ― | Link FormatClear`

Ikony MUI: `FormatColorText`, `BorderColor`, `FormatAlignLeft/Center/Right`, `FormatUnderlined`,
`Link`, `FormatClear` + istniejące. Czyszczenie: `unsetAllMarks()` + `clearNodes()`.

Szczegóły:
- Dropdowny pokazują wartość pod kursorem (`editor.getAttributes('textStyle').fontSize`);
  brak rozmiaru → placeholder `13` (bazowy rozmiar edytora).
- Przyciski toolbara: `onMouseDown={e => e.preventDefault()}`; komendy przez
  `editor.chain().focus()…` odtwarzają selekcję po fokusie w polu rozmiaru / pickerze.
- Popovery: własny dropdown `position: absolute` pod przyciskiem, zamykany klikiem poza i Esc.
  Nie MUI Popover (emotion wygrywa z klasami `style.css`). Paleta kart: tło `#fff9f0`,
  ramka `#c4a882`, focus `#7a5c42`.
- Tooltipy: portal tooltip wg konwencji, ale dla toolbara wariant **pod przyciskiem** —
  nowy modyfikator `.portal-tooltip--below` (strzałka u góry), żeby nie zasłaniać sąsiadów.
- CSS: dodać styl `h1` (dziś są tylko `h2`, `h3`), `mark`, `a` w `.note-editor__content .tiptap`.
- i18n: `notes.toolbar.*` w en i pl.

## Testy

Backend:
- `NoteService_policy_test.go` — tabelaryczny test `noteHTMLPolicy.Sanitize`.
  Przechodzi bez zmian: span kolor/rozmiar, rozmiar 8 i 72, mark z data-color + background-color +
  color: inherit, text-align na p/h1, link https/mailto. Wycinane: 7px, 73px, `color: red`,
  `rgb(...)`, `url(...)`, `javascript:` w href, `position: fixed`, styl na niedozwolonym elemencie.
- Przypadki „przechodzi" to dosłowne wyjście `getHTML()` z przeglądarki (komentarz z pochodzeniem).

Frontend (editor mockowany — Jest w CRA nie transpiluje ESM Tiptap):
- `noteFormatting.test.js` — `parseFontSize` / `readFontSize` / `normalizeHref`, format palet zgodny z regexem backendu.
- `NoteToolbar.test.jsx` — fake editor ze spy `chain()`: przyciski, `HeadingSelect`, `FontSizeCombo` po Enter.
- `ColorPopover.test.jsx` — pola palety, `onSelect(hex)`, `onCustom(hex)`, `onClear`.
- `ToolbarButton.test.jsx` — zamykanie popovera Esc / klik poza, klik wewnątrz nie zamyka.
- `FontSizeCombo.test.jsx`, `HeadingSelect.test.jsx`, `LinkPopover.test.jsx`.
- Istniejące `NoteEditorModal.*.test.jsx`: mock `@tiptap/starter-kit` zastąpiony `jest.mock('./noteExtensions')`; atrapa editora dostaje `getAttributes`.
- Baseline fail `App.test.js` (axios ESM) — nie regresja.

Weryfikacja w przeglądarce (obowiązkowa):
- Nowe zależności npm: `docker compose up --renew-anon-volumes` (uruchamia użytkownik).
- Dwóch graczy, publiczna notatka: A ustawia kolor, 18px, H1, zakreślacz, środek, link → B widzi
  przez WS; po przeładowaniu formatowanie zostaje (przeszło przez bluemonday).
- Zawijanie toolbara przy szerokości okna 320 px.

## Poza zakresem

Współedycja w czasie rzeczywistym, obrazy, tabele, listy zadań, wzmianki, rzuty w treści —
nie w PLAYRPG-228.
