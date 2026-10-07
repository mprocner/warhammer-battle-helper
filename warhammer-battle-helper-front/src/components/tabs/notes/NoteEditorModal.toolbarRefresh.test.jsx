import React from 'react';
import { render, act, screen } from '@testing-library/react';
import '../../../i18n';
import { WindowManagerProvider } from '../../../contexts/WindowManagerContext';
import NoteEditorModal from './NoteEditorModal';

// useEditor is mocked so the test can grab the options the modal passes in and fire
// the editor callbacks by hand.
let mockEditor;
let mockOptions;
jest.mock('./noteExtensions', () => ({ NOTE_EXTENSIONS: [] }));
jest.mock('@tiptap/react', () => ({
  __esModule: true,
  useEditor: (options) => { mockOptions = options; return mockEditor; },
  EditorContent: () => null,
}));

describe('NoteEditorModal — toolbar refresh', () => {
  let textStyle;
  beforeEach(() => {
    textStyle = {};
    mockEditor = {
      getHTML: jest.fn(() => '<p>x</p>'),
      commands: { setContent: jest.fn(), setTextSelection: jest.fn() },
      isFocused: true,
      state: { selection: { from: 1, empty: true }, doc: { content: { size: 5 } } },
      isActive: () => false,
      getAttributes: (name) => (name === 'textStyle' ? textStyle : {}),
      chain: () => ({ focus: () => ({ run: () => {} }) }),
    };
  });

  it('re-renders the toolbar on a transaction that does not move the selection', () => {
    render(
      <WindowManagerProvider>
        <NoteEditorModal isOpen note={null} windowKey="k" onClose={() => {}} onSave={jest.fn()} />
      </WindowManagerProvider>
    );
    const sizeInput = () => screen.getByRole('textbox', { name: 'Font size' });
    expect(sizeInput()).toHaveValue('');

    // A stored mark on a collapsed caret changes attributes without a selection update.
    textStyle = { fontSize: '18px' };
    act(() => { mockOptions.onTransaction(); });

    expect(sizeInput()).toHaveValue('18');
  });
});
