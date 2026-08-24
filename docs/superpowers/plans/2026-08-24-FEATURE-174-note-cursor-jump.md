# FEATURE-174 — Kursor zostaje na miejscu po autozapisie notatki — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Autozapis notatki przestaje podmieniać dokument w edytorze, więc karetka zostaje tam, gdzie użytkownik pisze.

**Architecture:** Prop `note` w `NoteEditorModal` niesie dziś dwa nierozróżnialne rodzaje zdarzeń — echo własnego zapisu (odpowiedź HTTP) i zmianę zdalną (WS od innego gracza). Rozdzielamy je po stemplu `updatedAt` nadanym przez serwer: echo nie dotyka edytora w ogóle, zmiana zdalna wchodzi z odtworzeniem selekcji, a wszystko przychodzące w trakcie pisania jest odrzucane. Decyzja siedzi w czystej funkcji w `src/utils/`, żeby dała się przetestować bez ProseMirror.

**Tech Stack:** React 18, TipTap v3 (`@tiptap/react ^3.22.3`), Jest + React Testing Library (CRA `react-scripts test`), Go + Gin backend (bez zmian).

Spec: `docs/superpowers/specs/2026-08-24-FEATURE-174-note-cursor-jump-design.md`

## Global Constraints

- Backend nie jest ruszany. Żadnych zmian w `NoteService.go` ani w modelach.
- Wszystkie komendy uruchamiane z katalogu `warhammer-battle-helper-front`.
- TipTap v3: `setContent(content, options)` — drugi argument to **obiekt opcji**, a `emitUpdate` domyślnie `true`. Przekazanie `false` (sygnatura v2) nie wyłącza zdarzenia.
- Brak nowych stringów UI, więc `src/locales/en|pl/translation.json` nie są ruszane.
- Znany baseline testów: `src/App.test.js` wywala się na ESM w axiosie. To nie jest regresja tej zmiany.
- Komentarze w nowym kodzie: JSDoc po angielsku w `src/utils/` (jak `appendUnique.js`), komentarze inline w komponentach po polsku (jak reszta `NoteEditorModal.jsx`).

---

### Task 1: Czysta decyzja — `shouldApplyRemoteNote`

**Files:**
- Create: `src/utils/noteSync.js`
- Test: `src/utils/noteSync.test.js`

**Interfaces:**
- Consumes: nic.
- Produces: `shouldApplyRemoteNote({ incomingUpdatedAt, ownSaveStamp, isDirty }) => boolean`, gdzie `incomingUpdatedAt: string`, `ownSaveStamp: string|null`, `isDirty: boolean`. Używane przez Task 2.

- [ ] **Step 1: Write the failing test**

Create `src/utils/noteSync.test.js`:

```js
import { shouldApplyRemoteNote } from './noteSync';

const STAMP_MINE = '2026-08-24T10:00:02.000000002Z';
const STAMP_THEIRS = '2026-08-24T10:00:09.000000009Z';

describe('shouldApplyRemoteNote', () => {
  it('rejects the echo of our own save', () => {
    expect(shouldApplyRemoteNote({
      incomingUpdatedAt: STAMP_MINE,
      ownSaveStamp: STAMP_MINE,
      isDirty: false,
    })).toBe(false);
  });

  it('rejects a remote revision while the user is still typing', () => {
    expect(shouldApplyRemoteNote({
      incomingUpdatedAt: STAMP_THEIRS,
      ownSaveStamp: STAMP_MINE,
      isDirty: true,
    })).toBe(true === false);
  });

  it('accepts a remote revision when the editor is idle', () => {
    expect(shouldApplyRemoteNote({
      incomingUpdatedAt: STAMP_THEIRS,
      ownSaveStamp: STAMP_MINE,
      isDirty: false,
    })).toBe(true);
  });

  it('accepts the first revision when nothing has been saved from this editor yet', () => {
    expect(shouldApplyRemoteNote({
      incomingUpdatedAt: STAMP_THEIRS,
      ownSaveStamp: null,
      isDirty: false,
    })).toBe(true);
  });

  it('accepts a remote revision that happens to carry no stamp', () => {
    expect(shouldApplyRemoteNote({
      incomingUpdatedAt: undefined,
      ownSaveStamp: null,
      isDirty: false,
    })).toBe(true);
  });
});
```

Uwaga do drugiego testu: `toBe(true === false)` to celowo zapisane `false` — jeśli wolisz, wpisz wprost `.toBe(false)`. Sens: brudny edytor odrzuca wszystko.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd warhammer-battle-helper-front
CI=true npx react-scripts test --watchAll=false --testPathPattern=noteSync
```

Expected: FAIL — `Cannot find module './noteSync' from 'src/utils/noteSync.test.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/noteSync.js`:

```js
/**
 * Decides whether an incoming note revision should be applied to an open editor.
 *
 * The `note` prop of NoteEditorModal carries two kinds of events that look identical:
 * the echo of our own autosave (the HTTP response, sanitized server-side so its HTML
 * never matches the editor byte for byte) and a genuine remote edit broadcast over
 * WebSocket. Applying the echo replaces the ProseMirror document and throws the caret
 * to the end of the note, which is the bug this guard exists to prevent.
 *
 * Revisions arriving while the user is still typing are dropped too: our own pending
 * save is about to overwrite the server anyway, so applying them would only destroy
 * characters typed in the last second.
 *
 * @param {object} params
 * @param {string|undefined} params.incomingUpdatedAt server stamp of the incoming revision
 * @param {string|null} params.ownSaveStamp server stamp returned by our last save
 * @param {boolean} params.isDirty true while an autosave is pending or in flight
 * @returns {boolean} true when the revision is a genuine remote change worth showing
 */
export const shouldApplyRemoteNote = ({ incomingUpdatedAt, ownSaveStamp, isDirty }) => {
  if (ownSaveStamp && incomingUpdatedAt === ownSaveStamp) return false;
  if (isDirty) return false;
  return true;
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd warhammer-battle-helper-front
CI=true npx react-scripts test --watchAll=false --testPathPattern=noteSync
```

Expected: PASS, `Tests: 5 passed`

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/noteSync.js warhammer-battle-helper-front/src/utils/noteSync.test.js
git commit -m "feat(front): FEATURE-174 shouldApplyRemoteNote guard"
```

---

### Task 2: Echo własnego zapisu nie dotyka edytora

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/tabs/NotesTab.jsx:186-206` (`handleSave` zwraca zapisaną notatkę)
- Modify: `warhammer-battle-helper-front/src/components/tabs/notes/NoteEditorModal.jsx` (refy stempla i zapisu, `doAutoSave`, `isDirty`, efekt sync)
- Test: `warhammer-battle-helper-front/src/components/tabs/notes/NoteEditorModal.autosaveEcho.test.jsx`

**Interfaces:**
- Consumes: `shouldApplyRemoteNote` z Task 1.
- Produces: `onSave` (czyli `NotesTab.handleSave`) zwraca `Promise<Note>` — obiekt z co najmniej `{ id: string, updatedAt: string }`. Task 3 opiera się na tym, że efekt sync woła jedną funkcję aplikującą treść zdalną.

- [ ] **Step 1: Write the failing test**

Create `src/components/tabs/notes/NoteEditorModal.autosaveEcho.test.jsx`:

```jsx
import React from 'react';
import { render, act, fireEvent } from '@testing-library/react';
import '../../../i18n';
import { WindowManagerProvider } from '../../../contexts/WindowManagerContext';
import NoteEditorModal from './NoteEditorModal';

// TipTap ciągnie ProseMirror i realny DOM edytora — do tego testu wystarczy atrapa,
// bo sprawdzamy wyłącznie CZY doszło do podmiany dokumentu, nie JAK wygląda.
let mockEditor;
jest.mock('@tiptap/starter-kit', () => ({ __esModule: true, default: {} }));
jest.mock('@tiptap/react', () => ({
  __esModule: true,
  useEditor: () => mockEditor,
  EditorContent: () => null,
}));

const STAMP_OPEN = '2026-08-24T10:00:00.000000001Z';
const STAMP_SAVED = '2026-08-24T10:00:02.000000002Z';

const noteAt = (updatedAt, content) => ({
  id: 'n-1',
  title: 'Notatka',
  content,
  isPrivate: true,
  updatedAt,
  creatorId: 'u-1',
});

const renderEditor = (note, onSave) =>
  render(
    <WindowManagerProvider>
      <NoteEditorModal
        isOpen
        note={note}
        windowKey="note-n-1"
        onClose={() => {}}
        onSave={onSave}
      />
    </WindowManagerProvider>
  );

const editorWith = (note, onSave) => (
  <WindowManagerProvider>
    <NoteEditorModal
      isOpen
      note={note}
      windowKey="note-n-1"
      onClose={() => {}}
      onSave={onSave}
    />
  </WindowManagerProvider>
);

describe('NoteEditorModal — echo autozapisu', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockEditor = {
      getHTML: jest.fn(() => '<p>tekst</p>'),
      commands: { setContent: jest.fn(), setTextSelection: jest.fn() },
      isFocused: true,
      state: { selection: { from: 3 }, doc: { content: { size: 50 } } },
      isActive: () => false,
      chain: () => ({ focus: () => ({ run: () => {} }) }),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not touch the document when our own save echoes back', async () => {
    const onSave = jest.fn().mockResolvedValue(noteAt(STAMP_SAVED, '<p>tekst</p>'));
    const { rerender } = renderEditor(noteAt(STAMP_OPEN, '<p>tekst</p>'), onSave);

    const callsAfterMount = mockEditor.commands.setContent.mock.calls.length;

    // Zmiana tytułu planuje autozapis tą samą ścieżką co pisanie w treści.
    fireEvent.change(document.querySelector('.note-editor__input'), {
      target: { value: 'Notatka po edycji' },
    });

    await act(async () => {
      jest.advanceTimersByTime(1500);
    });

    expect(onSave).toHaveBeenCalledTimes(1);

    // Serwer sanityzuje HTML, więc echo wraca z inną treścią niż wysłana.
    rerender(editorWith(noteAt(STAMP_SAVED, '<p>tekst po sanitizerze</p>'), onSave));

    expect(mockEditor.commands.setContent.mock.calls.length).toBe(callsAfterMount);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd warhammer-battle-helper-front
CI=true npx react-scripts test --watchAll=false --testPathPattern=autosaveEcho
```

Expected: FAIL — liczba wywołań `setContent` urosła o 1 (`expected 1, received 2` lub podobnie), bo echo aplikuje treść.

- [ ] **Step 3: Make `handleSave` return the saved note**

W `src/components/tabs/NotesTab.jsx` zamień całe `handleSave` na:

```jsx
  const handleSave = useCallback(async (editor, data) => {
    try {
      if (editor.noteId) {
        const updated = await updateNote(gameId, editor.noteId, data);
        setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
        return updated;
      }
      const created = await createNote(gameId, data);
      // Powiąż edytor z utworzoną notatką (kolejne zapisy = update)
      setOpenEditors(prev => prev.map(e => e.key === editor.key ? { ...e, noteId: created.id } : e));
      // Prepend locally — consistent with backend AddNoteToOrder ($position: 0)
      setNotes(prev => [created, ...prev]);
      return created;
    } catch (err) {
      console.error('Failed to save note:', err);
      throw err;
    }
  }, [gameId]);
```

- [ ] **Step 4: Add the stamp refs and the dirty predicate**

W `src/components/tabs/notes/NoteEditorModal.jsx` dodaj import:

```jsx
import { shouldApplyRemoteNote } from '../../../utils/noteSync';
```

W bloku refów autozapisu (obok `prevNoteIdRef`) dodaj:

```jsx
  const ownSaveStampRef = useRef(null); // updatedAt ostatniego zapisu z tego edytora
  const isSavingRef = useRef(false);    // lustro isSaving — state bywa stale w domknięciu
```

Pod `scheduleAutoSave` dodaj predykat:

```jsx
  // „Brudny" = użytkownik pisze właśnie teraz: tyka debounce albo leci request.
  const isDirty = useCallback(() => autoSaveTimerRef.current !== null || isSavingRef.current, []);
```

- [ ] **Step 5: Record the server stamp in `doAutoSave`**

Zamień całe `doAutoSave` na:

```jsx
  const doAutoSave = useCallback(async () => {
    autoSaveTimerRef.current = null;
    const currentTitle = titleRef.current;
    if (!currentTitle.trim()) return;
    const content = editorRef.current?.getHTML() || '';
    isSavingRef.current = true;
    setIsSaving(true);
    setSaveError('');
    try {
      const saved = await onSaveRef.current({
        title: currentTitle.trim(),
        content,
        isPrivate: isPrivateRef.current,
      });
      if (saved) {
        // Stempel serwera — po nim rozpoznamy echo własnego zapisu, gdy wróci propem.
        ownSaveStampRef.current = saved.updatedAt;
        // Pierwszy zapis nowej notatki: przypisz id od razu, żeby przyjście propu
        // nie wyglądało na otwarcie nowego dokumentu (reset pozycji okna).
        prevNoteIdRef.current = saved.id;
      }
    } catch {
      setSaveError(t('notes.updateError'));
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [t]);
```

Kolejność ma znaczenie: refy są ustawiane synchronicznie zaraz po `await`, a `setNotes` w rodzicu leci jeszcze przed rozwiązaniem promisy — React planuje render poza bieżącym mikrozadaniem, więc efekt sync zobaczy już zaktualizowane refy.

- [ ] **Step 6: Gate the sync effect**

W efekcie sync (`useEffect` zaczynający się od `if (!isOpen)`) zamień gałąź `if (note) { ... }` na:

```jsx
    if (note) {
      const isNewNote = note.id !== prevNoteIdRef.current;
      prevNoteIdRef.current = note.id;

      if (isNewNote) {
        setPosition({ x: Math.max(50, window.innerWidth / 2 - 450) + index * 30, y: 50 + index * 30 });
        setIsMinimized(false);
      }

      // Echo własnego zapisu oraz zmiany przychodzące w trakcie pisania nie ruszają formularza.
      const applies = shouldApplyRemoteNote({
        incomingUpdatedAt: note.updatedAt,
        ownSaveStamp: ownSaveStampRef.current,
        isDirty: isDirty(),
      });
      if (!applies) return;

      if (note.title !== titleRef.current) {
        setTitle(note.title || '');
      }
      if (editor && note.content !== editor.getHTML()) {
        setEditorContent(note.content || '');
      }

      setIsPrivate(note.isPrivate ?? true);
      setSaveError('');
    } else {
```

Rozszerz gałąź `if (!isOpen)` o zerowanie stempla:

```jsx
    if (!isOpen) {
      prevNoteIdRef.current = null;
      ownSaveStampRef.current = null;
      return;
    }
```

Dopisz `isDirty` do tablicy zależności efektu:

```jsx
  }, [isOpen, note, editor, setEditorContent, index, isDirty]);
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
cd warhammer-battle-helper-front
CI=true npx react-scripts test --watchAll=false --testPathPattern=autosaveEcho
```

Expected: PASS, `Tests: 1 passed`

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src/components/tabs/NotesTab.jsx \
        warhammer-battle-helper-front/src/components/tabs/notes/NoteEditorModal.jsx \
        warhammer-battle-helper-front/src/components/tabs/notes/NoteEditorModal.autosaveEcho.test.jsx
git commit -m "fix(front): FEATURE-174 autosave echo no longer replaces the note document"
```

---

### Task 3: Zmiana zdalna wchodzi z zachowaniem karetki

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/tabs/notes/NoteEditorModal.jsx` (zamiana `setEditorContent` na `applyRemoteContent`, usunięcie `isProgrammaticUpdateRef`)
- Test: `warhammer-battle-helper-front/src/components/tabs/notes/NoteEditorModal.autosaveEcho.test.jsx` (nowy przypadek w istniejącym `describe`)

**Interfaces:**
- Consumes: `shouldApplyRemoteNote` (Task 1), gating efektu sync (Task 2).
- Produces: `applyRemoteContent(content: string)` — jedyna ścieżka wgrywania treści do edytora w tym komponencie.

- [ ] **Step 1: Write the failing test**

Dopisz w `NoteEditorModal.autosaveEcho.test.jsx`, wewnątrz istniejącego `describe`:

```jsx
  it('applies a remote revision and puts the caret back where it was', () => {
    const onSave = jest.fn().mockResolvedValue(noteAt(STAMP_SAVED, '<p>tekst</p>'));
    const { rerender } = renderEditor(noteAt(STAMP_OPEN, '<p>tekst</p>'), onSave);

    mockEditor.commands.setContent.mockClear();
    mockEditor.commands.setTextSelection.mockClear();

    const remote = { ...noteAt(STAMP_SAVED, '<p>zdalne</p>'), updatedAt: '2026-08-24T10:00:09.000000009Z' };
    rerender(editorWith(remote, onSave));

    expect(mockEditor.commands.setContent).toHaveBeenCalledWith('<p>zdalne</p>', { emitUpdate: false });
    expect(mockEditor.commands.setTextSelection).toHaveBeenCalledWith(3);
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd warhammer-battle-helper-front
CI=true npx react-scripts test --watchAll=false --testPathPattern=autosaveEcho
```

Expected: FAIL — `setContent` dostał `('<p>zdalne</p>', false)` zamiast obiektu opcji, a `setTextSelection` nie został wywołany w ogóle.

- [ ] **Step 3: Replace `setEditorContent` with `applyRemoteContent`**

W `NoteEditorModal.jsx` usuń całą funkcję `setEditorContent` wraz z jej komentarzem i wstaw w to miejsce:

```jsx
  // Wgraj treść do edytora, zachowując pozycję karetki. Selekcję odtwarzamy tylko
  // wtedy, gdy edytor miał focus — inaczej ukradlibyśmy kursor z pola tytułu.
  const applyRemoteContent = useCallback((content) => {
    const ed = editorRef.current;
    if (!ed) return;
    const next = content || '';
    if (next === ed.getHTML()) return;
    const hadFocus = ed.isFocused;
    const { from } = ed.state.selection;
    ed.commands.setContent(next, { emitUpdate: false });
    if (hadFocus) {
      // Zdalna wersja bywa krótsza — pozycja musi zmieścić się w nowym dokumencie.
      ed.commands.setTextSelection(Math.min(from, ed.state.doc.content.size));
    }
  }, []);
```

- [ ] **Step 4: Point both call sites at the new function**

W efekcie sync, gałąź `if (note)` — zamień warunek na wywołanie bez porównywania treści (`applyRemoteContent` sam sprawdza, czy jest co zmieniać):

```jsx
      applyRemoteContent(note.content);
```

W gałęzi tworzenia notatki (`else`) zamień `setEditorContent('')` na:

```jsx
      applyRemoteContent('');
```

Zaktualizuj tablicę zależności efektu:

```jsx
  }, [isOpen, note, editor, applyRemoteContent, index, isDirty]);
```

- [ ] **Step 5: Delete the now-redundant update gate**

Usuń trzy miejsca związane z `isProgrammaticUpdateRef`:

1. deklarację refu wraz z komentarzem:

```jsx
  const isProgrammaticUpdateRef = useRef(false); // gate: prevent setContent from triggering auto-save
```

2. dwie linie w `onUpdate` konfiguracji `useEditor` — `onUpdate` ma po zmianie wyglądać tak:

```jsx
    onUpdate: () => {
      forceUpdate(n => n + 1);
      scheduleAutoSave();
    },
```

3. ustawienia flagi wokół `setContent` — zniknęły razem z `setEditorContent` w kroku 3.

Ref był potrzebny, bo `setContent(content, false)` w TipTap v3 nie wyłączało `onUpdate` (drugi argument to obiekt opcji, `emitUpdate` domyślnie `true`). Po przejściu na `{ emitUpdate: false }` zdarzenie nie leci i gate nie ma czego pilnować.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd warhammer-battle-helper-front
CI=true npx react-scripts test --watchAll=false --testPathPattern=autosaveEcho
```

Expected: PASS, `Tests: 2 passed`

- [ ] **Step 7: Commit**

```bash
git add warhammer-battle-helper-front/src/components/tabs/notes/NoteEditorModal.jsx \
        warhammer-battle-helper-front/src/components/tabs/notes/NoteEditorModal.autosaveEcho.test.jsx
git commit -m "fix(front): FEATURE-174 remote note edits keep the caret in place"
```

---

### Task 4: Weryfikacja całości

**Files:**
- Modify: żadnych (chyba że coś wyjdzie)

**Interfaces:**
- Consumes: Task 1–3.
- Produces: nic.

- [ ] **Step 1: Run the full frontend suite**

```bash
cd warhammer-battle-helper-front
CI=true npx react-scripts test --watchAll=false
```

Expected: wszystko zielone **poza** `src/App.test.js`, który wywala się na ESM w axiosie — to znany baseline repo, nie regresja tej zmiany. Jeśli pada cokolwiek innego, zatrzymaj się i zgłoś.

- [ ] **Step 2: Check for unused leftovers**

```bash
cd warhammer-battle-helper-front
grep -n "isProgrammaticUpdateRef\|setEditorContent" src/components/tabs/notes/NoteEditorModal.jsx
```

Expected: brak wyników. Jeśli coś zostało — usuń i dołóż do commita z Task 3.

- [ ] **Step 3: Manual verification on the local stack**

1. Podnieś stack (`docker compose up`), zaloguj się, wejdź do gry, zakładka Notatki.
2. Otwórz długą notatkę (kilkanaście akapitów), postaw kursor w środku pierwszego akapitu.
3. Pisz przez co najmniej trzy cykle autozapisu (30+ sekund). Karetka i przewinięcie zostają na miejscu, wskaźnik zapisu mruga jak dotąd.
4. Utwórz nową notatkę, wpisz tytuł i treść, poczekaj na pierwszy autozapis. Okno nie skacze na pozycję startową.
5. W drugiej przeglądarce (inny użytkownik) edytuj tę samą **publiczną** notatkę. Pierwszy użytkownik widzi zmianę, gdy przestanie pisać; kursor nie ucieka na koniec.

- [ ] **Step 4: Final commit if anything changed**

```bash
git status --short
```

Jeśli drzewo jest czyste — nic do zrobienia. Jeśli nie, zacommituj poprawki z opisem `fix(front): FEATURE-174 <co>`.
