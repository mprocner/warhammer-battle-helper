# PLAYRPG-228 Note Rich Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add text colour, font size, H1–H3, underline, highlight, alignment, links and clear-formatting to the note editor, with the backend sanitizer allowing exactly that markup.

**Architecture:** The editor stays Tiptap v3 and stores HTML. New Tiptap extensions emit inline `style` on `span` / `mark` / `p` / `h*`; the backend bluemonday policy (sanitize-on-write, the only security boundary) is widened with anchored regexes per CSS property. The toolbar moves out of `NoteEditorModal.jsx` into `NoteToolbar.jsx` + small `toolbar/` components that talk to the editor only through `editor.chain()`, `editor.isActive()` and `editor.getAttributes()`, so they are tested with a fake editor.

**Tech Stack:** Go 1.24 + bluemonday v1.0.27 | React 19 + Tiptap 3.22.3 + `@mui/icons-material` + i18next | Jest via CRA.

**Spec:** `docs/superpowers/specs/2026-10-05-playrpg-228-note-rich-text-design.md`

## Global Constraints

- Work on branch `PLAYRPG-228` in the main checkout — no worktree.
- Code comments in English. Conversation and `docs/` in Polish.
- All UI strings via `t('notes.toolbar.*')`, added to both `src/locales/en/translation.json` and `src/locales/pl/translation.json`.
- Icons only from `@mui/icons-material`. No MUI `<Tooltip>`, no MUI `Popover`.
- Tooltips: portal to `document.body`, classes `.portal-tooltip .portal-tooltip--below` + `.portal-tooltip__arrow`.
- Font size range **8–72 px**, presets **12 / 14 / 16 / 20 / 24 / 32**, base editor size **13 px**.
- Colours always `#rrggbb`. Text palette: `#3a2f1f` (default = unset), `#a8322d`, `#b85c1e`, `#9a6b2f`, `#2f6b3a`, `#2d5a8a`, `#6b3f8a`, `#6e6458`. Highlight palette: `#fff3a3`, `#d4f0c4`, `#cfe3f7`, `#f7d4e0`, `#fde0c2`, `#e3d9f2`.
- Alignment only `left | center | right`.
- Link schemes only `http | https | mailto`.
- Delete dead code / CSS / imports / deps in the same task that makes them dead.
- Frontend tests: run from `warhammer-battle-helper-front/` with `CI=true npm test -- --watchAll=false --testPathPattern=<name>`. Never bare `npx jest`. `App.test.js` (axios ESM) is a known baseline failure.
- Backend tests: `go test ./internal/service/ -run <Name>` from `warhammer-battle-helper-backend/`.
- Commit messages: `feat: PLAYRPG-228 …` / `test: …` / `chore: …`, ending with the attribution lines from the session.

## File Map

Backend
- Modify `warhammer-battle-helper-backend/internal/service/NoteService.go:12-29` — policy built by `newNoteHTMLPolicy()`.
- Create `warhammer-battle-helper-backend/internal/service/note_html_policy_test.go`.

Frontend (`warhammer-battle-helper-front/src/components/tabs/notes/`)
- Create `noteFormatting.js` + `noteFormatting.test.js` — constants and pure helpers, no Tiptap import.
- Create `noteExtensions.js` — `NOTE_EXTENSIONS`, the only file importing Tiptap extensions.
- Create `testUtils/fakeEditor.js` — fake editor for toolbar tests.
- Create `toolbar/usePopoverDismiss.js`.
- Create `toolbar/ToolbarButton.jsx` + `toolbar/ToolbarButton.test.jsx`.
- Create `toolbar/ColorPopover.jsx` + `toolbar/ColorPopover.test.jsx`.
- Create `toolbar/FontSizeCombo.jsx` + `toolbar/FontSizeCombo.test.jsx`.
- Create `toolbar/HeadingSelect.jsx` + `toolbar/HeadingSelect.test.jsx`.
- Create `toolbar/LinkPopover.jsx` + `toolbar/LinkPopover.test.jsx`.
- Create `NoteToolbar.jsx` + `NoteToolbar.test.jsx`.
- Modify `NoteEditorModal.jsx` — use `NOTE_EXTENSIONS` and `<NoteToolbar>`; drop inline toolbar.
- Modify `NoteEditorModal.saveStatus.test.jsx`, `NoteEditorModal.autosaveEcho.test.jsx` — mocks.
- Modify `../NotesTab.css` — toolbar, popovers, headings, mark.
- Modify `src/style.css` — `.portal-tooltip--below`.
- Modify `src/locales/en/translation.json`, `src/locales/pl/translation.json`.
- Modify `package.json` / `package-lock.json` — add 3 Tiptap packages, remove `@tiptap/extension-link`.

---

### Task 1: Backend sanitizer policy

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/service/NoteService.go:3-29`
- Test: `warhammer-battle-helper-backend/internal/service/note_html_policy_test.go`

**Interfaces:**
- Consumes: nothing.
- Produces: package-level `noteHTMLPolicy *bluemonday.Policy` (name unchanged — `NoteService.go:94` and `:246` keep calling `noteHTMLPolicy.Sanitize`).

The expected outputs below were measured against bluemonday v1.0.27 with this exact policy (scratch prototype, 2026-10-05).

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-backend/internal/service/note_html_policy_test.go`:

```go
package service

import "testing"

// Inputs in the "kept" cases mirror Tiptap 3.22.3 getHTML() output for the note editor
// extensions (noteExtensions.js). If a Tiptap upgrade changes that markup, refresh these
// strings from a real browser session, not from memory.
func TestNoteHTMLPolicy(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		// kept unchanged
		{"text colour and size on one span",
			`<p><span style="color: #a8322d; font-size: 18px">x</span></p>`,
			`<p><span style="color: #a8322d; font-size: 18px">x</span></p>`},
		{"font size range edges",
			`<p><span style="font-size: 8px">x</span><span style="font-size: 72px">y</span></p>`,
			`<p><span style="font-size: 8px">x</span><span style="font-size: 72px">y</span></p>`},
		{"multicolor highlight",
			`<p><mark data-color="#fff3a3" style="background-color: #fff3a3; color: inherit">x</mark></p>`,
			`<p><mark data-color="#fff3a3" style="background-color: #fff3a3; color: inherit">x</mark></p>`},
		{"alignment on paragraph and heading",
			`<p style="text-align: center">x</p><h1 style="text-align: right">t</h1>`,
			`<p style="text-align: center">x</p><h1 style="text-align: right">t</h1>`},
		{"tiptap https link",
			`<p><a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com">l</a></p>`,
			`<p><a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com">l</a></p>`},
		{"underline and h3 still allowed",
			`<h3><u>t</u></h3>`,
			`<h3><u>t</u></h3>`},

		// rewritten by policy
		{"mailto link gets noreferrer",
			`<p><a href="mailto:gm@example.com">m</a></p>`,
			`<p><a href="mailto:gm@example.com" rel="noreferrer">m</a></p>`},

		// stripped
		{"font size below and above range",
			`<p><span style="font-size: 7px">x</span><span style="font-size: 73px">y</span></p>`,
			`<p><span>x</span><span>y</span></p>`},
		{"named and rgb colours",
			`<p><span style="color: red">x</span><span style="color: rgb(1, 2, 3)">y</span></p>`,
			`<p><span>x</span><span>y</span></p>`},
		{"unlisted property dropped, listed one kept",
			`<p><span style="color: #ff0000; background-image: url(//evil.com/x.png)">x</span></p>`,
			`<p><span style="color: #ff0000">x</span></p>`},
		{"justify is not an allowed alignment",
			`<p style="text-align: justify">j</p>`,
			`<p>j</p>`},
		{"javascript href removes the link",
			`<p><a href="javascript:alert(1)">bad</a></p>`,
			`<p>bad</p>`},
		{"position fixed stripped everywhere",
			`<p style="position: fixed"><span style="position: fixed">x</span></p>`,
			`<p><span>x</span></p>`},
		{"style on element without style allowance",
			`<blockquote style="color: #a8322d">q</blockquote>`,
			`<blockquote>q</blockquote>`},
		{"event handler element removed",
			`<p><img src=x onerror="alert(1)">t</p>`,
			`<p>t</p>`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := noteHTMLPolicy.Sanitize(tt.in); got != tt.want {
				t.Errorf("Sanitize(%q)\n got %q\nwant %q", tt.in, got, tt.want)
			}
		})
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestNoteHTMLPolicy -v`
Expected: FAIL — e.g. `text colour and size on one span` got `<p>x</p>`, `javascript href removes the link` got `<p><a href="javascript:alert(1)" ...`.

- [ ] **Step 3: Replace the policy in `NoteService.go`**

Add `"regexp"` to the standard-library import group (keep alphabetical: after `"log"`, before `"sort"`). Replace lines 17-29 (`var noteHTMLPolicy = bluemonday.NewPolicy()` through the closing `}` of `init`) with:

```go
// Note bodies are stored as HTML and rendered by every participant's editor, so this policy
// is the only XSS boundary. Each regex is anchored: an unanchored one would accept any value
// that merely contains a valid fragment.
//
// Keep noteFontSizeRe in sync with FONT_SIZE_MIN / FONT_SIZE_MAX in
// warhammer-battle-helper-front/src/components/tabs/notes/noteFormatting.js.
var (
	noteColorRe     = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	noteFontSizeRe  = regexp.MustCompile(`^([89]|[1-6][0-9]|7[0-2])px$`)
	noteAlignRe     = regexp.MustCompile(`^(left|center|right)$`)
	noteMarkColorRe = regexp.MustCompile(`^inherit$`) // Tiptap Highlight emits "color: inherit"
)

var noteHTMLPolicy = newNoteHTMLPolicy()

func newNoteHTMLPolicy() *bluemonday.Policy {
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

	p.AllowStyles("color").Matching(noteColorRe).OnElements("span")
	p.AllowStyles("font-size").Matching(noteFontSizeRe).OnElements("span")
	p.AllowStyles("background-color").Matching(noteColorRe).OnElements("mark")
	p.AllowStyles("color").Matching(noteMarkColorRe).OnElements("mark")
	p.AllowAttrs("data-color").Matching(noteColorRe).OnElements("mark")
	p.AllowStyles("text-align").Matching(noteAlignRe).OnElements("p", "h1", "h2", "h3")

	p.AllowAttrs("href", "target", "rel").OnElements("a")
	p.RequireParseableURLs(true)
	p.AllowURLSchemes("http", "https", "mailto")
	p.AddTargetBlankToFullyQualifiedLinks(true)
	p.RequireNoReferrerOnLinks(true)
	return p
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-backend && go test ./internal/service/ -run TestNoteHTMLPolicy -v`
Expected: PASS, 15 subtests.

- [ ] **Step 5: Run the whole service package and vet**

Run: `cd warhammer-battle-helper-backend && go vet ./... && go test ./internal/service/`
Expected: `ok  battle-helper/internal/service`.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-backend/internal/service/NoteService.go warhammer-battle-helper-backend/internal/service/note_html_policy_test.go
git commit -m "feat: PLAYRPG-228 allow note colour, size, highlight, alignment and safe links in sanitizer"
```

---

### Task 2: Formatting constants and pure helpers

**Files:**
- Create: `warhammer-battle-helper-front/src/components/tabs/notes/noteFormatting.js`
- Test: `warhammer-battle-helper-front/src/components/tabs/notes/noteFormatting.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `FONT_SIZE_MIN = 8`, `FONT_SIZE_MAX = 72`, `FONT_SIZE_PRESETS = [12,14,16,20,24,32]`, `DEFAULT_FONT_SIZE = 13`
  - `DEFAULT_TEXT_COLOR = '#3a2f1f'`
  - `TEXT_COLORS: Array<{ key: string, hex: string }>` (8, first is `default`)
  - `HIGHLIGHT_COLORS: Array<{ key: string, hex: string }>` (6)
  - `clampFontSize(n: number): number`
  - `parseFontSize(input: string|null|undefined): number|null`
  - `readFontSize(cssValue: string|null|undefined): number|null` — `'18px'` → `18`
  - `toCssFontSize(n: number): string` — `18` → `'18px'`
  - `normalizeHref(input: string): string` — `''` when blank

- [ ] **Step 1: Write the failing test**

```js
import {
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  TEXT_COLORS,
  HIGHLIGHT_COLORS,
  DEFAULT_TEXT_COLOR,
  parseFontSize,
  readFontSize,
  toCssFontSize,
  normalizeHref,
} from './noteFormatting';

describe('font size helpers', () => {
  it('uses the same range as noteFontSizeRe in NoteService.go', () => {
    expect([FONT_SIZE_MIN, FONT_SIZE_MAX]).toEqual([8, 72]);
  });

  it.each([
    ['18', 18],
    ['18px', 18],
    [' 20 ', 20],
    ['18.6', 19],
    ['5', 8],
    ['100', 72],
    ['abc', null],
    ['', null],
    [null, null],
  ])('parseFontSize(%p) -> %p', (input, expected) => {
    expect(parseFontSize(input)).toBe(expected);
  });

  it.each([
    ['18px', 18],
    ['1.2em', null],
    [undefined, null],
    [null, null],
  ])('readFontSize(%p) -> %p', (input, expected) => {
    expect(readFontSize(input)).toBe(expected);
  });

  it('formats a px value', () => {
    expect(toCssFontSize(24)).toBe('24px');
  });
});

describe('palettes', () => {
  // The backend keeps a colour only when it matches noteColorRe.
  const backendColorRe = /^#[0-9a-fA-F]{6}$/;

  it.each([...TEXT_COLORS, ...HIGHLIGHT_COLORS])('$key is a #rrggbb colour', ({ hex }) => {
    expect(hex).toMatch(backendColorRe);
  });

  it('starts the text palette with the editor default colour', () => {
    expect(TEXT_COLORS).toHaveLength(8);
    expect(TEXT_COLORS[0]).toEqual({ key: 'default', hex: DEFAULT_TEXT_COLOR });
    expect(HIGHLIGHT_COLORS).toHaveLength(6);
  });
});

describe('normalizeHref', () => {
  it.each([
    ['example.com', 'https://example.com'],
    ['  example.com/a  ', 'https://example.com/a'],
    ['https://example.com', 'https://example.com'],
    ['HTTP://example.com', 'HTTP://example.com'],
    ['mailto:gm@example.com', 'mailto:gm@example.com'],
    ['', ''],
    ['   ', ''],
  ])('%p -> %p', (input, expected) => {
    expect(normalizeHref(input)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=noteFormatting`
Expected: FAIL — `Cannot find module './noteFormatting'`.

- [ ] **Step 3: Write the implementation**

```js
// Formatting constants and pure helpers for the note editor toolbar. No Tiptap import here,
// so toolbar components and their tests stay independent of the editor runtime.

// Keep in sync with noteFontSizeRe in
// warhammer-battle-helper-backend/internal/service/NoteService.go — the server strips any
// size outside this range, so a wider range here would silently lose formatting on save.
export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 72;
export const FONT_SIZE_PRESETS = [12, 14, 16, 20, 24, 32];
// Base size of .note-editor__content .tiptap in NotesTab.css.
export const DEFAULT_FONT_SIZE = 13;

// Every text colour has contrast >= 4.5:1 on #fff9f0. The first entry is the editor's own
// text colour: picking it removes the colour mark instead of storing it.
export const DEFAULT_TEXT_COLOR = '#3a2f1f';
export const TEXT_COLORS = [
  { key: 'default', hex: DEFAULT_TEXT_COLOR },
  { key: 'red', hex: '#a8322d' },
  { key: 'orange', hex: '#b85c1e' },
  { key: 'gold', hex: '#9a6b2f' },
  { key: 'green', hex: '#2f6b3a' },
  { key: 'blue', hex: '#2d5a8a' },
  { key: 'purple', hex: '#6b3f8a' },
  { key: 'gray', hex: '#6e6458' },
];

export const HIGHLIGHT_COLORS = [
  { key: 'yellow', hex: '#fff3a3' },
  { key: 'green', hex: '#d4f0c4' },
  { key: 'blue', hex: '#cfe3f7' },
  { key: 'pink', hex: '#f7d4e0' },
  { key: 'orange', hex: '#fde0c2' },
  { key: 'lavender', hex: '#e3d9f2' },
];

export const clampFontSize = (n) => Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)));

// Free text from the size field -> in-range px number, or null when it is not a number.
// Out-of-range values are clamped rather than rejected so the user sees what was applied.
export const parseFontSize = (input) => {
  const n = Number.parseFloat(String(input ?? '').trim());
  return Number.isFinite(n) ? clampFontSize(n) : null;
};

// Editor attribute ('18px') -> 18. Unset or non-px values (pasted '1.2em') -> null.
export const readFontSize = (cssValue) => {
  const match = /^(\d+)px$/.exec(cssValue ?? '');
  return match ? Number(match[1]) : null;
};

export const toCssFontSize = (n) => `${n}px`;

// A bare "example.com" gets https://; a value with an allowed scheme is kept as typed.
// Anything else (e.g. "javascript:…") becomes https://javascript:… — harmless, and the
// backend policy rejects unparseable URLs anyway.
export const normalizeHref = (input) => {
  const href = String(input ?? '').trim();
  if (!href) return '';
  return /^(https?:\/\/|mailto:)/i.test(href) ? href : `https://${href}`;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=noteFormatting`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/tabs/notes/noteFormatting.js warhammer-battle-helper-front/src/components/tabs/notes/noteFormatting.test.js
git commit -m "feat: PLAYRPG-228 note formatting palettes and font size helpers"
```

---

### Task 3: Tiptap extensions and dependency swap

**Files:**
- Modify: `warhammer-battle-helper-front/package.json`, `package-lock.json`
- Create: `warhammer-battle-helper-front/src/components/tabs/notes/noteExtensions.js`
- Modify: `warhammer-battle-helper-front/src/components/tabs/notes/NoteEditorModal.jsx:5,61-64`
- Modify: `NoteEditorModal.saveStatus.test.jsx:10`, `NoteEditorModal.autosaveEcho.test.jsx` (same `jest.mock('@tiptap/starter-kit'…)` line)

**Interfaces:**
- Consumes: nothing.
- Produces: `NOTE_EXTENSIONS` (array, named export of `noteExtensions.js`).

- [ ] **Step 1: Swap dependencies**

```bash
cd warhammer-battle-helper-front
npm install @tiptap/extension-text-style@^3.22.3 @tiptap/extension-highlight@^3.22.3 @tiptap/extension-text-align@^3.22.3
npm uninstall @tiptap/extension-link
```

Expected: `package.json` lists the three new packages at `^3.22.3`; `@tiptap/extension-link` is gone from `dependencies` (StarterKit v3 still pulls it in transitively — that is the copy actually used).

- [ ] **Step 2: Create `noteExtensions.js`**

```js
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, Color, FontSize } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import { TextAlign } from '@tiptap/extension-text-align';

// Every mark and attribute these extensions emit must be allowed by noteHTMLPolicy in
// warhammer-battle-helper-backend/internal/service/NoteService.go, or the server strips it
// on save and the WS echo wipes the formatting.
export const NOTE_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
  }),
  TextStyle,
  Color,
  FontSize,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right'] }),
];
```

- [ ] **Step 3: Use it in `NoteEditorModal.jsx`**

Replace line 5 `import StarterKit from '@tiptap/starter-kit';` with:

```js
import { NOTE_EXTENSIONS } from './noteExtensions';
```

Replace

```js
    extensions: [
      StarterKit,
    ],
```

with

```js
    extensions: NOTE_EXTENSIONS,
```

- [ ] **Step 4: Update the mocks in both existing modal tests**

In `NoteEditorModal.saveStatus.test.jsx` and `NoteEditorModal.autosaveEcho.test.jsx` replace

```js
jest.mock('@tiptap/starter-kit', () => ({ __esModule: true, default: {} }));
```

with

```js
jest.mock('./noteExtensions', () => ({ NOTE_EXTENSIONS: [] }));
```

- [ ] **Step 5: Run the modal tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=NoteEditorModal`
Expected: PASS (both files).

- [ ] **Step 6: Build check**

Run: `cd warhammer-battle-helper-front && npx react-scripts build`
Expected: `Compiled successfully` (or only pre-existing warnings). A `Module not found` here means an import name above is wrong.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/package.json warhammer-battle-helper-front/package-lock.json warhammer-battle-helper-front/src/components/tabs/notes/noteExtensions.js warhammer-battle-helper-front/src/components/tabs/notes/NoteEditorModal.jsx warhammer-battle-helper-front/src/components/tabs/notes/NoteEditorModal.saveStatus.test.jsx warhammer-battle-helper-front/src/components/tabs/notes/NoteEditorModal.autosaveEcho.test.jsx
git commit -m "feat: PLAYRPG-228 register text style, highlight and alignment extensions"
```

---

### Task 4: Toolbar primitives (button, popover anchor, dismiss hook, fake editor)

**Files:**
- Create: `warhammer-battle-helper-front/src/components/tabs/notes/toolbar/usePopoverDismiss.js`
- Create: `warhammer-battle-helper-front/src/components/tabs/notes/toolbar/ToolbarButton.jsx`
- Create: `warhammer-battle-helper-front/src/components/tabs/notes/testUtils/fakeEditor.js`
- Test: `warhammer-battle-helper-front/src/components/tabs/notes/toolbar/ToolbarButton.test.jsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `usePopoverDismiss(ref, isOpen: boolean, onClose: () => void): void` (default export)
  - `preventFocusLoss(e): void` — named export of `ToolbarButton.jsx`
  - `ToolbarButton({ icon, label, onClick, active?, onShowTooltip?, onHideTooltip? })` — named export
  - `ToolbarPopoverButton({ icon, label, isOpen, onToggle, onClose, active?, indicatorColor?, onShowTooltip?, onHideTooltip?, children })` — named export
  - `createFakeEditor({ active?: string[], attributes?: object, selectionEmpty?: boolean })` → `{ calls, commandNames(), chain, isActive, getAttributes, state }`. Active keys: `'bold'`, `'heading:2'`, `'textAlign:center'`, `'link'`, `'highlight'`.

- [ ] **Step 1: Create the fake editor (test utility, not a test file)**

`testUtils/fakeEditor.js`:

```js
// Stand-in for a Tiptap editor in toolbar tests. Records every command of
// editor.chain()...run() as [name, ...args], so a test asserts on what would reach Tiptap
// without a ProseMirror instance (which CRA's Jest cannot load anyway).
export const createFakeEditor = ({ active = [], attributes = {}, selectionEmpty = false } = {}) => {
  const calls = [];
  const chain = () => {
    const proxy = new Proxy({}, {
      get: (_, name) => (name === 'run'
        ? () => true
        : (...args) => {
          calls.push([name, ...args]);
          return proxy;
        }),
    });
    return proxy;
  };
  const isActive = (nameOrAttrs, attrs) => {
    const key = typeof nameOrAttrs === 'object'
      ? Object.entries(nameOrAttrs).map(([k, v]) => `${k}:${v}`).join(',')
      : (attrs?.level ? `${nameOrAttrs}:${attrs.level}` : nameOrAttrs);
    return active.includes(key);
  };
  return {
    calls,
    commandNames: () => calls.map(([name]) => name),
    chain,
    isActive,
    getAttributes: (name) => attributes[name] ?? {},
    state: { selection: { empty: selectionEmpty } },
  };
};
```

- [ ] **Step 2: Write the failing test**

`toolbar/ToolbarButton.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolbarButton, ToolbarPopoverButton } from './ToolbarButton';

describe('ToolbarButton', () => {
  it('runs onClick and keeps editor focus on mousedown', () => {
    const onClick = jest.fn();
    render(<ToolbarButton icon={<span />} label="Bold" onClick={onClick} active />);
    const btn = screen.getByRole('button', { name: 'Bold' });

    // fireEvent returns false when the handler called preventDefault.
    expect(fireEvent.mouseDown(btn)).toBe(false);
    fireEvent.click(btn);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports hover to the tooltip handlers', () => {
    const onShowTooltip = jest.fn();
    const onHideTooltip = jest.fn();
    render(<ToolbarButton icon={<span />} label="Bold" onClick={() => {}} onShowTooltip={onShowTooltip} onHideTooltip={onHideTooltip} />);
    const btn = screen.getByRole('button', { name: 'Bold' });

    fireEvent.mouseEnter(btn);
    fireEvent.mouseLeave(btn);

    expect(onShowTooltip).toHaveBeenCalledWith('Bold', btn);
    expect(onHideTooltip).toHaveBeenCalledTimes(1);
  });
});

describe('ToolbarPopoverButton', () => {
  const renderOpen = (onClose = jest.fn(), onToggle = jest.fn()) => {
    render(
      <div>
        <p>outside</p>
        <ToolbarPopoverButton icon={<span />} label="Text color" isOpen onToggle={onToggle} onClose={onClose}>
          <div>popover body</div>
        </ToolbarPopoverButton>
      </div>,
    );
    return { onClose, onToggle };
  };

  it('renders children only while open', () => {
    const { rerender } = render(
      <ToolbarPopoverButton icon={<span />} label="Text color" isOpen={false} onToggle={() => {}} onClose={() => {}}>
        <div>popover body</div>
      </ToolbarPopoverButton>,
    );
    expect(screen.queryByText('popover body')).toBeNull();

    rerender(
      <ToolbarPopoverButton icon={<span />} label="Text color" isOpen onToggle={() => {}} onClose={() => {}}>
        <div>popover body</div>
      </ToolbarPopoverButton>,
    );
    expect(screen.getByText('popover body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Text color' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on mousedown outside', () => {
    const { onClose } = renderOpen();
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const { onClose } = renderOpen();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on mousedown inside the popover or on its trigger', () => {
    const { onClose, onToggle } = renderOpen();
    fireEvent.mouseDown(screen.getByText('popover body'));
    const trigger = screen.getByRole('button', { name: 'Text color' });
    fireEvent.mouseDown(trigger);
    fireEvent.click(trigger);

    expect(onClose).not.toHaveBeenCalled();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows the colour indicator', () => {
    render(
      <ToolbarPopoverButton icon={<span />} label="Text color" isOpen={false} onToggle={() => {}} onClose={() => {}} indicatorColor="#a8322d">
        <div />
      </ToolbarPopoverButton>,
    );
    expect(document.querySelector('.note-toolbar__indicator')).toHaveStyle({ backgroundColor: '#a8322d' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=ToolbarButton`
Expected: FAIL — `Cannot find module './ToolbarButton'`.

- [ ] **Step 4: Create `toolbar/usePopoverDismiss.js`**

```js
import { useEffect } from 'react';

// Closes a popover on mousedown outside `ref` or on Escape. `ref` must wrap the trigger too:
// otherwise clicking the trigger of an open popover closes it on mousedown and reopens it
// on click. Bubble phase on purpose — a capture listener on document would run before every
// React handler in the app.
export default function usePopoverDismiss(ref, isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleMouseDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [ref, isOpen, onClose]);
}
```

- [ ] **Step 5: Create `toolbar/ToolbarButton.jsx`**

```jsx
import React, { useRef } from 'react';
import usePopoverDismiss from './usePopoverDismiss';

// Toolbar controls must not take focus from the editor on mousedown, otherwise the caret
// blinks out and back. Commands still call chain().focus(), which restores the selection.
export const preventFocusLoss = (e) => e.preventDefault();

export const ToolbarButton = ({ icon, label, onClick, active = false, onShowTooltip, onHideTooltip }) => (
  <button
    type="button"
    className={`note-toolbar__btn ${active ? 'note-toolbar__btn--active' : ''}`}
    aria-label={label}
    aria-pressed={active}
    onMouseDown={preventFocusLoss}
    onClick={onClick}
    onMouseEnter={(e) => onShowTooltip?.(label, e.currentTarget)}
    onMouseLeave={onHideTooltip}
  >
    {icon}
  </button>
);

export const ToolbarPopoverButton = ({
  icon,
  label,
  isOpen,
  onToggle,
  onClose,
  active = false,
  indicatorColor,
  onShowTooltip,
  onHideTooltip,
  children,
}) => {
  const anchorRef = useRef(null);
  usePopoverDismiss(anchorRef, isOpen, onClose);

  return (
    <div className="note-toolbar__anchor" ref={anchorRef}>
      <button
        type="button"
        className={`note-toolbar__btn ${active || isOpen ? 'note-toolbar__btn--active' : ''}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onMouseDown={preventFocusLoss}
        onClick={onToggle}
        onMouseEnter={(e) => { if (!isOpen) onShowTooltip?.(label, e.currentTarget); }}
        onMouseLeave={onHideTooltip}
      >
        {icon}
        {indicatorColor && <span className="note-toolbar__indicator" style={{ backgroundColor: indicatorColor }} />}
      </button>
      {isOpen && children}
    </div>
  );
};
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=ToolbarButton`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/tabs/notes/toolbar/usePopoverDismiss.js warhammer-battle-helper-front/src/components/tabs/notes/toolbar/ToolbarButton.jsx warhammer-battle-helper-front/src/components/tabs/notes/toolbar/ToolbarButton.test.jsx warhammer-battle-helper-front/src/components/tabs/notes/testUtils/fakeEditor.js
git commit -m "feat: PLAYRPG-228 note toolbar button and dismissible popover anchor"
```

---

### Task 5: Toolbar i18n keys

**Files:**
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json` (`notes` object)
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json` (`notes` object)

**Interfaces:**
- Produces: `notes.toolbar.*` keys used by Tasks 6–9 (full list below).

Done before the components so every component test renders real labels.

- [ ] **Step 1: Add the English keys**

Run from `warhammer-battle-helper-front/`:

```bash
node -e '
const fs = require("fs");
const p = "src/locales/en/translation.json";
const j = JSON.parse(fs.readFileSync(p, "utf8"));
j.notes.toolbar = {
  label: "Formatting",
  textStyle: "Text style",
  paragraph: "Paragraph",
  heading1: "Heading 1",
  heading2: "Heading 2",
  heading3: "Heading 3",
  fontSize: "Font size",
  fontSizePresets: "Font size presets",
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
  strike: "Strikethrough",
  textColor: "Text color",
  highlight: "Highlight",
  customColor: "Custom color",
  noHighlight: "No highlight",
  alignLeft: "Align left",
  alignCenter: "Align center",
  alignRight: "Align right",
  bulletList: "Bulleted list",
  orderedList: "Numbered list",
  blockquote: "Quote",
  horizontalRule: "Divider",
  link: "Link",
  linkUrl: "Link address",
  linkPlaceholder: "https://example.com",
  applyLink: "Apply",
  removeLink: "Remove link",
  clearFormatting: "Clear formatting",
  colors: {
    default: "Default", red: "Red", orange: "Orange", gold: "Gold", green: "Green",
    blue: "Blue", purple: "Purple", gray: "Gray", yellow: "Yellow", pink: "Pink", lavender: "Lavender"
  }
};
fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
'
```

- [ ] **Step 2: Add the Polish keys**

```bash
node -e '
const fs = require("fs");
const p = "src/locales/pl/translation.json";
const j = JSON.parse(fs.readFileSync(p, "utf8"));
j.notes.toolbar = {
  label: "Formatowanie",
  textStyle: "Styl tekstu",
  paragraph: "Akapit",
  heading1: "Nagłówek 1",
  heading2: "Nagłówek 2",
  heading3: "Nagłówek 3",
  fontSize: "Rozmiar czcionki",
  fontSizePresets: "Gotowe rozmiary",
  bold: "Pogrubienie",
  italic: "Kursywa",
  underline: "Podkreślenie",
  strike: "Przekreślenie",
  textColor: "Kolor tekstu",
  highlight: "Zakreślacz",
  customColor: "Własny kolor",
  noHighlight: "Bez zakreślenia",
  alignLeft: "Do lewej",
  alignCenter: "Do środka",
  alignRight: "Do prawej",
  bulletList: "Lista punktowana",
  orderedList: "Lista numerowana",
  blockquote: "Cytat",
  horizontalRule: "Linia pozioma",
  link: "Link",
  linkUrl: "Adres linku",
  linkPlaceholder: "https://example.com",
  applyLink: "Zastosuj",
  removeLink: "Usuń link",
  clearFormatting: "Wyczyść formatowanie",
  colors: {
    default: "Domyślny", red: "Czerwony", orange: "Pomarańczowy", gold: "Złoty", green: "Zielony",
    blue: "Niebieski", purple: "Fioletowy", gray: "Szary", yellow: "Żółty", pink: "Różowy", lavender: "Lawendowy"
  }
};
fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
'
```

- [ ] **Step 3: Verify the diff touched only `notes.toolbar`**

Run: `git diff --stat -- warhammer-battle-helper-front/src/locales` and `git diff -- warhammer-battle-helper-front/src/locales | grep '^-' | grep -v '^---'`
Expected: only additions (the second command prints nothing). If the JSON files used a different indentation and the whole file got reformatted, revert and redo with that indentation passed to `JSON.stringify`.

- [ ] **Step 4: Commit**

```bash
git add warhammer-battle-helper-front/src/locales/en/translation.json warhammer-battle-helper-front/src/locales/pl/translation.json
git commit -m "feat: PLAYRPG-228 note toolbar translations"
```

---

### Task 6: ColorPopover

**Files:**
- Create: `warhammer-battle-helper-front/src/components/tabs/notes/toolbar/ColorPopover.jsx`
- Test: `warhammer-battle-helper-front/src/components/tabs/notes/toolbar/ColorPopover.test.jsx`

**Interfaces:**
- Consumes: `preventFocusLoss` (Task 4), `TEXT_COLORS` / `HIGHLIGHT_COLORS` (Task 2, in tests), `notes.toolbar.colors.*`, `notes.toolbar.customColor` (Task 5).
- Produces: `ColorPopover({ colors, activeHex?, onSelect(hex), onCustom(hex), onClear?, clearLabel?, customLabel })` (default export). `onSelect` = palette swatch (caller closes the popover); `onCustom` = native picker change (popover stays open); clear button renders only when `onClear` is given.

- [ ] **Step 1: Write the failing test**

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../../../i18n';
import ColorPopover from './ColorPopover';
import { TEXT_COLORS, HIGHLIGHT_COLORS } from '../noteFormatting';

const renderPopover = (props = {}) => {
  const handlers = { onSelect: jest.fn(), onCustom: jest.fn(), ...props };
  render(<ColorPopover colors={TEXT_COLORS} customLabel="Custom color" {...handlers} />);
  return handlers;
};

describe('ColorPopover', () => {
  it('renders one labelled swatch per palette entry', () => {
    renderPopover();
    expect(document.querySelectorAll('.note-toolbar__swatch')).toHaveLength(TEXT_COLORS.length);
    expect(screen.getByRole('button', { name: 'Red' })).toBeInTheDocument();
  });

  it('reports a swatch click with its hex', () => {
    const { onSelect } = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Red' }));
    expect(onSelect).toHaveBeenCalledWith('#a8322d');
  });

  it('marks the active colour, case-insensitively', () => {
    renderPopover({ activeHex: '#A8322D' });
    expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the native picker value through onCustom', () => {
    const { onCustom, onSelect } = renderPopover();
    fireEvent.change(screen.getByLabelText('Custom color'), { target: { value: '#123456' } });
    expect(onCustom).toHaveBeenCalledWith('#123456');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('seeds the picker with the first palette colour when nothing is active', () => {
    render(<ColorPopover colors={HIGHLIGHT_COLORS} customLabel="Custom color" onSelect={() => {}} onCustom={() => {}} />);
    expect(screen.getByLabelText('Custom color')).toHaveValue('#fff3a3');
  });

  it('renders the clear button only with onClear', () => {
    renderPopover();
    expect(screen.queryByRole('button', { name: 'No highlight' })).toBeNull();
  });

  it('calls onClear', () => {
    const onClear = jest.fn();
    renderPopover({ onClear, clearLabel: 'No highlight' });
    fireEvent.click(screen.getByRole('button', { name: 'No highlight' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=ColorPopover`
Expected: FAIL — `Cannot find module './ColorPopover'`.

- [ ] **Step 3: Write the implementation**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { preventFocusLoss } from './ToolbarButton';

const HEX_RE = /^#[0-9a-f]{6}$/i;

const ColorPopover = ({ colors, activeHex, onSelect, onCustom, onClear, clearLabel, customLabel }) => {
  const { t } = useTranslation();
  const active = activeHex?.toLowerCase();
  // <input type="color"> only accepts #rrggbb; anything else would reset it to black.
  const pickerValue = HEX_RE.test(activeHex ?? '') ? active : colors[0].hex;

  return (
    <div className="note-toolbar__popover note-toolbar__color-popover" role="dialog">
      <div className="note-toolbar__swatches">
        {colors.map(({ key, hex }) => (
          <button
            key={key}
            type="button"
            className={`note-toolbar__swatch ${active === hex ? 'note-toolbar__swatch--active' : ''}`}
            style={{ backgroundColor: hex }}
            aria-label={t(`notes.toolbar.colors.${key}`)}
            aria-pressed={active === hex}
            onMouseDown={preventFocusLoss}
            onClick={() => onSelect(hex)}
          />
        ))}
      </div>
      <label className="note-toolbar__custom-color">
        <input type="color" value={pickerValue} onChange={(e) => onCustom(e.target.value)} />
        {customLabel}
      </label>
      {onClear && (
        <button type="button" className="note-toolbar__text-btn" onMouseDown={preventFocusLoss} onClick={onClear}>
          {clearLabel}
        </button>
      )}
    </div>
  );
};

export default ColorPopover;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=ColorPopover`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/tabs/notes/toolbar/ColorPopover.jsx warhammer-battle-helper-front/src/components/tabs/notes/toolbar/ColorPopover.test.jsx
git commit -m "feat: PLAYRPG-228 colour palette popover with custom picker"
```

---

### Task 7: FontSizeCombo and HeadingSelect

**Files:**
- Create: `warhammer-battle-helper-front/src/components/tabs/notes/toolbar/FontSizeCombo.jsx`
- Create: `warhammer-battle-helper-front/src/components/tabs/notes/toolbar/HeadingSelect.jsx`
- Test: `toolbar/FontSizeCombo.test.jsx`, `toolbar/HeadingSelect.test.jsx`

**Interfaces:**
- Consumes: `usePopoverDismiss`, `preventFocusLoss`, `createFakeEditor` (Task 4); `FONT_SIZE_PRESETS`, `DEFAULT_FONT_SIZE`, `parseFontSize` (Task 2); `notes.toolbar.fontSize`, `fontSizePresets`, `textStyle`, `paragraph`, `heading1..3` (Task 5).
- Produces:
  - `FontSizeCombo({ value: number|null, onApply(n: number), onShowTooltip?, onHideTooltip? })` (default export). Applies on Enter or preset click only; blur reverts the draft.
  - `HeadingSelect({ editor, onShowTooltip?, onHideTooltip? })` (default export). Values `0` (paragraph), `1`, `2`, `3`.

- [ ] **Step 1: Write the failing tests**

`toolbar/FontSizeCombo.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../../../i18n';
import FontSizeCombo from './FontSizeCombo';

const input = () => screen.getByRole('textbox', { name: 'Font size' });
const typeAndEnter = (value) => {
  fireEvent.change(input(), { target: { value } });
  fireEvent.keyDown(input(), { key: 'Enter' });
};

describe('FontSizeCombo', () => {
  it('shows the current size, or the base size as placeholder', () => {
    const { rerender } = render(<FontSizeCombo value={18} onApply={() => {}} />);
    expect(input()).toHaveValue('18');

    rerender(<FontSizeCombo value={null} onApply={() => {}} />);
    expect(input()).toHaveValue('');
    expect(input()).toHaveAttribute('placeholder', '13');
  });

  it('applies a typed size on Enter', () => {
    const onApply = jest.fn();
    render(<FontSizeCombo value={null} onApply={onApply} />);
    typeAndEnter('18');
    expect(onApply).toHaveBeenCalledWith(18);
  });

  it('clamps an out-of-range size and shows the clamped value', () => {
    const onApply = jest.fn();
    render(<FontSizeCombo value={null} onApply={onApply} />);
    typeAndEnter('100');
    expect(onApply).toHaveBeenCalledWith(72);
    expect(input()).toHaveValue('72');
  });

  it('ignores a non-number and restores the current size', () => {
    const onApply = jest.fn();
    render(<FontSizeCombo value={16} onApply={onApply} />);
    typeAndEnter('abc');
    expect(onApply).not.toHaveBeenCalled();
    expect(input()).toHaveValue('16');
  });

  it('reverts an unsubmitted draft on blur', () => {
    const onApply = jest.fn();
    render(<FontSizeCombo value={16} onApply={onApply} />);
    fireEvent.change(input(), { target: { value: '30' } });
    fireEvent.blur(input());
    expect(onApply).not.toHaveBeenCalled();
    expect(input()).toHaveValue('16');
  });

  it('applies a preset and closes the list', () => {
    const onApply = jest.fn();
    render(<FontSizeCombo value={null} onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: 'Font size presets' }));
    expect(screen.getAllByRole('option')).toHaveLength(6);

    fireEvent.click(screen.getByRole('option', { name: '24' }));

    expect(onApply).toHaveBeenCalledWith(24);
    expect(screen.queryByRole('option')).toBeNull();
  });
});
```

`toolbar/HeadingSelect.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../../../i18n';
import HeadingSelect from './HeadingSelect';
import { createFakeEditor } from '../testUtils/fakeEditor';

const select = () => screen.getByRole('combobox', { name: 'Text style' });

describe('HeadingSelect', () => {
  it('shows the heading level under the caret', () => {
    render(<HeadingSelect editor={createFakeEditor({ active: ['heading:2'] })} />);
    expect(select()).toHaveValue('2');
  });

  it('shows paragraph when no heading is active', () => {
    render(<HeadingSelect editor={createFakeEditor()} />);
    expect(select()).toHaveValue('0');
  });

  it('sets a heading level', () => {
    const editor = createFakeEditor();
    render(<HeadingSelect editor={editor} />);
    fireEvent.change(select(), { target: { value: '1' } });
    expect(editor.calls).toEqual([['focus'], ['setHeading', { level: 1 }]]);
  });

  it('turns a heading back into a paragraph', () => {
    const editor = createFakeEditor({ active: ['heading:3'] });
    render(<HeadingSelect editor={editor} />);
    fireEvent.change(select(), { target: { value: '0' } });
    expect(editor.commandNames()).toEqual(['focus', 'setParagraph']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern="FontSizeCombo|HeadingSelect"`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `toolbar/FontSizeCombo.jsx`**

```jsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import usePopoverDismiss from './usePopoverDismiss';
import { preventFocusLoss } from './ToolbarButton';
import { DEFAULT_FONT_SIZE, FONT_SIZE_PRESETS, parseFontSize } from '../noteFormatting';

const asDraft = (value) => (value == null ? '' : String(value));

const FontSizeCombo = ({ value, onApply, onShowTooltip, onHideTooltip }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(asDraft(value));
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const close = useCallback(() => setIsOpen(false), []);
  usePopoverDismiss(rootRef, isOpen, close);

  // The caret moved to text with another size: show that size.
  useEffect(() => { setDraft(asDraft(value)); }, [value]);

  const apply = (n) => {
    setDraft(String(n));
    setIsOpen(false);
    onApply(n);
  };

  const commitDraft = () => {
    const n = parseFontSize(draft);
    if (n == null) {
      setDraft(asDraft(value));
      return;
    }
    apply(n);
  };

  const label = t('notes.toolbar.fontSize');

  return (
    <div
      className="note-toolbar__anchor note-toolbar__size"
      ref={rootRef}
      onMouseEnter={(e) => { if (!isOpen) onShowTooltip?.(label, e.currentTarget); }}
      onMouseLeave={onHideTooltip}
    >
      <input
        className="note-toolbar__size-input"
        type="text"
        inputMode="numeric"
        value={draft}
        placeholder={String(DEFAULT_FONT_SIZE)}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitDraft();
          }
        }}
        // Applying only on Enter: a blur caused by clicking into the editor must not
        // apply a half-typed size to whatever the click selects.
        onBlur={() => setDraft(asDraft(value))}
      />
      <button
        type="button"
        className="note-toolbar__size-toggle"
        aria-label={t('notes.toolbar.fontSizePresets')}
        aria-expanded={isOpen}
        onMouseDown={preventFocusLoss}
        onClick={() => setIsOpen((open) => !open)}
      >
        <ArrowDropDownIcon fontSize="small" />
      </button>
      {isOpen && (
        <ul className="note-toolbar__popover note-toolbar__size-list" role="listbox">
          {FONT_SIZE_PRESETS.map((n) => (
            <li key={n}>
              <button
                type="button"
                role="option"
                aria-selected={n === value}
                className={`note-toolbar__size-option ${n === value ? 'note-toolbar__size-option--active' : ''}`}
                onMouseDown={preventFocusLoss}
                onClick={() => apply(n)}
              >
                {n}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default FontSizeCombo;
```

- [ ] **Step 4: Create `toolbar/HeadingSelect.jsx`**

```jsx
import React from 'react';
import { useTranslation } from 'react-i18next';

const LEVELS = [1, 2, 3];

// Native <select>: it takes focus from the editor, but chain().focus() puts the
// selection back before the command runs.
const HeadingSelect = ({ editor, onShowTooltip, onHideTooltip }) => {
  const { t } = useTranslation();
  const current = LEVELS.find((level) => editor.isActive('heading', { level })) ?? 0;
  const label = t('notes.toolbar.textStyle');

  const handleChange = (e) => {
    const level = Number(e.target.value);
    const chain = editor.chain().focus();
    (level === 0 ? chain.setParagraph() : chain.setHeading({ level })).run();
  };

  return (
    <select
      className="note-toolbar__heading"
      value={current}
      onChange={handleChange}
      aria-label={label}
      onMouseEnter={(e) => onShowTooltip?.(label, e.currentTarget)}
      onMouseLeave={onHideTooltip}
    >
      <option value={0}>{t('notes.toolbar.paragraph')}</option>
      {LEVELS.map((level) => (
        <option key={level} value={level}>{t(`notes.toolbar.heading${level}`)}</option>
      ))}
    </select>
  );
};

export default HeadingSelect;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern="FontSizeCombo|HeadingSelect"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src/components/tabs/notes/toolbar/FontSizeCombo.jsx warhammer-battle-helper-front/src/components/tabs/notes/toolbar/FontSizeCombo.test.jsx warhammer-battle-helper-front/src/components/tabs/notes/toolbar/HeadingSelect.jsx warhammer-battle-helper-front/src/components/tabs/notes/toolbar/HeadingSelect.test.jsx
git commit -m "feat: PLAYRPG-228 font size combo and heading select"
```

---

### Task 8: LinkPopover

**Files:**
- Create: `warhammer-battle-helper-front/src/components/tabs/notes/toolbar/LinkPopover.jsx`
- Test: `warhammer-battle-helper-front/src/components/tabs/notes/toolbar/LinkPopover.test.jsx`

**Interfaces:**
- Consumes: `normalizeHref` (Task 2); `notes.toolbar.linkUrl`, `linkPlaceholder`, `applyLink`, `removeLink` (Task 5).
- Produces: `LinkPopover({ initialHref?: string, onApply(href: string), onRemove() })` (default export). Submitting a blank field calls `onRemove`. Remove button only when `initialHref` is set.

- [ ] **Step 1: Write the failing test**

```jsx
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '../../../../i18n';
import LinkPopover from './LinkPopover';

const field = () => screen.getByRole('textbox', { name: 'Link address' });

describe('LinkPopover', () => {
  it('focuses the address field on open', () => {
    render(<LinkPopover onApply={() => {}} onRemove={() => {}} />);
    expect(field()).toHaveFocus();
  });

  it('applies a normalized address', () => {
    const onApply = jest.fn();
    render(<LinkPopover onApply={onApply} onRemove={() => {}} />);
    fireEvent.change(field(), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith('https://example.com');
  });

  it('submits on Enter', () => {
    const onApply = jest.fn();
    render(<LinkPopover onApply={onApply} onRemove={() => {}} />);
    fireEvent.change(field(), { target: { value: 'https://a.pl' } });
    fireEvent.submit(field());
    expect(onApply).toHaveBeenCalledWith('https://a.pl');
  });

  it('treats a blank address as remove', () => {
    const onApply = jest.fn();
    const onRemove = jest.fn();
    render(<LinkPopover initialHref="https://a.pl" onApply={onApply} onRemove={onRemove} />);
    fireEvent.change(field(), { target: { value: '  ' } });
    fireEvent.submit(field());
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  // Fresh mounts, not rerender: NoteToolbar mounts LinkPopover anew on every open, and
  // useState(initialHref) seeds the field only on mount.
  it('offers remove only for an existing link', () => {
    render(<LinkPopover onApply={() => {}} onRemove={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Remove link' })).toBeNull();
    cleanup();

    const onRemove = jest.fn();
    render(<LinkPopover initialHref="https://a.pl" onApply={() => {}} onRemove={onRemove} />);
    expect(field()).toHaveValue('https://a.pl');
    fireEvent.click(screen.getByRole('button', { name: 'Remove link' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=LinkPopover`
Expected: FAIL — `Cannot find module './LinkPopover'`.

- [ ] **Step 3: Write the implementation**

```jsx
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeHref } from '../noteFormatting';

// Mounted fresh on every open, so initialHref only seeds the field once.
const LinkPopover = ({ initialHref, onApply, onRemove }) => {
  const { t } = useTranslation();
  const [href, setHref] = useState(initialHref ?? '');
  const inputRef = useRef(null);

  // Focus leaves the editor here; the editor keeps its selection in state and the
  // apply/remove commands restore it with chain().focus().
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const normalized = normalizeHref(href);
    if (normalized) onApply(normalized);
    else onRemove();
  };

  return (
    <form className="note-toolbar__popover note-toolbar__link-popover" onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        className="note-toolbar__link-input"
        type="text"
        value={href}
        placeholder={t('notes.toolbar.linkPlaceholder')}
        aria-label={t('notes.toolbar.linkUrl')}
        onChange={(e) => setHref(e.target.value)}
      />
      <div className="note-toolbar__link-actions">
        <button type="submit" className="note-toolbar__text-btn">{t('notes.toolbar.applyLink')}</button>
        {initialHref && (
          <button type="button" className="note-toolbar__text-btn" onClick={onRemove}>
            {t('notes.toolbar.removeLink')}
          </button>
        )}
      </div>
    </form>
  );
};

export default LinkPopover;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=LinkPopover`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/tabs/notes/toolbar/LinkPopover.jsx warhammer-battle-helper-front/src/components/tabs/notes/toolbar/LinkPopover.test.jsx
git commit -m "feat: PLAYRPG-228 link popover"
```

---

### Task 9: NoteToolbar and modal integration

**Files:**
- Create: `warhammer-battle-helper-front/src/components/tabs/notes/NoteToolbar.jsx`
- Test: `warhammer-battle-helper-front/src/components/tabs/notes/NoteToolbar.test.jsx`
- Modify: `warhammer-battle-helper-front/src/components/tabs/notes/NoteEditorModal.jsx` (imports lines 9-16, `toolbarButtons` array, toolbar JSX block)
- Modify: `NoteEditorModal.saveStatus.test.jsx`, `NoteEditorModal.autosaveEcho.test.jsx` (mock editor objects)

**Interfaces:**
- Consumes: everything from Tasks 2, 4, 6, 7, 8; `notes.toolbar.*` (Task 5).
- Produces: `NoteToolbar({ editor })` (default export). Returns `null` while `editor` is null.

- [ ] **Step 1: Write the failing test**

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../../i18n';
import NoteToolbar from './NoteToolbar';
import { createFakeEditor } from './testUtils/fakeEditor';

const btn = (name) => screen.getByRole('button', { name });
const renderToolbar = (options) => {
  const editor = createFakeEditor(options);
  render(<NoteToolbar editor={editor} />);
  return editor;
};

describe('NoteToolbar', () => {
  it('renders nothing before the editor exists', () => {
    const { container } = render(<NoteToolbar editor={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['Bold', ['toggleBold']],
    ['Italic', ['toggleItalic']],
    ['Underline', ['toggleUnderline']],
    ['Strikethrough', ['toggleStrike']],
    ['Bulleted list', ['toggleBulletList']],
    ['Numbered list', ['toggleOrderedList']],
    ['Quote', ['toggleBlockquote']],
    ['Divider', ['setHorizontalRule']],
    ['Clear formatting', ['unsetAllMarks', 'clearNodes']],
  ])('%s runs %p', (name, commands) => {
    const editor = renderToolbar();
    fireEvent.click(btn(name));
    expect(editor.commandNames()).toEqual(['focus', ...commands]);
  });

  it.each([
    ['Align left', 'left'],
    ['Align center', 'center'],
    ['Align right', 'right'],
  ])('%s sets text-align %s', (name, alignment) => {
    const editor = renderToolbar();
    fireEvent.click(btn(name));
    expect(editor.calls).toEqual([['focus'], ['setTextAlign', alignment]]);
  });

  it('reflects active marks and alignment', () => {
    renderToolbar({ active: ['bold', 'textAlign:center'] });
    expect(btn('Bold')).toHaveAttribute('aria-pressed', 'true');
    expect(btn('Italic')).toHaveAttribute('aria-pressed', 'false');
    expect(btn('Align center')).toHaveAttribute('aria-pressed', 'true');
  });

  it('applies a palette text colour and closes the popover', () => {
    const editor = renderToolbar();
    fireEvent.click(btn('Text color'));
    fireEvent.click(btn('Red'));
    expect(editor.calls).toEqual([['focus'], ['setColor', '#a8322d']]);
    expect(screen.queryByRole('button', { name: 'Red' })).toBeNull();
  });

  it('removes the colour mark when the default colour is picked', () => {
    const editor = renderToolbar({ attributes: { textStyle: { color: '#a8322d' } } });
    fireEvent.click(btn('Text color'));
    fireEvent.click(btn('Default'));
    expect(editor.commandNames()).toEqual(['focus', 'unsetColor']);
  });

  it('applies and clears a highlight', () => {
    const editor = renderToolbar();
    fireEvent.click(btn('Highlight'));
    fireEvent.click(btn('Yellow'));
    expect(editor.calls).toEqual([['focus'], ['setHighlight', { color: '#fff3a3' }]]);

    fireEvent.click(btn('Highlight'));
    fireEvent.click(btn('No highlight'));
    expect(editor.commandNames().slice(-2)).toEqual(['focus', 'unsetHighlight']);
  });

  it('keeps only one popover open', () => {
    renderToolbar();
    fireEvent.click(btn('Text color'));
    fireEvent.click(btn('Highlight'));
    expect(screen.queryByRole('button', { name: 'Red' })).toBeNull();
    expect(btn('Yellow')).toBeInTheDocument();
  });

  it('applies a font size in px and shows the size under the caret', () => {
    const editor = renderToolbar({ attributes: { textStyle: { fontSize: '20px' } } });
    const input = screen.getByRole('textbox', { name: 'Font size' });
    expect(input).toHaveValue('20');

    fireEvent.change(input, { target: { value: '18' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(editor.calls).toEqual([['focus'], ['setFontSize', '18px']]);
  });

  it('links the selected text', () => {
    const editor = renderToolbar();
    fireEvent.click(btn('Link'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Link address' }), { target: { value: 'example.com' } });
    fireEvent.click(btn('Apply'));
    expect(editor.calls).toEqual([
      ['focus'],
      ['extendMarkRange', 'link'],
      ['setLink', { href: 'https://example.com' }],
    ]);
  });

  it('inserts the address as linked text when nothing is selected', () => {
    const editor = renderToolbar({ selectionEmpty: true });
    fireEvent.click(btn('Link'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Link address' }), { target: { value: 'https://a.pl' } });
    fireEvent.click(btn('Apply'));
    expect(editor.calls).toEqual([
      ['focus'],
      ['insertContent', { type: 'text', text: 'https://a.pl', marks: [{ type: 'link', attrs: { href: 'https://a.pl' } }] }],
    ]);
  });

  it('removes an existing link', () => {
    const editor = renderToolbar({ active: ['link'], attributes: { link: { href: 'https://a.pl' } } });
    fireEvent.click(btn('Link'));
    fireEvent.click(btn('Remove link'));
    expect(editor.commandNames()).toEqual(['focus', 'extendMarkRange', 'unsetLink']);
  });

  it('shows a tooltip below the hovered button', () => {
    renderToolbar();
    fireEvent.mouseEnter(btn('Bold'));
    const tooltip = document.querySelector('.portal-tooltip.portal-tooltip--below');
    expect(tooltip).toHaveTextContent('Bold');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=NoteToolbar`
Expected: FAIL — `Cannot find module './NoteToolbar'`.

- [ ] **Step 3: Create `NoteToolbar.jsx`**

```jsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined';
import FormatStrikethroughIcon from '@mui/icons-material/FormatStrikethrough';
import FormatColorTextIcon from '@mui/icons-material/FormatColorText';
import BorderColorIcon from '@mui/icons-material/BorderColor';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import LinkIcon from '@mui/icons-material/Link';
import FormatClearIcon from '@mui/icons-material/FormatClear';
import { ToolbarButton, ToolbarPopoverButton } from './toolbar/ToolbarButton';
import ColorPopover from './toolbar/ColorPopover';
import FontSizeCombo from './toolbar/FontSizeCombo';
import HeadingSelect from './toolbar/HeadingSelect';
import LinkPopover from './toolbar/LinkPopover';
import {
  DEFAULT_TEXT_COLOR,
  HIGHLIGHT_COLORS,
  TEXT_COLORS,
  readFontSize,
  toCssFontSize,
} from './noteFormatting';

const TOOLTIP_HIDE_DELAY = 100;

const NoteToolbar = ({ editor }) => {
  const { t } = useTranslation();
  const [openPopover, setOpenPopover] = useState(null); // 'textColor' | 'highlight' | 'link' | null
  const [tooltip, setTooltip] = useState(null);
  const tooltipTimeoutRef = useRef(null);

  useEffect(() => () => clearTimeout(tooltipTimeoutRef.current), []);

  const showTooltip = useCallback((text, el) => {
    clearTimeout(tooltipTimeoutRef.current);
    const rect = el.getBoundingClientRect();
    setTooltip({ top: rect.bottom, left: rect.left + rect.width / 2, text });
  }, []);

  const hideTooltip = useCallback(() => {
    tooltipTimeoutRef.current = setTimeout(() => setTooltip(null), TOOLTIP_HIDE_DELAY);
  }, []);

  const closePopover = useCallback(() => setOpenPopover(null), []);
  const togglePopover = (name) => {
    setTooltip(null);
    setOpenPopover((current) => (current === name ? null : name));
  };

  if (!editor) return null;

  const tip = { onShowTooltip: showTooltip, onHideTooltip: hideTooltip };
  const textStyle = editor.getAttributes('textStyle');
  const textColor = textStyle.color ?? DEFAULT_TEXT_COLOR;
  const highlightColor = editor.getAttributes('highlight').color;

  const button = (key, Icon, command, active = false) => (
    <ToolbarButton
      key={key}
      icon={<Icon fontSize="small" />}
      label={t(`notes.toolbar.${key}`)}
      onClick={() => command(editor.chain().focus()).run()}
      active={active}
      {...tip}
    />
  );

  // The default swatch stores nothing, so the note keeps following the editor's own colour.
  const applyTextColor = (hex) => {
    const chain = editor.chain().focus();
    (hex.toLowerCase() === DEFAULT_TEXT_COLOR ? chain.unsetColor() : chain.setColor(hex)).run();
  };
  const applyHighlight = (hex) => editor.chain().focus().setHighlight({ color: hex }).run();

  const applyLink = (href) => {
    const chain = editor.chain().focus();
    if (editor.state.selection.empty && !editor.isActive('link')) {
      // setLink on an empty selection only arms a stored mark; insert the address itself.
      chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else {
      chain.extendMarkRange('link').setLink({ href }).run();
    }
    closePopover();
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    closePopover();
  };

  return (
    <div className="note-toolbar" role="toolbar" aria-label={t('notes.toolbar.label')}>
      <div className="note-toolbar__group">
        <HeadingSelect editor={editor} {...tip} />
        <FontSizeCombo
          value={readFontSize(textStyle.fontSize)}
          onApply={(n) => editor.chain().focus().setFontSize(toCssFontSize(n)).run()}
          {...tip}
        />
      </div>

      <div className="note-toolbar__group">
        {button('bold', FormatBoldIcon, (c) => c.toggleBold(), editor.isActive('bold'))}
        {button('italic', FormatItalicIcon, (c) => c.toggleItalic(), editor.isActive('italic'))}
        {button('underline', FormatUnderlinedIcon, (c) => c.toggleUnderline(), editor.isActive('underline'))}
        {button('strike', FormatStrikethroughIcon, (c) => c.toggleStrike(), editor.isActive('strike'))}
      </div>

      <div className="note-toolbar__group">
        <ToolbarPopoverButton
          icon={<FormatColorTextIcon fontSize="small" />}
          label={t('notes.toolbar.textColor')}
          indicatorColor={textColor}
          isOpen={openPopover === 'textColor'}
          onToggle={() => togglePopover('textColor')}
          onClose={closePopover}
          {...tip}
        >
          <ColorPopover
            colors={TEXT_COLORS}
            activeHex={textColor}
            onSelect={(hex) => { applyTextColor(hex); closePopover(); }}
            onCustom={applyTextColor}
            customLabel={t('notes.toolbar.customColor')}
          />
        </ToolbarPopoverButton>
        <ToolbarPopoverButton
          icon={<BorderColorIcon fontSize="small" />}
          label={t('notes.toolbar.highlight')}
          indicatorColor={highlightColor}
          active={editor.isActive('highlight')}
          isOpen={openPopover === 'highlight'}
          onToggle={() => togglePopover('highlight')}
          onClose={closePopover}
          {...tip}
        >
          <ColorPopover
            colors={HIGHLIGHT_COLORS}
            activeHex={highlightColor}
            onSelect={(hex) => { applyHighlight(hex); closePopover(); }}
            onCustom={applyHighlight}
            onClear={() => { editor.chain().focus().unsetHighlight().run(); closePopover(); }}
            clearLabel={t('notes.toolbar.noHighlight')}
            customLabel={t('notes.toolbar.customColor')}
          />
        </ToolbarPopoverButton>
      </div>

      <div className="note-toolbar__group">
        {button('alignLeft', FormatAlignLeftIcon, (c) => c.setTextAlign('left'), editor.isActive({ textAlign: 'left' }))}
        {button('alignCenter', FormatAlignCenterIcon, (c) => c.setTextAlign('center'), editor.isActive({ textAlign: 'center' }))}
        {button('alignRight', FormatAlignRightIcon, (c) => c.setTextAlign('right'), editor.isActive({ textAlign: 'right' }))}
      </div>

      <div className="note-toolbar__group">
        {button('bulletList', FormatListBulletedIcon, (c) => c.toggleBulletList(), editor.isActive('bulletList'))}
        {button('orderedList', FormatListNumberedIcon, (c) => c.toggleOrderedList(), editor.isActive('orderedList'))}
        {button('blockquote', FormatQuoteIcon, (c) => c.toggleBlockquote(), editor.isActive('blockquote'))}
        {button('horizontalRule', HorizontalRuleIcon, (c) => c.setHorizontalRule())}
      </div>

      <div className="note-toolbar__group">
        <ToolbarPopoverButton
          icon={<LinkIcon fontSize="small" />}
          label={t('notes.toolbar.link')}
          active={editor.isActive('link')}
          isOpen={openPopover === 'link'}
          onToggle={() => togglePopover('link')}
          onClose={closePopover}
          {...tip}
        >
          <LinkPopover
            initialHref={editor.getAttributes('link').href}
            onApply={applyLink}
            onRemove={removeLink}
          />
        </ToolbarPopoverButton>
        {button('clearFormatting', FormatClearIcon, (c) => c.unsetAllMarks().clearNodes())}
      </div>

      {tooltip && createPortal(
        <div className="portal-tooltip portal-tooltip--below" style={{ top: tooltip.top, left: tooltip.left }}>
          {tooltip.text}
          <div className="portal-tooltip__arrow" />
        </div>,
        document.body,
      )}
    </div>
  );
};

export default NoteToolbar;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern=NoteToolbar`
Expected: PASS.

- [ ] **Step 5: Wire it into `NoteEditorModal.jsx`**

Delete these imports (they move to `NoteToolbar.jsx`):

```js
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatStrikethroughIcon from '@mui/icons-material/FormatStrikethrough';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import TitleIcon from '@mui/icons-material/Title';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
```

Add after `import { NOTE_EXTENSIONS } from './noteExtensions';`:

```js
import NoteToolbar from './NoteToolbar';
```

Delete the whole `const toolbarButtons = [ … ];` array (8 entries, just before `return createPortal(`).

Replace the toolbar block

```jsx
          {/* WYSIWYG Toolbar */}
          <div className="note-editor__toolbar">
            {toolbarButtons.map((btn, i) => (
              <button
                key={i}
                className={`note-editor__toolbar-btn ${btn.active ? 'note-editor__toolbar-btn--active' : ''}`}
                onClick={btn.action}
                type="button"
              >
                {btn.icon}
              </button>
            ))}
          </div>
```

with

```jsx
          <NoteToolbar editor={editor} />
```

The modal's existing `forceUpdate` on `onUpdate` / `onSelectionUpdate` keeps re-rendering the toolbar with fresh `isActive` / `getAttributes` — no new subscription needed.

- [ ] **Step 6: Give the modal-test mock editors `getAttributes`**

Both `NoteEditorModal.autosaveEcho.test.jsx` and `NoteEditorModal.saveStatus.test.jsx` build the same `mockEditor = { … }` in `beforeEach`. The toolbar now reads `editor.getAttributes(...)` on every render, so add one line after `isActive: () => false,` in both files:

```js
      getAttributes: () => ({}),
```

- [ ] **Step 7: Run all note tests**

Run: `cd warhammer-battle-helper-front && CI=true npm test -- --watchAll=false --testPathPattern="tabs/notes"`
Expected: PASS for every file under `tabs/notes/`.

- [ ] **Step 8: Lint the touched folder**

Run: `cd warhammer-battle-helper-front && npx eslint src/components/tabs/notes`
Expected: no errors (no `no-unused-vars` for the removed icons).

- [ ] **Step 9: Commit**

```bash
git add warhammer-battle-helper-front/src/components/tabs/notes/NoteToolbar.jsx warhammer-battle-helper-front/src/components/tabs/notes/NoteToolbar.test.jsx warhammer-battle-helper-front/src/components/tabs/notes/NoteEditorModal.jsx warhammer-battle-helper-front/src/components/tabs/notes/NoteEditorModal.saveStatus.test.jsx warhammer-battle-helper-front/src/components/tabs/notes/NoteEditorModal.autosaveEcho.test.jsx
git commit -m "feat: PLAYRPG-228 rich text toolbar in the note editor"
```

---

### Task 10: Styles

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/tabs/NotesTab.css` (toolbar block lines ~380-413, heading block ~439-453)
- Modify: `warhammer-battle-helper-front/src/style.css` (after the `.portal-tooltip--above .portal-tooltip__arrow` rule, ~line 4296)

**Interfaces:**
- Consumes: class names from Tasks 4, 6, 7, 8, 9.
- Produces: nothing new for code.

No automated test covers this task — it is verified in Task 11.

- [ ] **Step 1: Replace the old toolbar CSS in `NotesTab.css`**

Delete the rules `.note-editor__toolbar`, `.note-editor__toolbar-btn`, `.note-editor__toolbar-btn:hover`, `.note-editor__toolbar-btn--active` (the `/* Toolbar */` block) and put in their place:

```css
/* Toolbar */
.note-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 0;
  padding: 4px;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid #d4a574;
  border-radius: 4px;
}

/* Groups wrap as a whole, so a group never splits across two rows. */
.note-toolbar__group {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px;
  border-right: 1px solid #d4a574;
}

.note-toolbar__group:last-child {
  border-right: none;
}

.note-toolbar__btn {
  position: relative;
  background: none;
  border: 1px solid transparent;
  border-radius: 3px;
  color: #6b4423;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.note-toolbar__btn:hover {
  background: rgba(201, 151, 91, 0.2);
  border-color: #c9975b;
}

.note-toolbar__btn--active {
  background: rgba(201, 151, 91, 0.3);
  border-color: #c9975b;
  color: #3a2f1f;
}

.note-toolbar__indicator {
  position: absolute;
  left: 4px;
  right: 4px;
  bottom: 2px;
  height: 3px;
  border-radius: 1px;
}

.note-toolbar__heading,
.note-toolbar__size-input {
  height: 26px;
  background: #fff9f0;
  border: 1px solid #c4a882;
  border-radius: 3px;
  color: #3a2f1f;
  font-family: inherit;
  font-size: 12px;
}

.note-toolbar__heading:focus,
.note-toolbar__size-input:focus {
  outline: none;
  border-color: #7a5c42;
}

.note-toolbar__heading {
  padding: 0 4px;
}

.note-toolbar__anchor {
  position: relative;
  display: flex;
  align-items: center;
}

.note-toolbar__size-input {
  width: 38px;
  padding: 0 4px;
  text-align: center;
  border-radius: 3px 0 0 3px;
}

.note-toolbar__size-toggle {
  height: 26px;
  padding: 0;
  display: flex;
  align-items: center;
  background: #fff9f0;
  border: 1px solid #c4a882;
  border-left: none;
  border-radius: 0 3px 3px 0;
  color: #6b4423;
  cursor: pointer;
}

.note-toolbar__popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 10;
  margin: 0;
  padding: 8px;
  list-style: none;
  background: #fff9f0;
  border: 1px solid #c4a882;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(58, 47, 31, 0.25);
}

.note-toolbar__size-list {
  padding: 4px;
  min-width: 56px;
}

.note-toolbar__size-option {
  width: 100%;
  padding: 3px 8px;
  background: none;
  border: none;
  border-radius: 3px;
  color: #3a2f1f;
  font-family: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.note-toolbar__size-option:hover,
.note-toolbar__size-option--active {
  background: rgba(201, 151, 91, 0.25);
}

.note-toolbar__color-popover {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: max-content;
}

.note-toolbar__swatches {
  display: grid;
  grid-template-columns: repeat(4, 22px);
  gap: 6px;
}

.note-toolbar__swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid #c4a882;
  border-radius: 3px;
  cursor: pointer;
}

.note-toolbar__swatch:hover,
.note-toolbar__swatch--active {
  border-color: #7a5c42;
  box-shadow: 0 0 0 2px #c9975b;
}

.note-toolbar__custom-color {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #7a5c42;
  font-size: 12px;
  cursor: pointer;
}

.note-toolbar__custom-color input[type="color"] {
  width: 26px;
  height: 22px;
  padding: 0;
  border: 1px solid #c4a882;
  border-radius: 3px;
  background: none;
  cursor: pointer;
}

.note-toolbar__text-btn {
  padding: 3px 8px;
  background: none;
  border: 1px solid #c4a882;
  border-radius: 3px;
  color: #6b4423;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}

.note-toolbar__text-btn:hover {
  background: rgba(201, 151, 91, 0.2);
  border-color: #c9975b;
}

.note-toolbar__link-popover {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 240px;
}

.note-toolbar__link-input {
  padding: 4px 6px;
  background: #fff;
  border: 1px solid #c4a882;
  border-radius: 3px;
  color: #3a2f1f;
  font-size: 12px;
}

.note-toolbar__link-input:focus {
  outline: none;
  border-color: #7a5c42;
}

.note-toolbar__link-actions {
  display: flex;
  gap: 6px;
}
```

- [ ] **Step 2: Heading sizes and `mark` in the editor content**

Replace

```css
.note-editor__content .tiptap h2 {
  font-size: 16px;
}

.note-editor__content .tiptap h3 {
  font-size: 14px;
}
```

with

```css
/* Headings carry their own size and weight; a font-size span inside still wins. */
.note-editor__content .tiptap h1 {
  font-size: 22px;
  font-weight: 700;
}

.note-editor__content .tiptap h2 {
  font-size: 18px;
  font-weight: 700;
}

.note-editor__content .tiptap h3 {
  font-size: 15px;
  font-weight: 700;
}

.note-editor__content .tiptap mark {
  padding: 0 1px;
  border-radius: 2px;
}
```

- [ ] **Step 3: Add `.portal-tooltip--below` to `style.css`**

Insert right after the `.portal-tooltip--above .portal-tooltip__arrow { … }` rule (it must come after the base `.portal-tooltip` rule, or the base transform wins):

```css
.portal-tooltip--below {
  transform: translateX(-50%);
  margin-left: 0;
  margin-top: 10px;
  animation: portalTooltipBelowFadeIn 0.15s ease-out;
}

@keyframes portalTooltipBelowFadeIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.portal-tooltip--below .portal-tooltip__arrow {
  right: auto;
  bottom: auto;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-bottom-color: #c9975b;
}
```

- [ ] **Step 4: Confirm no reference to the deleted classes remains**

Run: `cd warhammer-battle-helper-front && grep -rn "note-editor__toolbar" src`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/components/tabs/NotesTab.css warhammer-battle-helper-front/src/style.css
git commit -m "feat: PLAYRPG-228 note toolbar, popover and heading styles"
```

---

### Task 11: Full verification and browser check

**Files:**
- Possibly modify: `warhammer-battle-helper-backend/internal/service/note_html_policy_test.go` (fixtures from real output)

- [ ] **Step 1: Full test runs**

```bash
cd warhammer-battle-helper-backend && go test ./...
cd ../warhammer-battle-helper-front && CI=true npm test -- --watchAll=false
```

Expected: Go all `ok`. Frontend: everything passes except the known `App.test.js` axios ESM baseline failure.

- [ ] **Step 2: Restart the stack with the new npm deps (user runs this)**

The frontend container keeps `node_modules` in an anonymous volume; without renewing it the new Tiptap packages are missing. Ask the user to run from the repo root:

```bash
docker compose up -d --build --renew-anon-volumes
```

(The agent shell's container rebuild hangs on the keychain credential helper — do not run it yourself.)

- [ ] **Step 3: Compare real Tiptap output with the Go fixtures**

In the browser at `http://localhost:3000`, open a note and apply: red text + size 18 on one word, a yellow highlight, center alignment, H1 with right alignment, a link to `example.com`. In DevTools console run:

```js
document.querySelector('.note-editor__content .tiptap').innerHTML
```

Every fragment must match a "kept unchanged" input in `note_html_policy_test.go` byte for byte (attribute order, `; ` separators, `color: inherit`). If any differs, replace that test input with the real string, rerun `go test ./internal/service/ -run TestNoteHTMLPolicy`, and fix the policy if it now strips something.

- [ ] **Step 4: Two-player scenario**

Two browsers (or one normal + one private window), two users in the same game, a public note:
1. A applies colour, size 18, H1, highlight, center, a link → B sees all of it after the WS update.
2. A reloads the page → formatting is still there (it survived bluemonday).
3. A types an out-of-range size `100` → field shows `72`, text grows to 72 px.
4. A picks the default text colour on red text → colour disappears; `innerHTML` has no `color:` for it.

- [ ] **Step 5: Layout checks**

- Shrink the note window to its minimum width (320 px): groups wrap to new rows, none splits in the middle.
- Shrink the window height to the minimum and open the colour popover: it stays reachable (the body scrolls). Note the result for the report.
- Hover several buttons: tooltip below the button, arrow pointing up, not hidden behind the window.
- Open the link popover and click the trigger again: it closes and does not reopen.

- [ ] **Step 6: Commit fixture updates, if any**

```bash
git add warhammer-battle-helper-backend/internal/service/note_html_policy_test.go
git commit -m "test: PLAYRPG-228 sanitizer fixtures from real Tiptap output"
```

- [ ] **Step 7: Report**

List: tests run and results, browser checks done and any that were not, plus anything that behaved differently from this plan.
