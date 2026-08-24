import React from 'react';
import { render, act, fireEvent } from '@testing-library/react';
import '../../../i18n';
import { WindowManagerProvider } from '../../../contexts/WindowManagerContext';
import NoteEditorModal from './NoteEditorModal';

// Ta sama atrapa TipTapa co w NoteEditorModal.autosaveEcho.test.jsx — tu interesuje
// nas wyłącznie nagłówek, więc realny edytor byłby tylko kosztem.
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

const status = () => document.querySelector('.note-editor__save-status');

describe('NoteEditorModal — wskaźnik zapisu w nagłówku', () => {
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

  it('keeps the status slot in the header instead of a strip at the bottom of the body', () => {
    render(editorWith(noteAt(STAMP_OPEN, '<p>tekst</p>'), jest.fn()));

    expect(document.querySelector('.modal-header .note-editor__save-status')).not.toBeNull();
    expect(document.querySelector('.note-editor__autosave-indicator')).toBeNull();
  });

  it('stays idle on open — both for an existing note and a brand new one', () => {
    const { rerender } = render(editorWith(null, jest.fn()));
    expect(status().dataset.state).toBe('idle');

    rerender(editorWith(noteAt(STAMP_OPEN, '<p>tekst</p>'), jest.fn()));
    expect(status().dataset.state).toBe('idle');
  });

  it('shows the saving state while the autosave request is in flight', async () => {
    let resolveSave;
    const onSave = jest.fn(() => new Promise(resolve => { resolveSave = resolve; }));
    render(editorWith(noteAt(STAMP_OPEN, '<p>tekst</p>'), onSave));

    fireEvent.change(document.querySelector('.note-editor__input'), {
      target: { value: 'Notatka po edycji' },
    });
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });

    expect(status().dataset.state).toBe('saving');

    await act(async () => {
      resolveSave(noteAt(STAMP_SAVED, '<p>tekst</p>'));
    });

    expect(status().dataset.state).toBe('saved');
  });

  it('fades the confirmation back to idle a moment after the save', async () => {
    const onSave = jest.fn().mockResolvedValue(noteAt(STAMP_SAVED, '<p>tekst</p>'));
    render(editorWith(noteAt(STAMP_OPEN, '<p>tekst</p>'), onSave));

    fireEvent.change(document.querySelector('.note-editor__input'), {
      target: { value: 'Notatka po edycji' },
    });
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });

    expect(status().dataset.state).toBe('saved');

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(status().dataset.state).toBe('idle');
  });

  it('keeps a second save from cutting the previous confirmation short', async () => {
    const onSave = jest.fn().mockResolvedValue(noteAt(STAMP_SAVED, '<p>tekst</p>'));
    render(editorWith(noteAt(STAMP_OPEN, '<p>tekst</p>'), onSave));

    const input = document.querySelector('.note-editor__input');

    fireEvent.change(input, { target: { value: 'Pierwsza zmiana' } });
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });

    // Drugi zapis 1s po pierwszym — jego własne okno potwierdzenia startuje od nowa.
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    fireEvent.change(input, { target: { value: 'Druga zmiana' } });
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });

    expect(status().dataset.state).toBe('saved');

    // Gdyby timer pierwszego zapisu nie został skasowany, tu byłoby już 'idle'.
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(status().dataset.state).toBe('saved');
  });

  it('reports a failed save through the same slot, with the message in the tooltip', async () => {
    const onSave = jest.fn().mockRejectedValue(new Error('boom'));
    render(editorWith(noteAt(STAMP_OPEN, '<p>tekst</p>'), onSave));

    fireEvent.change(document.querySelector('.note-editor__input'), {
      target: { value: 'Notatka po edycji' },
    });
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });

    expect(status().dataset.state).toBe('error');
    expect(status().getAttribute('title')).toBeTruthy();
    // Błąd nie ma już własnego paska na dole okna.
    expect(document.querySelector('.note-editor__error')).toBeNull();
  });
});
