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
  // setContent replaces the document object, so an unchanged identity proves no reset happened.
  const docBefore = editor.state.doc;
  rerender(<RichTextEditor value={editor.getHTML()} onChange={() => {}} />);
  expect(editor.state.doc).toBe(docBefore);
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

test('the sanitized echo of its own edit does not reset the editor', () => {
  // The backend sanitizer escapes quotes as entities, so the saved HTML comes back as a different
  // string describing the same document; that must not count as a new value.
  const { container, rerender } = render(<RichTextEditor value="" onChange={() => {}} />);
  const editor = editorIn(container);
  act(() => { editor.commands.insertContent("don't"); });
  const docBefore = editor.state.doc;
  // A JS string, not a JSX attribute string: JSX would decode the entity before the editor saw it.
  rerender(<RichTextEditor value={'<p>don&#39;t</p>'} onChange={() => {}} />);
  expect(editor.state.doc).toBe(docBefore);
});

test('an empty value matches an empty editor', () => {
  const { container, rerender } = render(<RichTextEditor value="<p></p>" onChange={() => {}} />);
  const editor = editorIn(container);
  const docBefore = editor.state.doc;
  rerender(<RichTextEditor value="" onChange={() => {}} />);
  expect(editor.state.doc).toBe(docBefore);
});

test('a focused editor keeps its caret when an outside value replaces the content', () => {
  const { container, rerender } = render(<RichTextEditor value="<p>abcdefghij</p>" onChange={() => {}} />);
  const editor = editorIn(container);
  act(() => { editor.commands.setTextSelection(3); });
  editor.isFocused = true;
  rerender(<RichTextEditor value="<p>abcdefghijXYZ</p>" onChange={() => {}} />);
  expect(editor.state.selection.from).toBe(3);
});

test('a focused editor clamps its caret into a shorter outside value', () => {
  const { container, rerender } = render(<RichTextEditor value="<p>abcdefghij</p>" onChange={() => {}} />);
  const editor = editorIn(container);
  act(() => { editor.commands.setTextSelection(11); });
  editor.isFocused = true;
  rerender(<RichTextEditor value="<p>ab</p>" onChange={() => {}} />);
  expect(editor.getText()).toBe('ab');
  expect(editor.state.selection.from).toBeLessThanOrEqual(editor.state.doc.content.size);
});

test('an unfocused editor does not restore its caret', () => {
  const { container, rerender } = render(<RichTextEditor value="<p>abcdefghij</p>" onChange={() => {}} />);
  const editor = editorIn(container);
  act(() => { editor.commands.setTextSelection(3); });
  editor.isFocused = false;
  rerender(<RichTextEditor value="<p>abcdefghijXYZ</p>" onChange={() => {}} />);
  expect(editor.getText()).toBe('abcdefghijXYZ');
  expect(editor.state.selection.from).not.toBe(3);
});
