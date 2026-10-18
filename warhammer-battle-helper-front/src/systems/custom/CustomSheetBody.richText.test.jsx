/* eslint-disable testing-library/no-node-access, testing-library/no-container */
import React from 'react';
import { render, act, screen, within } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

const sectionsWith = (field) => [{ id: 's', title: '', columns: 2, fields: [field] }];
const rich = { key: 'bio', type: 'text_long', label: 'Bio', richText: true };
const plain = { key: 'bio', type: 'text_long', label: 'Bio' };

test('a styled long text shows the toolbar and the stored HTML, no textarea', () => {
  const { container } = render(
    <CustomSheetBody sections={sectionsWith(rich)} values={{ texts: { bio: '<p>Hi <strong>there</strong></p>' } }} onChange={{ text: jest.fn() }} />,
  );
  expect(screen.getByRole('toolbar')).toBeInTheDocument();
  expect(container.querySelector('textarea')).toBeNull();
  expect(container.querySelector('.custom-sheet__rich-text strong').textContent).toBe('there');
  expect(container.querySelector('.custom-sheet__cell--rows-4')).not.toBeNull();
});

test('plain text saved before the flag was on opens as one paragraph per line', () => {
  const { container } = render(
    <CustomSheetBody sections={sectionsWith(rich)} values={{ texts: { bio: 'one\ntwo' } }} onChange={{ text: jest.fn() }} />,
  );
  const paragraphs = container.querySelectorAll('.tiptap p');
  expect([...paragraphs].map((p) => p.textContent)).toEqual(['one', 'two']);
});

test('an edit in the styled field saves HTML through onChange.text', () => {
  const text = jest.fn();
  const { container } = render(
    <CustomSheetBody sections={sectionsWith(rich)} values={{ texts: { bio: '<p>a</p>' } }} onChange={{ text }} />,
  );
  act(() => { container.querySelector('.tiptap').editor.commands.insertContent('b'); });
  expect(text).toHaveBeenLastCalledWith('bio', expect.stringMatching(/^<p>.*b.*<\/p>$/));
});

test('HTML saved while the flag was on shows as plain text once it is off', () => {
  render(
    <CustomSheetBody sections={sectionsWith(plain)} values={{ texts: { bio: '<p>Hi</p><p><em>there</em></p>' } }} onChange={{ text: jest.fn() }} />,
  );
  expect(screen.getByRole('textbox')).toHaveValue('Hi\nthere');
});

test('a plain long text stays a two-row textarea', () => {
  const { container } = render(
    <CustomSheetBody sections={sectionsWith(plain)} values={{ texts: { bio: 'a < b' } }} onChange={{ text: jest.fn() }} />,
  );
  expect(screen.getByRole('textbox')).toHaveValue('a < b');
  expect(screen.queryByRole('toolbar')).toBeNull();
  expect(container.querySelector('.custom-sheet__cell--rows-2')).not.toBeNull();
});

// The creator mounts the body without onChange: the toolbar must still be there, disabled.
test('without onChange (the creator preview) the toolbar renders disabled', () => {
  const { container } = render(<CustomSheetBody sections={sectionsWith(rich)} showAffordances />);
  within(screen.getByRole('toolbar')).getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
  expect(container.querySelector('.tiptap').editor.isEditable).toBe(false);
});
