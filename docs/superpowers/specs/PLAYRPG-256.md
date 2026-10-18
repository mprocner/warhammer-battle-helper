# PLAYRPG-256 — formatowanie w polu „tekst długi” karty custom

## Cel

MG w kreatorze może włączyć w polu `text_long` opcję „formatowanie tekstu”. Gracz widzi wtedy na
karcie edytor z pełnym paskiem stylów jak w notatkach (nagłówki, rozmiar, B/I/U/S, kolor, highlight,
wyrównanie, listy, cytat, linia, link, czyszczenie). Toolbar i edytor notatek zostają wydzielone do
wspólnego modułu `components/common/richText/`.

## Decyzje

| Pytanie | Decyzja |
|---|---|
| Zakres toolbara | Pełny zestaw z notatek, bez konfiguracji |
| Widoczność toolbara | Zawsze widoczny (bez focus-only) |
| Przełączanie flagi na istniejących danych | Konwersja przy odczycie, bez migracji |
| Tryb tylko-do-odczytu | Występuje wyłącznie w kreatorze → toolbar `disabled`, edytor nieedytowalny |
| Wysokość kafelka | 4 wiersze z flagą (2 bez), treść przewija się wewnątrz |
| Wydzielenie | Wspólny `common/richText/`; notatki biorą toolbar i rozszerzenia, zostają przy własnym `useEditor` |
| Nazewnictwo | `note-toolbar*` → `rich-toolbar*`, `notes.toolbar.*` → `richText.toolbar.*` |

## Część 1 — model i backend

### Flaga w szablonie

`FieldDef` (`internal/models/SystemTemplate.go`):

```go
// RichText turns a text_long field into a styled editor; its value in Stats.Texts is then
// sanitized HTML instead of plain text. Ignored on every other type.
RichText bool `bson:"richText,omitempty" json:"richText,omitempty"`
```

Domyślnie wyłączona — `omitempty` jest bezpieczne (brak pola = brak stylów).

### Dane postaci

`Stats.Texts` zostaje `map[string]string`. Dla pola z flagą string zawiera HTML.

### Wspólna policy sanityzacji

`noteHTMLPolicy` przenosimy z `internal/service/NoteService.go` do `internal/sanitize/richhtml.go`
jako `sanitize.RichHTML(s string) string`. `NoteService` woła ją zamiast lokalnej policy. Komentarz
w `richTextExtensions.js` wskazuje nowe miejsce.

### Sanityzacja przy zapisie postaci

Nowa metoda pluginu custom:

```go
func (p *Plugin) SanitizeRichTexts(raw bson.Raw, tmpl *models.SystemTemplate) (bson.Raw, error)
```

Chodzi po polach szablonu z zagnieżdżonymi sekcjami (wzorzec `SeedDefaults`); dla każdego
`text_long` z `RichText` przepuszcza `Texts[key]` przez `sanitize.RichHTML`. Pozostałych kluczy nie
dotyka — bluemonday zamieniłby `a < b` w `a &lt; b`.

Wywołanie w `CharacterHandler` przed `ComputeDerived`: **Update** (autozapis), **Create** (klient
może przysłać stats), **Clone** (obrona w głąb). Gra bez szablonu → pomijamy. Błąd → log, stats bez
zmian (jak `SeedDefaults`).

Po wyłączeniu flagi backend przestaje czyścić dane pole; front pokazuje wtedy ewentualny HTML jako
plain text (`htmlToPlain`) w textarea, więc nic nie jest wykonywane.

### Testy Go

- `sanitize`: `<script>` i `onclick` wycięte, dozwolone style (`color`, `font-size`, `text-align`,
  `mark`) zostają.
- `SanitizeRichTexts`: pole z flagą wyczyszczone; pole bez flagi bajt w bajt (`a < b`); pole
  w zagnieżdżonej sekcji obsłużone; szablon `nil` → stats bez zmian.

## Część 2 — moduł `components/common/richText/`

### Przenosiny (`git mv`)

```
tabs/notes/noteExtensions.js          → common/richText/richTextExtensions.js   (RICH_TEXT_EXTENSIONS)
tabs/notes/noteFormatting.js (+test)  → common/richText/richTextFormatting.js (+test)
tabs/notes/NoteToolbar.jsx (+test)    → common/richText/RichTextToolbar.jsx (+test)
tabs/notes/toolbar/*                  → common/richText/toolbar/*
tabs/notes/testUtils/fakeEditor.js    → common/richText/testUtils/fakeEditor.js
```

- Klasy `note-toolbar*` → `rich-toolbar*`.
- Klucze `notes.toolbar.*` → `richText.toolbar.*` (en + pl).
- Style `.note-toolbar*` z `components/tabs/NotesTab.css` → nowy `common/richText/RichText.css`.
- Style typografii treści (`.note-editor__content .tiptap p/h1–3/listy/mark…`) →
  `.rich-text__content .tiptap …` w `RichText.css`. Wymiary okna notatki zostają w `NotesTab.css`.
- `NoteEditorModal` zostaje przy własnym `useEditor` i swojej synchronizacji
  (`shouldApplyRemoteNote`); zmieniają się tylko importy, a kontener treści dostaje dodatkowo klasę
  `rich-text__content`.

### `RichTextEditor.jsx` (nowy)

```jsx
<RichTextEditor value={html} onChange={html => …} editable={bool} className="…" />
```

- `useEditor({ extensions: RICH_TEXT_EXTENSIONS })`, `onTransaction` wymusza re-render (toolbar musi
  widzieć stored marks na zwiniętej karetce).
- `onUpdate` → `onChange(editor.getHTML())`; pusty dokument (`editor.isEmpty`) zapisuje `''`.
- Sync z propem: gdy `value !== getHTML()` → `setContent(value, { emitUpdate: false })`, karetka
  odtwarzana tylko gdy edytor miał focus, przycięta do rozmiaru nowego dokumentu (logika
  `applyRemoteContent` z notatek).
- `editable={false}` → `editor.setEditable(false)` + `<RichTextToolbar disabled />`.

### `RichTextToolbar` — prop `disabled`

Przekazywany do `ToolbarButton`, `ToolbarPopoverButton`, `HeadingSelect`, `FontSizeCombo`. Wyłączony
przycisk nie otwiera popovera.

### `richTextConvert.js` (nowy)

- `plainToHtml(text)` — escape `& < > "`, każda linia → `<p>…</p>`, pusta → `<p></p>`; `''` → `''`.
- `htmlToPlain(html)` — przez `DOMParser`; bloki (`p`, `h1–3`, `li`, `blockquote`) i `<br>` → `\n`,
  końcowe `\n` przycięte.
- `looksLikeHtml(s)` — zaczyna się od `<` i zawiera tag blokowy z listy powyżej.

### Testy

- `richTextConvert.test.js` — round-trip, escape, puste wartości, wiele linii.
- `RichTextEditor.test.jsx` — zmiana `value` z zewnątrz nie woła `onChange`; `editable=false` →
  przyciski toolbara `disabled`.
- Istniejące testy notatek i toolbara przechodzą po zmianie importów i nazw.

## Część 3 — karta, kreator, tutorial, i18n

### Karta — `systems/custom/CustomSheetBody.jsx`, gałąź `text_long`

```jsx
case 'text_long': {
  const raw = texts[field.key] || '';
  return renderTile(field, 'text', field.richText
    ? <RichTextEditor
        className="custom-sheet__rich-text"
        value={looksLikeHtml(raw) ? raw : plainToHtml(raw)}
        onChange={onChange ? html => onChange.text(field.key, html) : undefined}
        editable={!readOnly} />
    : <textarea className="custom-sheet__textarea"
        value={looksLikeHtml(raw) ? htmlToPlain(raw) : raw} … />);
}
```

Zapis przez istniejące `onChange.text` → `updateText` → autozapis 800 ms (`CharacterSheet.jsx`).
Bez nowych handlerów. Kreator i duch drag & drop renderują `readOnly` → toolbar `disabled`.

### Wysokość — `systems/custom/fieldRowSpan.js`

```js
if (field.type === 'text_long') return field.richText ? 4 : 2;
```

Komentarz pliku: span wynika z typu **i flagi**, nadal nic nie jest zapisywane w szablonie.

CSS `.custom-sheet__rich-text`: kolumna flex; toolbar `flex: none` (zawija się), treść
`flex: 1; min-height: 0; overflow-y: auto`. Kolory z palety karty: tło `#fff9f0`, tekst `#3a2f1f`,
ramka `#c4a882`, focus `#7a5c42`.

### Kreator — `components/creator/TemplateBuilder.jsx`

- `displayFlags('text_long')` → `['richText']` — przełącznik w istniejącej grupie „Wyświetlanie”
  przez `FlagSwitch`.
- `SKILL_FLAG_META.richText = { labelKey: 'creator.richText', hintKey: 'creator.richTextHint' }`.

### Tutorial

- Nowy wariant `tutorial.creatorField.display.body.text_long` (en + pl).
- `tutorial.creatorField.head.body.text_long` — dopisać wzmiankę o opcji formatowania.
- Brak nowej grupy i typu → `creatorTour.coverage.test.jsx` i `tourTranslations.test.js` bez zmian.

### i18n (en + pl)

- Nowe: `creator.richText`, `creator.richTextHint`, `tutorial.creatorField.display.body.text_long`.
- Przeniesione: `notes.toolbar.*` → `richText.toolbar.*`.

PL:
- `creator.richText`: „Formatowanie tekstu”
- `creator.richTextHint`: „Gracz dostaje pasek formatowania jak w notatkach. Po wyłączeniu
  istniejące teksty staną się zwykłym tekstem przy następnej edycji.”

### Testy frontu

- `fieldRowSpan`: `text_long` → 2 bez flagi, 4 z flagą.
- `CustomSheetBody`: z flagą jest `role="toolbar"` i brak textarea; bez flagi wartość HTML pokazana
  w textarea jako plain text; bez `onChange` przyciski toolbara `disabled`.
- `TemplateBuilder`: przełącznik `richText` tylko dla `text_long`, zapisuje flagę.

## Poza zakresem

- Short card i `CharacterDetails` — `text_long` tam nie występuje.
- Konfiguracja zestawu przycisków per pole.
- Migracja danych przy przełączaniu flagi.
