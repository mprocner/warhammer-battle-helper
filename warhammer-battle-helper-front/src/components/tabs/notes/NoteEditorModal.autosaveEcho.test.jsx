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

const renderEditor = (note, onSave) => render(editorWith(note, onSave));

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
