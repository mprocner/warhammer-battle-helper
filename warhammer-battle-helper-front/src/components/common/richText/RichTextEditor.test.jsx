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
