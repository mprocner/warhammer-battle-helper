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

  it('applies a custom text colour without stealing focus from the chooser', () => {
    const editor = renderToolbar();
    fireEvent.click(btn('Text color'));
    fireEvent.change(screen.getByLabelText('Custom color'), { target: { value: '#123456' } });
    expect(editor.calls).toEqual([['setColor', '#123456']]);
    expect(btn('Red')).toBeInTheDocument();
  });

  it('applies a custom highlight without stealing focus from the chooser', () => {
    const editor = renderToolbar();
    fireEvent.click(btn('Highlight'));
    fireEvent.change(screen.getByLabelText('Custom color'), { target: { value: '#123456' } });
    expect(editor.calls).toEqual([['setHighlight', { color: '#123456' }]]);
    expect(btn('Yellow')).toBeInTheDocument();
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
