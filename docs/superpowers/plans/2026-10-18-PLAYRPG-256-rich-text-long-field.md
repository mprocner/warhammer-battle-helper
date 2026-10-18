# PLAYRPG-256 Rich Text Long Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MG może włączyć w polu `text_long` karty custom flagę `richText`; gracz dostaje wtedy edytor z pełnym paskiem formatowania z notatek, a toolbar/edytor żyją we wspólnym module `components/common/richText/`.

**Architecture:** Backend: policy bluemonday z `NoteService` wydzielona do `internal/sanitize` (`RichHTML`), plugin custom dostaje `SanitizeRichTexts` czyszczące tylko klucze `texts` pól z flagą, wołane w Create/Update/Clone postaci. Front: pliki toolbara notatek przeniesione do `common/richText/` (nazwy `rich-toolbar*` / `richText.toolbar.*`), nowy `RichTextEditor` (niekontrolowany TipTap z synchronizacją `value`) i `richTextConvert` (plain↔HTML przy odczycie, bez migracji). Kafelek z flagą zajmuje 4 wiersze siatki.

**Tech Stack:** Go (bluemonday, mongo-driver bson), React + TipTap 3 + i18next, Jest/RTL (CRA).

**Spec:** `docs/superpowers/specs/PLAYRPG-256.md`

## Global Constraints

- Praca na `main`, bez worktree. Przed każdym commitem sprawdź gałąź w tym samym poleceniu: `[ "$(git branch --show-current)" = main ] && git commit ...`. Commituj tylko pliki zadania — w drzewie leżą niezwiązane zmiany `warhammer-battle-helper-front/nginx.conf` i `package-lock.json`, nie dodawaj ich.
- Komentarze w kodzie wyłącznie po angielsku.
- Żadnych stringów w JSX — tylko `t('klucz')`, klucze w `locales/en/translation.json` i `locales/pl/translation.json` równolegle.
- Ikony tylko z `@mui/icons-material`; tooltipy tylko portalowe (już istnieją w toolbarze).
- Kolory karty: tło inputu `#fff9f0`, tekst `#3a2f1f`, ramka `#c4a882`, ramka focus `#7a5c42`.
- Flaga nazywa się `richText` (Go: `RichText bool`, `bson:"richText,omitempty" json:"richText,omitempty"`).
- Pusty dokument edytora zapisywany jako `''`, nie `<p></p>`.
- Testy frontu: `CI=true npm test -- --watchAll=false --testPathPattern=<nazwa>` z `warhammer-battle-helper-front/`. Gołe `npx jest` nie działa. Baseline fail: `App.test.js` (axios ESM) — nie regresja.
- Testy backendu: `go test ./internal/...` z `warhammer-battle-helper-backend/`.
- Każdy commit kończy się liniami:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj
  ```

---

### Task 1: Backend — wspólna policy `sanitize.RichHTML`

**Files:**
- Create: `warhammer-battle-helper-backend/internal/sanitize/richhtml.go`
- Move: `warhammer-battle-helper-backend/internal/service/note_html_policy_test.go` → `warhammer-battle-helper-backend/internal/sanitize/richhtml_test.go`
- Modify: `warhammer-battle-helper-backend/internal/service/NoteService.go:1-58` (importy, usunięcie regexów i policy), `:123`, `:275`

**Interfaces:**
- Produces: `func sanitize.RichHTML(s string) string` (pakiet `battle-helper/internal/sanitize`).

- [ ] **Step 1: Przenieś test i przepnij go na nowe API**

```bash
cd warhammer-battle-helper-backend
mkdir -p internal/sanitize
git mv internal/service/note_html_policy_test.go internal/sanitize/richhtml_test.go
perl -pi -e 's/^package service$/package sanitize/; s/func TestNoteHTMLPolicy/func TestRichHTML/; s/noteHTMLPolicy\.Sanitize\(/RichHTML(/; s/\(noteExtensions\.js\)/(richTextExtensions.js)/; s/for the note editor/for the rich-text editor/' internal/sanitize/richhtml_test.go
```

- [ ] **Step 2: Uruchom test — ma nie kompilować**

Run: `go test ./internal/sanitize/...`
Expected: FAIL — `undefined: RichHTML`

- [ ] **Step 3: Utwórz `internal/sanitize/richhtml.go`**

```go
// Package sanitize holds the HTML policy for user-authored rich text.
package sanitize

import (
	"regexp"

	"github.com/microcosm-cc/bluemonday"
)

// Rich text (notes, styled sheet fields) is stored as HTML and rendered by every participant's
// editor, so this policy is the only XSS boundary. Each regex is anchored: an unanchored one
// would accept any value that merely contains a valid fragment.
//
// Every mark and attribute the editor emits (RICH_TEXT_EXTENSIONS in
// warhammer-battle-helper-front/src/components/common/richText/richTextExtensions.js) must be
// allowed here, or the server strips it on save and the WS echo wipes the formatting.
//
// Keep fontSizeRe in sync with FONT_SIZE_MIN / FONT_SIZE_MAX in
// warhammer-battle-helper-front/src/components/common/richText/richTextFormatting.js.
var (
	colorRe     = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	fontSizeRe  = regexp.MustCompile(`^([89]|[1-6][0-9]|7[0-2])px$`)
	alignRe     = regexp.MustCompile(`^(left|center|right)$`)
	markColorRe = regexp.MustCompile(`^inherit$`) // Tiptap Highlight emits "color: inherit"
)

var richHTMLPolicy = newRichHTMLPolicy()

func newRichHTMLPolicy() *bluemonday.Policy {
	p := bluemonday.NewPolicy()
	p.AllowStandardAttributes()
	p.AllowElements(
		"b", "i", "u", "strong", "em", "s",
		"p", "br", "hr",
		"ul", "ol", "li",
		"h1", "h2", "h3",
		"blockquote", "pre", "code",
		"span", "mark", "a",
	)

	p.AllowStyles("color").Matching(colorRe).OnElements("span")
	p.AllowStyles("font-size").Matching(fontSizeRe).OnElements("span")
	p.AllowStyles("background-color").Matching(colorRe).OnElements("mark")
	p.AllowStyles("color").Matching(markColorRe).OnElements("mark")
	p.AllowAttrs("data-color").Matching(colorRe).OnElements("mark")
	p.AllowStyles("text-align").Matching(alignRe).OnElements("p", "h1", "h2", "h3")

	p.AllowAttrs("href", "target", "rel").OnElements("a")
	p.RequireParseableURLs(true)
	p.AllowURLSchemes("http", "https", "mailto")
	p.AddTargetBlankToFullyQualifiedLinks(true)
	p.RequireNoReferrerOnLinks(true)
	return p
}

// RichHTML returns s with everything the rich-text policy does not allow removed.
func RichHTML(s string) string {
	return richHTMLPolicy.Sanitize(s)
}
```

- [ ] **Step 4: Przepnij `NoteService.go`**

W `internal/service/NoteService.go`:
1. Usuń cały blok od komentarza `// Note bodies are stored as HTML…` (linia ~19) do końca funkcji `newNoteHTMLPolicy` (linia ~58) — regexy, `var noteHTMLPolicy`, funkcję.
2. Zamień oba wywołania:
   ```bash
   perl -pi -e 's/noteHTMLPolicy\.Sanitize\(/sanitize.RichHTML(/g' internal/service/NoteService.go
   ```
3. W importach usuń `"regexp"` i `"github.com/microcosm-cc/bluemonday"`, dodaj `"battle-helper/internal/sanitize"` (po `"battle-helper/internal/repository"`).

- [ ] **Step 5: Testy i build**

Run: `go build ./... && go vet ./internal/sanitize/... ./internal/service/... && go test ./internal/sanitize/... ./internal/service/...`
Expected: PASS, `TestRichHTML` z wszystkimi podtestami zielony.

- [ ] **Step 6: Commit**

```bash
cd ..
[ "$(git branch --show-current)" = main ] && git add warhammer-battle-helper-backend/internal/sanitize warhammer-battle-helper-backend/internal/service/NoteService.go && git status --short warhammer-battle-helper-backend && git commit -m "refactor: PLAYRPG-256 move note HTML policy to internal/sanitize

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 2: Backend — flaga `RichText` i `SanitizeRichTexts` w zapisie postaci

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` (`FieldDef`, po linii `TextSize …`)
- Create: `warhammer-battle-helper-backend/internal/systems/custom/richtext.go`
- Create: `warhammer-battle-helper-backend/internal/systems/custom/richtext_test.go`
- Modify: `warhammer-battle-helper-backend/internal/http/CharacterHandler.go` (nowy helper + 3 wywołania: Create ~linia 198, Update ~linia 280, Clone ~linia 645)

**Interfaces:**
- Consumes: `sanitize.RichHTML(s string) string` (Task 1); `decodeStats`, `flattenFields` (istniejące w `custom/plugin.go`).
- Produces: `models.FieldDef.RichText bool` (json `richText`) — front czyta `field.richText`.
- Produces: `func (p *Plugin) SanitizeRichTexts(raw bson.Raw, tmpl *models.SystemTemplate) (bson.Raw, error)`.

- [ ] **Step 1: Dodaj pole do `FieldDef`**

W `internal/models/SystemTemplate.go`, bezpośrednio pod linią `TextSize  string ...` (blok label-only) wstaw pustą linię i:

```go
	// RichText turns a text_long field into a styled editor (PLAYRPG-256); its value in
	// Stats.Texts is then sanitized HTML instead of plain text. Ignored on every other type.
	// Off by default, so omitempty is safe: an absent key reads as "plain text".
	RichText bool `bson:"richText,omitempty" json:"richText,omitempty"`
```

- [ ] **Step 2: Napisz testy `internal/systems/custom/richtext_test.go`**

```go
package custom

import (
	"bytes"
	"testing"

	"battle-helper/internal/models"

	"go.mongodb.org/mongo-driver/bson"
)

func richTextTemplate() *models.SystemTemplate {
	return &models.SystemTemplate{Sections: []models.SectionDef{
		{ID: "s", Columns: 2, Fields: []models.FieldDef{
			{Key: "bio", Type: "text_long", RichText: true},
			{Key: "plain", Type: "text_long"},
			{Key: "short", Type: "text_short", RichText: true},
			{Key: "nested", Type: "section", Section: &models.SectionDef{ID: "in", Columns: 1, Fields: []models.FieldDef{
				{Key: "deep", Type: "text_long", RichText: true},
			}}},
		}},
	}}
}

func statsWithTexts(t *testing.T, texts map[string]string) bson.Raw {
	t.Helper()
	raw, err := bson.Marshal(Stats{
		Attributes: map[string]AttrValue{},
		Skills:     map[string]AttrValue{},
		Texts:      texts,
	})
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func sanitizedTexts(t *testing.T, raw bson.Raw, tmpl *models.SystemTemplate) map[string]string {
	t.Helper()
	out, err := New().SanitizeRichTexts(raw, tmpl)
	if err != nil {
		t.Fatal(err)
	}
	s, err := decodeStats(out)
	if err != nil {
		t.Fatal(err)
	}
	return s.Texts
}

func TestSanitizeRichTextsCleansFlaggedField(t *testing.T) {
	raw := statsWithTexts(t, map[string]string{"bio": `<p onclick="alert(1)">t<img src=x onerror="alert(1)"></p>`})
	if got := sanitizedTexts(t, raw, richTextTemplate())["bio"]; got != `<p>t</p>` {
		t.Errorf("bio = %q, want %q", got, `<p>t</p>`)
	}
}

func TestSanitizeRichTextsKeepsAllowedFormatting(t *testing.T) {
	in := `<p style="text-align: center"><strong>a</strong> <span style="color: #a8322d">b</span></p>`
	raw := statsWithTexts(t, map[string]string{"bio": in})
	if got := sanitizedTexts(t, raw, richTextTemplate())["bio"]; got != in {
		t.Errorf("bio = %q, want unchanged %q", got, in)
	}
}

// The policy escapes "<" and "&"; running it over a plain field would corrupt what the player typed.
func TestSanitizeRichTextsLeavesPlainFieldsAlone(t *testing.T) {
	raw := statsWithTexts(t, map[string]string{
		"plain": `HP < 10 & stun`,
		"short": `<b>x</b> & y`, // RichText on a non-text_long type is ignored
	})
	got := sanitizedTexts(t, raw, richTextTemplate())
	if got["plain"] != `HP < 10 & stun` {
		t.Errorf("plain = %q", got["plain"])
	}
	if got["short"] != `<b>x</b> & y` {
		t.Errorf("short = %q", got["short"])
	}
}

func TestSanitizeRichTextsReachesNestedSection(t *testing.T) {
	raw := statsWithTexts(t, map[string]string{"deep": `<p>x<script>alert(1)</script></p>`})
	if got := sanitizedTexts(t, raw, richTextTemplate())["deep"]; got != `<p>x</p>` {
		t.Errorf("deep = %q, want %q", got, `<p>x</p>`)
	}
}

func TestSanitizeRichTextsLeavesAbsentKeyAbsent(t *testing.T) {
	raw := statsWithTexts(t, map[string]string{"plain": "a"})
	if _, ok := sanitizedTexts(t, raw, richTextTemplate())["bio"]; ok {
		t.Error("bio appeared although the character never had it")
	}
}

func TestSanitizeRichTextsWithoutTemplateReturnsInput(t *testing.T) {
	raw := statsWithTexts(t, map[string]string{"bio": `<p onclick="x()">t</p>`})
	out, err := New().SanitizeRichTexts(raw, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(out, raw) {
		t.Error("nil template must return the stats untouched")
	}
}
```

- [ ] **Step 3: Uruchom — ma nie kompilować**

Run: `cd warhammer-battle-helper-backend && go test ./internal/systems/custom/ -run SanitizeRichTexts`
Expected: FAIL — `New().SanitizeRichTexts undefined`

- [ ] **Step 4: Utwórz `internal/systems/custom/richtext.go`**

```go
package custom

import (
	"battle-helper/internal/models"
	"battle-helper/internal/sanitize"

	"go.mongodb.org/mongo-driver/bson"
)

// SanitizeRichTexts runs every text_long field with RichText through the shared rich-text HTML
// policy (PLAYRPG-256). Only those keys are touched: the policy escapes "<" and "&", which would
// corrupt the plain text every other text field stores. When nothing changes, the input is
// returned as is, so a save with clean HTML costs no re-encode.
//
// Like SeedDefaults it hangs off *Plugin rather than the GameSystem interface: only the custom
// system has a template saying which fields hold HTML.
func (p *Plugin) SanitizeRichTexts(raw bson.Raw, tmpl *models.SystemTemplate) (bson.Raw, error) {
	if tmpl == nil {
		return raw, nil
	}
	s, err := decodeStats(raw)
	if err != nil {
		return raw, err
	}
	changed := false
	for _, section := range tmpl.Sections {
		for _, field := range flattenFields(section.Fields) {
			if field.Type != "text_long" || !field.RichText {
				continue
			}
			value, ok := s.Texts[field.Key]
			if !ok {
				continue
			}
			if clean := sanitize.RichHTML(value); clean != value {
				s.Texts[field.Key] = clean
				changed = true
			}
		}
	}
	if !changed {
		return raw, nil
	}
	out, err := bson.Marshal(s)
	if err != nil {
		return raw, err
	}
	return out, nil
}
```

- [ ] **Step 5: Testy przechodzą**

Run: `go test ./internal/systems/custom/ -run SanitizeRichTexts -v`
Expected: PASS (6 testów).

- [ ] **Step 6: Helper w `CharacterHandler.go`**

Pod funkcją `defaultStatsFor` (koniec ~linia 75) dodaj:

```go
// sanitizeRichTexts cleans the HTML of a custom game's styled text fields (PLAYRPG-256). Every
// path that writes client- or copy-supplied stats goes through it; other systems and games
// without a template pass through untouched. A failure keeps the stats as they are, like
// SeedDefaults: a document that cannot be decoded also fails ComputeDerived, and the client
// renders these fields only through the editor's schema, which drops unknown markup.
func sanitizeRichTexts(sys systems.GameSystem, game *models.Game, raw bson.Raw, where string) bson.Raw {
	customPlugin, ok := sys.(*custom.Plugin)
	if !ok || game == nil || game.CustomSystemTemplate == nil {
		return raw
	}
	clean, err := customPlugin.SanitizeRichTexts(raw, game.CustomSystemTemplate)
	if err != nil {
		log.Printf("%s: SanitizeRichTexts failed for game %s: %v", where, game.ID.Hex(), err)
		return raw
	}
	return clean
}
```

- [ ] **Step 7: Wywołania w trzech handlerach**

1. `CreateGameCharacter` — w bloku `if sys, sysErr := registry.Get(gameSystem); sysErr == nil {`, tuż przed komentarzem `// Run derived-stat computation`:
   ```go
   		statsRaw = sanitizeRichTexts(sys, game, statsRaw, "CreateGameCharacter")
   ```
2. `UpdateGameCharacter` — w bloku `if sys, sysErr := registry.Get(existingCharacter.GameSystem); sysErr == nil {`, jako pierwsza linia bloku (przed `if derived, derivedErr := ...`):
   ```go
   		statsRaw = sanitizeRichTexts(sys, game, statsRaw, "UpdateGameCharacter")
   ```
3. `CloneGameCharacter` — w pętli, tuż przed komentarzem `// Recompute derived stats for the clone`:
   ```go
   		clone.Stats = sanitizeRichTexts(sys, game, clone.Stats, "CloneGameCharacter")
   ```

- [ ] **Step 8: Build + cały backend**

Run: `go build ./... && go vet ./internal/http/... ./internal/systems/custom/... && go test ./internal/...`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd ..
[ "$(git branch --show-current)" = main ] && git add warhammer-battle-helper-backend/internal/models/SystemTemplate.go warhammer-battle-helper-backend/internal/systems/custom/richtext.go warhammer-battle-helper-backend/internal/systems/custom/richtext_test.go warhammer-battle-helper-backend/internal/http/CharacterHandler.go && git commit -m "feat: PLAYRPG-256 richText flag and sanitized styled texts on character save

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 3: Front — przeniesienie toolbara notatek do `common/richText/`

Czysty refaktor: zachowanie notatek bez zmian, istniejące testy muszą przejść.

**Files:**
- Move: `src/components/tabs/notes/noteExtensions.js` → `src/components/common/richText/richTextExtensions.js`
- Move: `src/components/tabs/notes/noteFormatting.js` (+`.test.js`) → `src/components/common/richText/richTextFormatting.js` (+`.test.js`)
- Move: `src/components/tabs/notes/NoteToolbar.jsx` (+`.test.jsx`) → `src/components/common/richText/RichTextToolbar.jsx` (+`.test.jsx`)
- Move: `src/components/tabs/notes/toolbar/` → `src/components/common/richText/toolbar/`
- Move: `src/components/tabs/notes/testUtils/` → `src/components/common/richText/testUtils/`
- Create: `src/components/common/richText/RichText.css`
- Modify: `src/components/tabs/NotesTab.css` (usunięcie stylów toolbara i typografii)
- Modify: `src/components/tabs/notes/NoteEditorModal.jsx:5-6,343,346`
- Modify: `src/components/tabs/notes/NoteEditorModal.{autosaveEcho,saveStatus,toolbarRefresh}.test.jsx` (ścieżka `jest.mock`)
- Modify: `src/locales/en/translation.json`, `src/locales/pl/translation.json` (`notes.toolbar` → `richText.toolbar`)
- Modify: `warhammer-battle-helper-backend/internal/sanitize/richhtml.go` — bez zmian (ścieżki w komentarzu już wskazują nowe pliki).

**Interfaces:**
- Produces: `RICH_TEXT_EXTENSIONS` (`common/richText/richTextExtensions.js`), `RichTextToolbar` (default export, prop `editor`), klasy CSS `rich-toolbar*`, `.rich-text__content .tiptap …`, klucze `richText.toolbar.*`.

- [ ] **Step 1: `git mv`** (z `warhammer-battle-helper-front/src`)

```bash
cd warhammer-battle-helper-front/src
mkdir -p components/common/richText
git mv components/tabs/notes/noteExtensions.js components/common/richText/richTextExtensions.js
git mv components/tabs/notes/noteFormatting.js components/common/richText/richTextFormatting.js
git mv components/tabs/notes/noteFormatting.test.js components/common/richText/richTextFormatting.test.js
git mv components/tabs/notes/NoteToolbar.jsx components/common/richText/RichTextToolbar.jsx
git mv components/tabs/notes/NoteToolbar.test.jsx components/common/richText/RichTextToolbar.test.jsx
git mv components/tabs/notes/toolbar components/common/richText/toolbar
git mv components/tabs/notes/testUtils components/common/richText/testUtils
```

- [ ] **Step 2: Mechaniczne zmiany nazw w przeniesionych plikach**

```bash
find components/common/richText -type f \( -name '*.js' -o -name '*.jsx' \) -exec perl -pi -e '
  s/note-toolbar/rich-toolbar/g;
  s/notes\.toolbar\./richText.toolbar./g;
  s/noteFormatting/richTextFormatting/g;
  s/NOTE_EXTENSIONS/RICH_TEXT_EXTENSIONS/g;
  s/NoteToolbar/RichTextToolbar/g;
' {} +
grep -rn "note" components/common/richText
```

Przejrzyj wynik `grep` i popraw ręcznie pozostałe odwołania:
- `richTextExtensions.js` — komentarz nad tablicą zamień na:
  ```js
  // Every mark and attribute these extensions emit must be allowed by the rich-text policy in
  // warhammer-battle-helper-backend/internal/sanitize/richhtml.go, or the server strips it on
  // save and the WS echo wipes the formatting.
  ```
- `richTextFormatting.js:10` — `// Base size of .rich-text__content .tiptap in RichText.css.`
- `richTextFormatting.js` — jeśli komentarz przy `FONT_SIZE_MIN/MAX` wskazuje `NoteService.go`/`noteFontSizeRe`, zmień na `internal/sanitize/richhtml.go` / `fontSizeRe`.
- `testUtils/fakeEditor.js` — w komentarzu „toolbar tests” zostaje; zdanie „(which CRA's Jest cannot load anyway)” zostaw do Task 4 (tam zmieniamy konfigurację Jest).
- Słowo „note”/„notes” w komentarzach opisujących zachowanie ogólne (np. „the note keeps following the editor's own colour” w `RichTextToolbar.jsx`) zamień na „the text”.

- [ ] **Step 3: Notatki importują ze wspólnego modułu**

`components/tabs/notes/NoteEditorModal.jsx`:
```js
import { RICH_TEXT_EXTENSIONS } from '../../common/richText/richTextExtensions';
import RichTextToolbar from '../../common/richText/RichTextToolbar';
```
(zamiast importów `NOTE_EXTENSIONS` i `NoteToolbar`), `extensions: RICH_TEXT_EXTENSIONS`, `<RichTextToolbar editor={editor} />`, a kontener treści:
```jsx
<div className="note-editor__content rich-text__content">
```

Testy modala:
```bash
perl -pi -e "s#jest\.mock\('\./noteExtensions', \(\) => \(\{ NOTE_EXTENSIONS: \[\] \}\)\);#jest.mock('../../common/richText/richTextExtensions', () => ({ RICH_TEXT_EXTENSIONS: [] }));#" components/tabs/notes/NoteEditorModal.*.test.jsx
grep -n "jest.mock" components/tabs/notes/NoteEditorModal.*.test.jsx
```
Expected: trzy linie z nową ścieżką.

- [ ] **Step 4: CSS — wydziel `RichText.css`**

W `components/tabs/NotesTab.css` sprawdź granice: `grep -n "/\* Toolbar \*/\|note-toolbar__link-actions {\|/\* Editor content\|\.note-editor__content \.tiptap {\|\.note-editor__content \.tiptap hr\|::-webkit-scrollbar {" components/tabs/NotesTab.css`. Na dziś: toolbar to linie 380 (`/* Toolbar */`) – 611 (pusta linia po `.note-toolbar__link-actions`), typografia to 622 (`.note-editor__content .tiptap {`) – 689 (pusta linia po regule `hr`). Jeśli liczby się różnią, użyj aktualnych.

```bash
T=components/tabs/NotesTab.css
R=components/common/richText/RichText.css
{
  echo '/* Shared rich-text editor (PLAYRPG-256): notes and styled sheet fields. */'
  echo
  sed -n '380,611p' $T | perl -pe 's/note-toolbar/rich-toolbar/g'
  echo '/* Editor typography. The container (border, size, scroll) belongs to each host. */'
  sed -n '622,689p' $T | perl -pe 's/\.note-editor__content \.tiptap/.rich-text__content .tiptap/g'
} > $R
sed -i '' '622,689d;380,611d' $T
```

Następnie ręcznie w `RichText.css`:
- w regule `.rich-text__content .tiptap { … }` usuń linię `min-height: 110px;` (to wymiar okna notatki);
- na początku sekcji toolbara, w regule `.rich-toolbar { … }` dopisz `margin: 0;` i `min-width: 0;` (Task 4 zamienia korzeń na `<fieldset>`, który ma domyślny margines i `min-inline-size: min-content`).

W `NotesTab.css`, bezpośrednio po regule `.note-editor__content { … }` dodaj:
```css
.note-editor__content .tiptap {
  min-height: 110px;
}
```

Import CSS: na górze `components/common/richText/RichTextToolbar.jsx` dodaj `import './RichText.css';` (toolbar renderuje każdy host, więc style typografii też przyjeżdżają z nim).

- [ ] **Step 5: i18n — przenieś blok**

W `src/locales/en/translation.json` i `src/locales/pl/translation.json` (Edit, ręcznie — skrypt `JSON.stringify` przeformatowałby jednolinijkowy `licenses`):
1. Wytnij z obiektu `notes` cały klucz `"toolbar": { … }` (en: zaczyna się w linii ~782, kończy po `colors`), poprawiając przecinek poprzedniego klucza.
2. Dodaj nowy klucz najwyższego poziomu tuż po zamknięciu obiektu `notes`:
   ```json
   "richText": {
     "toolbar": { …dokładnie wycięta zawartość… }
   },
   ```

Weryfikacja:
```bash
for l in en pl; do node -e 'const j=require(process.argv[1]);if(j.notes.toolbar||!j.richText.toolbar.bold||!j.richText.toolbar.colors.red)throw new Error(process.argv[1]);console.log("ok")' ./locales/$l/translation.json; done
grep -rn "notes\.toolbar\|note-toolbar\|noteFormatting\|noteExtensions\|NoteToolbar\|NOTE_EXTENSIONS" . ../../warhammer-battle-helper-backend/internal
```
Expected: `ok` ×2, `grep` pusty.

- [ ] **Step 6: Testy notatek i toolbara**

Run (z `warhammer-battle-helper-front/`): `CI=true npm test -- --watchAll=false --testPathPattern="(richText|notes|NotesTab)"`
Expected: PASS wszystkie (te same liczby testów co przed przeniesieniem).

- [ ] **Step 7: Commit**

```bash
cd ../..
[ "$(git branch --show-current)" = main ] && git add -A warhammer-battle-helper-front/src/components/common/richText warhammer-battle-helper-front/src/components/tabs/notes warhammer-battle-helper-front/src/components/tabs/NotesTab.css warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json && git commit -m "refactor: PLAYRPG-256 extract note toolbar into common/richText

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 4: Front — Jest ładuje TipTap, `richTextConvert`, `disabled` toolbara, `RichTextEditor`

**Files:**
- Modify: `warhammer-battle-helper-front/package.json` (klucz `jest`)
- Create: `src/components/common/richText/richTextConvert.js` + `richTextConvert.test.js`
- Modify: `src/components/common/richText/RichTextToolbar.jsx` (prop `disabled`, korzeń `<fieldset>`) + `RichTextToolbar.test.jsx`
- Modify: `src/components/common/richText/RichText.css` (styl stanu wyłączonego)
- Modify: `src/components/common/richText/testUtils/fakeEditor.js` (komentarz)
- Create: `src/components/common/richText/RichTextEditor.jsx` + `RichTextEditor.test.jsx`

**Interfaces:**
- Consumes: `RICH_TEXT_EXTENSIONS`, `RichTextToolbar` (Task 3).
- Produces: `plainToHtml(text: string): string`, `htmlToPlain(html: string): string`, `looksLikeHtml(s: string): boolean` (named exports z `richTextConvert.js`).
- Produces: `<RichTextToolbar editor disabled={bool} />`.
- Produces: `<RichTextEditor value: string onChange?: (html: string) => void editable?: bool className?: string />` (default export), root `div.rich-text`, treść w `div.rich-text__content`.

- [ ] **Step 1: Konfiguracja Jest**

Bez tego sam import `@tiptap/react` w teście kończy się `SyntaxError: Unexpected token 'export'` (ESM z `prosemirror-*`), a od Task 5 `CustomSheetBody` — importowany przez ~30 plików testów — importuje edytor. Sprawdzone sondą: z tym wzorcem prawdziwy TipTap działa w jsdom.

W `package.json` dodaj klucz najwyższego poziomu (po `browserslist` lub na końcu):
```json
"jest": {
  "transformIgnorePatterns": [
    "[/\\\\]node_modules[/\\\\](?!(@tiptap|prosemirror-[a-z-]+|orderedmap|rope-sequence|w3c-keyname|linkifyjs)[/\\\\]).+\\.(js|jsx|mjs|cjs|ts|tsx)$",
    "^.+\\.module\\.(css|sass|scss)$"
  ]
}
```
(Drugi wzorzec to domyślny wpis CRA — override zastępuje całą tablicę, więc trzeba go powtórzyć.)

W `testUtils/fakeEditor.js` zmień w komentarzu „without a ProseMirror instance (which CRA's Jest cannot load anyway)” na „without a ProseMirror instance, so toolbar tests stay fast and deterministic”.

- [ ] **Step 2: Test `richTextConvert.test.js`**

```js
import { plainToHtml, htmlToPlain, looksLikeHtml } from './richTextConvert';

describe('plainToHtml', () => {
  test('empty stays empty', () => {
    expect(plainToHtml('')).toBe('');
    expect(plainToHtml(undefined)).toBe('');
  });
  test('each line becomes a paragraph, blank lines included', () => {
    expect(plainToHtml('one\n\nthree')).toBe('<p>one</p><p></p><p>three</p>');
    expect(plainToHtml('a\r\nb')).toBe('<p>a</p><p>b</p>');
  });
  test('markup characters are escaped, not interpreted', () => {
    expect(plainToHtml('a < b & "c" <script>')).toBe('<p>a &lt; b &amp; &quot;c&quot; &lt;script&gt;</p>');
  });
});

describe('htmlToPlain', () => {
  test('empty stays empty', () => {
    expect(htmlToPlain('')).toBe('');
  });
  test('paragraphs and headings become lines', () => {
    expect(htmlToPlain('<h2>Title</h2><p>one</p><p></p><p>two</p>')).toBe('Title\none\n\ntwo');
  });
  test('a hard break becomes a newline and marks disappear', () => {
    expect(htmlToPlain('<p>a<br>b <strong>c</strong></p>')).toBe('a\nb c');
  });
  test('list items and quotes become lines', () => {
    expect(htmlToPlain('<ul><li><p>x</p></li><li><p>y</p></li></ul><blockquote><p>q</p></blockquote>'))
      .toBe('x\ny\nq');
  });
  test('entities are decoded', () => {
    expect(htmlToPlain('<p>a &lt; b &amp; c</p>')).toBe('a < b & c');
  });
  test('a divider is dropped', () => {
    expect(htmlToPlain('<p>a</p><hr><p>b</p>')).toBe('a\nb');
  });
});

describe('looksLikeHtml', () => {
  test.each([
    ['<p>x</p>', true],
    ['  <h1>t</h1>', true],
    ['<ul><li><p>x</p></li></ul>', true],
    ['<blockquote><p>q</p></blockquote>', true],
    ['', false],
    ['plain text', false],
    ['a < b', false],
    ['<3 you', false],
    ['<pizza>', false],
  ])('%p → %p', (input, expected) => {
    expect(looksLikeHtml(input)).toBe(expected);
  });
});

test('plain text survives a round trip', () => {
  const text = 'one\n\na < b & c';
  expect(htmlToPlain(plainToHtml(text))).toBe(text);
});
```

Run: `CI=true npm test -- --watchAll=false --testPathPattern=richTextConvert`
Expected: FAIL — `Cannot find module './richTextConvert'`

- [ ] **Step 3: `richTextConvert.js`**

```js
// Read-time conversion between the two formats a long text field can hold (PLAYRPG-256). The
// template flag decides how a field renders, but the stored value keeps whatever format it was
// last saved in until the player edits it — so flipping the flag never needs a data migration.

const escapeHtml = (s) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Each line becomes its own paragraph, blank lines included, so the line breaks a player typed
// into the plain textarea survive the switch to the editor.
export function plainToHtml(text) {
  if (!text) return '';
  return text.split(/\r?\n/).map((line) => `<p>${escapeHtml(line)}</p>`).join('');
}

// Elements whose text is one line of the plain version. Lists and quotes are containers: their
// lines come from the paragraphs (or bare text) inside them.
const LINE_ELEMENTS = new Set(['P', 'H1', 'H2', 'H3', 'PRE']);

const inlineText = (node) => {
  let out = '';
  node.childNodes.forEach((child) => {
    if (child.nodeName === 'BR') out += '\n';
    else if (child.nodeType === Node.TEXT_NODE) out += child.textContent;
    else out += inlineText(child);
  });
  return out;
};

const collectLines = (node, lines) => {
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent.trim()) lines.push(child.textContent);
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE || child.nodeName === 'HR') return;
    if (LINE_ELEMENTS.has(child.nodeName)) lines.push(inlineText(child));
    else collectLines(child, lines);
  });
};

// Parsed by DOMParser, which builds an inert document: nothing in it loads or runs.
export function htmlToPlain(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const lines = [];
  collectLines(doc.body, lines);
  return lines.join('\n');
}

// The editor always wraps content in a block element, so its output starts with one. Plain text
// that happens to start with "<" ("<3", "<pizza>") does not match a block tag.
const BLOCK_START = /^\s*<(p|h[1-3]|ul|ol|li|blockquote|pre|hr)[\s>/]/i;

export function looksLikeHtml(s) {
  return !!s && BLOCK_START.test(s);
}
```

Run: `CI=true npm test -- --watchAll=false --testPathPattern=richTextConvert`
Expected: PASS.

- [ ] **Step 4: Test `disabled` toolbara**

W `RichTextToolbar.test.jsx` dopisz (importy `screen`, `within` z `@testing-library/react`, jeśli ich brak):

```jsx
test('a disabled toolbar disables every control and opens no popover', () => {
  const editor = createFakeEditor();
  render(<RichTextToolbar editor={editor} disabled />);
  const toolbar = screen.getByRole('toolbar');
  within(toolbar).getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
  expect(within(toolbar).getByRole('combobox')).toBeDisabled();
  expect(within(toolbar).getByRole('textbox')).toBeDisabled();
});

test('an enabled toolbar keeps its controls enabled', () => {
  render(<RichTextToolbar editor={createFakeEditor()} />);
  within(screen.getByRole('toolbar')).getAllByRole('button').forEach((b) => expect(b).toBeEnabled());
});
```

Run: `CI=true npm test -- --watchAll=false --testPathPattern=RichTextToolbar`
Expected: FAIL — pierwszy test (przyciski nie są disabled).

- [ ] **Step 5: Implementacja `disabled`**

W `RichTextToolbar.jsx`: sygnatura `const RichTextToolbar = ({ editor, disabled = false }) => {`, a korzeń:

```jsx
    // A disabled fieldset disables every control inside it natively — buttons, the heading
    // select, the size input — so no control needs a disabled prop of its own, and a disabled
    // button fires no click, so no popover can open.
    <fieldset className="rich-toolbar" role="toolbar" aria-label={t('richText.toolbar.label')} disabled={disabled}>
      …bez zmian…
    </fieldset>
```

W `RichText.css` dopisz pod regułą `.rich-toolbar__btn--active`:
```css
.rich-toolbar:disabled .rich-toolbar__btn,
.rich-toolbar:disabled .rich-toolbar__heading,
.rich-toolbar:disabled .rich-toolbar__size-input,
.rich-toolbar:disabled .rich-toolbar__size-toggle {
  cursor: default;
  opacity: 0.55;
}

.rich-toolbar:disabled .rich-toolbar__btn:hover {
  background: none;
  border-color: transparent;
}
```

Run: `CI=true npm test -- --watchAll=false --testPathPattern=RichTextToolbar`
Expected: PASS.

- [ ] **Step 6: Test `RichTextEditor.test.jsx`**

```jsx
/* eslint-disable testing-library/no-node-access, testing-library/no-container */
import React from 'react';
import { render, act, screen, within } from '@testing-library/react';
import '../../../i18n';
import RichTextEditor from './RichTextEditor';

// The real Tiptap editor runs in jsdom (package.json transformIgnorePatterns). Tiptap hangs the
// editor instance on its DOM node, which is the handle these tests drive it through.
const editorIn = (container) => container.querySelector('.tiptap').editor;

test('renders the value with its formatting', () => {
  const { container } = render(<RichTextEditor value="<p>Ala <strong>ma</strong></p>" onChange={jest.fn()} />);
  expect(container.querySelector('.rich-text__content strong').textContent).toBe('ma');
});

test('a new value from outside replaces the content without reporting a change', () => {
  const onChange = jest.fn();
  const { container, rerender } = render(<RichTextEditor value="<p>one</p>" onChange={onChange} />);
  rerender(<RichTextEditor value="<p>two</p>" onChange={onChange} />);
  expect(container.querySelector('.tiptap').textContent).toBe('two');
  expect(onChange).not.toHaveBeenCalled();
});

test('an edit reports the new HTML', () => {
  const onChange = jest.fn();
  const { container } = render(<RichTextEditor value="<p>a</p>" onChange={onChange} />);
  act(() => { editorIn(container).commands.insertContent('b'); });
  expect(onChange).toHaveBeenLastCalledWith(expect.stringMatching(/^<p>.*b.*<\/p>$/));
});

test('clearing the editor reports an empty string, not an empty paragraph', () => {
  const onChange = jest.fn();
  const { container } = render(<RichTextEditor value="<p>a</p>" onChange={onChange} />);
  act(() => { editorIn(container).commands.clearContent(true); });
  expect(onChange).toHaveBeenLastCalledWith('');
});

test('the echo of its own edit does not reset the editor', () => {
  const { container, rerender } = render(<RichTextEditor value="<p>a</p>" onChange={() => {}} />);
  const editor = editorIn(container);
  act(() => { editor.commands.insertContent('b'); });
  const html = editor.getHTML();
  const setContent = jest.spyOn(editor.commands, 'setContent');
  rerender(<RichTextEditor value={html} onChange={() => {}} />);
  expect(setContent).not.toHaveBeenCalled();
});

test('a read-only editor cannot be edited and disables its toolbar', () => {
  const { container } = render(<RichTextEditor value="<p>a</p>" editable={false} />);
  expect(editorIn(container).isEditable).toBe(false);
  within(screen.getByRole('toolbar')).getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
});

test('toggling editability is not an edit', () => {
  const onChange = jest.fn();
  const { container, rerender } = render(<RichTextEditor value="<p>a</p>" onChange={onChange} editable={false} />);
  rerender(<RichTextEditor value="<p>a</p>" onChange={onChange} editable />);
  expect(editorIn(container).isEditable).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
});
```

Run: `CI=true npm test -- --watchAll=false --testPathPattern=RichTextEditor`
Expected: FAIL — `Cannot find module './RichTextEditor'`

- [ ] **Step 7: `RichTextEditor.jsx`**

```jsx
import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { RICH_TEXT_EXTENSIONS } from './richTextExtensions';
import RichTextToolbar from './RichTextToolbar';

// A self-contained styled text box: the shared formatting toolbar over a Tiptap editor. The
// editor is uncontrolled, so `value` is pushed into it only when it differs from what the
// editor already holds — otherwise the echo of every keystroke would reset the caret.
const RichTextEditor = ({ value = '', onChange, editable = true, className = '' }) => {
  const [, forceUpdate] = useState(0);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const editor = useEditor({
    extensions: RICH_TEXT_EXTENSIONS,
    content: value,
    editable,
    // An empty document is stored as '', not '<p></p>', so a cleared field leaves nothing behind.
    onUpdate: ({ editor: ed }) => onChangeRef.current?.(ed.isEmpty ? '' : ed.getHTML()),
    // Stored marks and node attrs applied on a collapsed caret fire neither a selection update
    // nor a doc update; re-rendering on every transaction keeps the toolbar's state current.
    onTransaction: () => forceUpdate((n) => n + 1),
  });

  // emitUpdate=false: switching editability is not an edit and must not trigger a save.
  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable, false);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    const next = value || '';
    if (next === (editor.isEmpty ? '' : editor.getHTML())) return;
    // Restore the caret only when the editor had focus — otherwise we would steal it.
    const hadFocus = editor.isFocused;
    const { from } = editor.state.selection;
    editor.commands.setContent(next, { emitUpdate: false });
    if (hadFocus) {
      // The incoming version can be shorter; the position must fit the new document.
      editor.commands.setTextSelection(Math.min(from, editor.state.doc.content.size));
    }
  }, [editor, value]);

  return (
    <div className={`rich-text ${className}`.trim()}>
      <RichTextToolbar editor={editor} disabled={!editable} />
      <div className="rich-text__content">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default RichTextEditor;
```

Run: `CI=true npm test -- --watchAll=false --testPathPattern="(RichTextEditor|RichTextToolbar|richText|notes)"`
Expected: PASS.

- [ ] **Step 8: Cały suite — override Jest niczego nie zepsuł**

Run: `CI=true npm test -- --watchAll=false 2>&1 | tail -15`
Expected: jedyny fail to `App.test.js` (baseline).

- [ ] **Step 9: Commit**

```bash
cd ..
[ "$(git branch --show-current)" = main ] && git add warhammer-battle-helper-front/package.json warhammer-battle-helper-front/src/components/common/richText && git commit -m "feat: PLAYRPG-256 RichTextEditor, plain/HTML conversion, disabled toolbar

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 5: Front — pole `text_long` ze stylami na karcie

**Files:**
- Modify: `src/systems/custom/CustomSheetBody.jsx:1-21` (importy), `:360-369` (gałąź `text_long`)
- Modify: `src/systems/custom/fieldRowSpan.js`
- Modify: `src/systems/custom/fieldRowSpan.test.js`
- Modify: `src/style.css` (po regule `.custom-sheet__cell.custom-sheet__cell--rows-2` ~7889 i po regule `.custom-sheet__cell--rows-2 > .custom-sheet__tile--text > .custom-sheet__tile-value` ~8370)
- Create: `src/systems/custom/CustomSheetBody.richText.test.jsx`

**Interfaces:**
- Consumes: `RichTextEditor`, `plainToHtml`, `htmlToPlain`, `looksLikeHtml` (Task 4); `field.richText` (Task 2); `onChange.text(key, value)` (istniejące).
- Produces: komórka `custom-sheet__cell--rows-4` dla `text_long` z `richText`.

- [ ] **Step 1: Testy `fieldRowSpan`**

W `fieldRowSpan.test.js` dopisz:
```js
test('a styled long text spans four rows', () => {
  expect(fieldRowSpan({ key: 'bio', type: 'text_long', richText: true })).toBe(4);
  expect(fieldRowSpan({ key: 'bio', type: 'text_long', richText: false })).toBe(2);
});
```

- [ ] **Step 2: Testy karty `CustomSheetBody.richText.test.jsx`**

```jsx
/* eslint-disable testing-library/no-node-access, testing-library/no-container */
import React from 'react';
import { render, act, screen, within } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

const sectionsWith = (field) => [{ id: 's', title: '', columns: 2, fields: [field] }];
const rich = { key: 'bio', type: 'text_long', label: 'Bio', richText: true };
const plain = { key: 'bio', type: 'text_long', label: 'Bio' };

test('a styled long text shows the toolbar and the stored HTML, no textarea', () => {
  const { container } = render(
    <CustomSheetBody sections={sectionsWith(rich)} values={{ texts: { bio: '<p>Hi <strong>there</strong></p>' } }} onChange={{ text: jest.fn() }} />,
  );
  expect(screen.getByRole('toolbar')).toBeInTheDocument();
  expect(container.querySelector('textarea')).toBeNull();
  expect(container.querySelector('.custom-sheet__rich-text strong').textContent).toBe('there');
  expect(container.querySelector('.custom-sheet__cell--rows-4')).not.toBeNull();
});

test('plain text saved before the flag was on opens as one paragraph per line', () => {
  const { container } = render(
    <CustomSheetBody sections={sectionsWith(rich)} values={{ texts: { bio: 'one\ntwo' } }} onChange={{ text: jest.fn() }} />,
  );
  const paragraphs = container.querySelectorAll('.tiptap p');
  expect([...paragraphs].map((p) => p.textContent)).toEqual(['one', 'two']);
});

test('an edit in the styled field saves HTML through onChange.text', () => {
  const text = jest.fn();
  const { container } = render(
    <CustomSheetBody sections={sectionsWith(rich)} values={{ texts: { bio: '<p>a</p>' } }} onChange={{ text }} />,
  );
  act(() => { container.querySelector('.tiptap').editor.commands.insertContent('b'); });
  expect(text).toHaveBeenLastCalledWith('bio', expect.stringMatching(/^<p>.*b.*<\/p>$/));
});

test('HTML saved while the flag was on shows as plain text once it is off', () => {
  render(
    <CustomSheetBody sections={sectionsWith(plain)} values={{ texts: { bio: '<p>Hi</p><p><em>there</em></p>' } }} onChange={{ text: jest.fn() }} />,
  );
  expect(screen.getByRole('textbox')).toHaveValue('Hi\nthere');
});

test('a plain long text stays a two-row textarea', () => {
  const { container } = render(
    <CustomSheetBody sections={sectionsWith(plain)} values={{ texts: { bio: 'a < b' } }} onChange={{ text: jest.fn() }} />,
  );
  expect(screen.getByRole('textbox')).toHaveValue('a < b');
  expect(screen.queryByRole('toolbar')).toBeNull();
  expect(container.querySelector('.custom-sheet__cell--rows-2')).not.toBeNull();
});

// The creator mounts the body without onChange: the toolbar must still be there, disabled.
test('without onChange (the creator preview) the toolbar renders disabled', () => {
  const { container } = render(<CustomSheetBody sections={sectionsWith(rich)} showAffordances />);
  within(screen.getByRole('toolbar')).getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
  expect(container.querySelector('.tiptap').editor.isEditable).toBe(false);
});
```

Run (z `warhammer-battle-helper-front/`): `CI=true npm test -- --watchAll=false --testPathPattern="(fieldRowSpan|CustomSheetBody.richText)"`
Expected: FAIL — span 2 zamiast 4, brak toolbara.

- [ ] **Step 3: `fieldRowSpan.js`**

Zmień w komentarzu nagłówkowym zdanie „The span is derived from the type alone, never stored on the template” na:
```js
// The span is derived from the field's type (and, for a long text, its richText flag), never
// stored on the template, so changing this table re-lays out every existing sheet and there is
// nothing to migrate.
```
(usuń poprzednią wersję tego zdania), a w funkcji przed `if (TWO_ROWS.has(field.type)) return 2;`:
```js
  // A styled long text carries the formatting toolbar above its text (PLAYRPG-256); two rows
  // would leave about one line to write in.
  if (field.type === 'text_long' && field.richText) return 4;
```

- [ ] **Step 4: `CustomSheetBody.jsx`**

Importy (pod `import NumberInput …`):
```js
import RichTextEditor from '../../components/common/richText/RichTextEditor';
import { plainToHtml, htmlToPlain, looksLikeHtml } from '../../components/common/richText/richTextConvert';
```

Gałąź `case 'text_long':` zastąp:
```jsx
      // PLAYRPG-256: a styled field stores HTML. The value is converted at read time in both
      // directions, so flipping the flag in the creator needs no data migration; the stored
      // format follows the flag from the field's next edit.
      case 'text_long': {
        const raw = texts[field.key] || '';
        return renderTile(field, 'text', field.richText ? (
          <RichTextEditor
            className="custom-sheet__rich-text"
            value={looksLikeHtml(raw) ? raw : plainToHtml(raw)}
            onChange={onChange ? html => onChange.text(field.key, html) : undefined}
            editable={!readOnly}
          />
        ) : (
          <textarea
            className="custom-sheet__textarea"
            value={looksLikeHtml(raw) ? htmlToPlain(raw) : raw}
            onChange={onChange ? e => onChange.text(field.key, e.target.value) : undefined}
            readOnly={readOnly}
            rows={3}
          />
        ));
      }
```

- [ ] **Step 5: CSS w `style.css`**

Bezpośrednio pod regułą `.custom-sheet__cell.custom-sheet__cell--rows-2 { … }` (~7889):
```css
/* A styled long text (PLAYRPG-256) is four rows tall and FIXED at that height: grid rows are
   minmax(unit, auto), so with only a min-height every new paragraph would grow the row. The
   toolbar keeps its natural height and the text scrolls inside what is left. */
.custom-sheet__cell.custom-sheet__cell--rows-4 {
    grid-row: span 4;
    height: calc(4 * var(--sheet-row-unit) + 24px);
}

.custom-sheet__cell--rows-4 > .custom-sheet__tile {
    min-height: 0;
}
```

Pod regułą `.custom-sheet__cell--rows-2 > .custom-sheet__tile--text > .custom-sheet__tile-value { … }` (~8370):
```css
.custom-sheet__cell--rows-4 > .custom-sheet__tile--text > .custom-sheet__tile-value {
    flex: 1 1 auto;
    align-items: stretch;
    min-height: 0;
}

.custom-sheet__rich-text {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    min-width: 0;
    min-height: 0;
}

.custom-sheet__rich-text .rich-toolbar {
    flex: none;
}

.custom-sheet__rich-text .rich-text__content {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    background: #fff9f0;
    border: 1px solid #c4a882;
    border-radius: 3px;
    transition: border-color 0.15s;
}

.custom-sheet__rich-text .rich-text__content:focus-within {
    border-color: #7a5c42;
}
```

- [ ] **Step 6: Testy karty**

Run: `CI=true npm test -- --watchAll=false --testPathPattern="(fieldRowSpan|CustomSheetBody|CharacterSheet|TemplateBuilder)"`
Expected: PASS (w tym snapshot `CustomSheetBody.domShape` bez zmian — zwykłe `text_long` renderuje identyczny textarea).

- [ ] **Step 7: Commit**

```bash
cd ..
[ "$(git branch --show-current)" = main ] && git add warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.richText.test.jsx warhammer-battle-helper-front/src/systems/custom/fieldRowSpan.js warhammer-battle-helper-front/src/systems/custom/fieldRowSpan.test.js warhammer-battle-helper-front/src/style.css && git commit -m "feat: PLAYRPG-256 styled long text field on the custom sheet

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 6: Front — przełącznik w kreatorze, tutorial, i18n, dokumentacja testów

**Files:**
- Modify: `src/components/creator/TemplateBuilder.jsx:388-396` (`displayFlags`), `:407-419` (`SKILL_FLAG_META`)
- Modify: `src/components/creator/TemplateBuilder.skillFlags.test.jsx`
- Modify: `src/locales/en/translation.json`, `src/locales/pl/translation.json`
- Modify: `CLAUDE.md` (sekcja „Testy frontendu — ograniczenia jsdom”)

**Interfaces:**
- Consumes: `field.richText` (Task 2), render z Task 5.
- Produces: `displayFlags('text_long') === ['richText']`, `SKILL_FLAG_META.richText`.

- [ ] **Step 1: Testy**

W `TemplateBuilder.skillFlags.test.jsx`, pod testem `row tables offer sorting and the two-column split`:
```js
test('a long text offers the formatting switch', () => {
  expect(displayFlags('text_long')).toEqual(['richText']);
});

test('the formatting switch has a label and a hint, and depends on nothing', () => {
  expect(SKILL_FLAG_META.richText).toEqual({ labelKey: 'creator.richText', hintKey: 'creator.richTextHint' });
});
```

Run: `CI=true npm test -- --watchAll=false --testPathPattern=TemplateBuilder.skillFlags`
Expected: FAIL.

- [ ] **Step 2: Kreator**

W `displayFlags` przed `return [];`:
```js
  if (fieldType === 'text_long') {
    return ['richText'];
  }
```
W `SKILL_FLAG_META` (po `twoColumns`):
```js
  // PLAYRPG-256: a long text with the notes' formatting toolbar.
  richText:           { labelKey: 'creator.richText', hintKey: 'creator.richTextHint' },
```

- [ ] **Step 3: i18n**

`en/translation.json`, w obiekcie `creator` pod `"skillTwoColumns"`:
```json
"richText": "Text formatting",
"richTextHint": "Players get the same formatting toolbar as in notes. Turning it off makes existing texts plain on their next edit.",
```
`pl/translation.json`, to samo miejsce:
```json
"richText": "Formatowanie tekstu",
"richTextHint": "Gracz dostaje pasek formatowania jak w notatkach. Po wyłączeniu istniejące teksty staną się zwykłym tekstem przy następnej edycji.",
```

Tutorial (`tutorial.creatorField.display.body`, en ~1121 / pl ~1121) — dodaj klucz `text_long` po `data_table`:
- en: `"text_long": "Turn on text formatting: headings, colours, lists and links, with the same toolbar as notes. The field grows to four rows to fit it."`
- pl: `"text_long": "Włącz formatowanie tekstu: nagłówki, kolory, listy i linki, z tym samym paskiem co w notatkach. Pole urośnie do czterech wierszy, żeby go zmieścić."`

Tutorial `tutorial.creatorField.head.body.text_long` (linia 1111 w obu):
- en: `"A multi-line text area, e.g. a backstory or notes. It can also get a formatting toolbar."`
- pl: `"Wielowierszowe pole tekstowe, np. historia postaci albo notatki. Może też dostać pasek formatowania."`

- [ ] **Step 4: Testy kreatora i tutorialu**

Run: `CI=true npm test -- --watchAll=false --testPathPattern="(TemplateBuilder|creatorTour|tourTranslations|CreatorTour)"`
Expected: PASS.

- [ ] **Step 5: CLAUDE.md**

W sekcji „### Testy frontendu — ograniczenia jsdom”, po punkcie o `getBoundingClientRect`, dodaj:
```markdown
- **TipTap działa w jsdom** dzięki `jest.transformIgnorePatterns` w `package.json` (transpiluje ESM
  `@tiptap/*` i `prosemirror-*`). Instancję edytora bierz z węzła: `container.querySelector('.tiptap').editor`
  (wzorzec: `RichTextEditor.test.jsx`). Testy toolbara zostają na `createFakeEditor`.
```

- [ ] **Step 6: Cały suite front + backend**

Run (front): `CI=true npm test -- --watchAll=false 2>&1 | tail -15` → jedyny fail `App.test.js`.
Run (backend): `cd ../warhammer-battle-helper-backend && go test ./... && cd -` → PASS.

- [ ] **Step 7: Commit**

```bash
cd ..
[ "$(git branch --show-current)" = main ] && git add CLAUDE.md warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx warhammer-battle-helper-front/src/components/creator/TemplateBuilder.skillFlags.test.jsx warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json && git commit -m "feat: PLAYRPG-256 text formatting switch in the creator

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

---

### Task 7: Weryfikacja end-to-end (lokalny docker)

Bez commita — tylko sprawdzenie. Przepis na JWT: memory `local-e2e-verification-recipe`.

- [ ] **Step 1:** Przebuduj backend w kontenerze (jeśli build zawiśnie na keychainie — memory `docker-build-credential-hang` — poproś użytkownika o uruchomienie).
- [ ] **Step 2:** curl: `PUT` postaci w grze custom z szablonem, w którym `bio` ma `richText: true`, z `stats.texts.bio = "<p onclick=\"x()\">a</p>"` i `stats.texts.plain = "a < b"`. `GET` postaci → `bio == "<p>a</p>"`, `plain == "a < b"`.
- [ ] **Step 3:** Przeglądarka (robi użytkownik): w kreatorze włączyć „Formatowanie tekstu” na polu długim — podgląd pokazuje wyszarzony toolbar i kafelek 4 wiersze; w grze pisać, formatować, przewijać długą treść; wyłączyć flagę — tekst widoczny jako zwykły; notatki wyglądają i działają jak przed zmianą.
