import React, { useEffect, useRef, useState } from 'react';
// @tiptap/react re-exports @tiptap/core, which is not a direct dependency.
import { useEditor, EditorContent, createDocument } from '@tiptap/react';
import { RICH_TEXT_EXTENSIONS } from './richTextExtensions';
import RichTextToolbar from './RichTextToolbar';

// A self-contained styled text box: the shared formatting toolbar over a Tiptap editor. The
// editor is uncontrolled, so `value` is pushed into it only when it describes a different document
// than the editor already holds — otherwise the echo of every keystroke would reset the caret.
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
    // Compare documents, not HTML strings: the backend sanitizer escapes text differently
    // (`'` -> `&#39;`, `&nbsp;` -> U+00A0), so the echo of a save is a different string
    // describing the same document. '' parses to the same empty paragraph the editor holds.
    if (createDocument(next, editor.schema).eq(editor.state.doc)) return;
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
