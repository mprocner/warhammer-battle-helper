/* eslint-disable testing-library/no-node-access, testing-library/no-container */
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

const sections = [{
  id: 's', title: '', columns: 3, fields: [
    { key: 'nm', type: 'char_name', label: 'Imię' },
    { key: 'av', type: 'char_avatar', label: 'Portret' },
    { key: 'crest', type: 'image', label: 'Herb' },
  ],
}];

const handlers = () => ({ name: jest.fn(), avatar: jest.fn(), image: jest.fn(), text: jest.fn() });

test('char_name shows character.name and edits it, never stats.texts', () => {
  const onChange = handlers();
  const { container } = render(
    <CustomSheetBody sections={sections} values={{ name: 'Bohater', texts: {} }} onChange={onChange} uploadImage={jest.fn()} />
  );
  const input = container.querySelector('.custom-sheet__tile--text .custom-sheet__text-input');
  expect(input.value).toBe('Bohater');
  fireEvent.change(input, { target: { value: 'Bohaterka' } });
  expect(onChange.name).toHaveBeenCalledWith('Bohaterka');
  expect(onChange.text).not.toHaveBeenCalled();
});

test('char_avatar and image render pickers with their own values', () => {
  const { container } = render(
    <CustomSheetBody sections={sections} values={{ avatar: '/avatars/a.webp', images: { crest: '/avatars/c.webp' } }} />
  );
  expect(container.querySelector('.custom-sheet__image--avatar img').getAttribute('src')).toMatch(/\/avatars\/a\.webp$/);
  expect(container.querySelector('.custom-sheet__image--free img').getAttribute('src')).toMatch(/\/avatars\/c\.webp$/);
});

test('image remove routes through onChange.image with the field key', () => {
  const onChange = handlers();
  render(
    <CustomSheetBody sections={sections} values={{ images: { crest: '/avatars/c.webp' } }} onChange={onChange} uploadImage={jest.fn()} />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
  expect(onChange.image).toHaveBeenCalledWith('crest', '');
});

test('read-only sheet renders the pickers disabled', () => {
  render(<CustomSheetBody sections={sections} values={{}} />);
  screen.getAllByRole('button', { name: 'Upload image' }).forEach(btn => expect(btn).toBeDisabled());
});
