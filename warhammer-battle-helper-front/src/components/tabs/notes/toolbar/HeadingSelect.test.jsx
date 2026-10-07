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
