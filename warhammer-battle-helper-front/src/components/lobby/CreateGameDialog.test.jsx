import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import i18n from '../../i18n';
import CreateGameDialog from './CreateGameDialog';

// The system registry pulls in axios (ESM, which CRA's jest cannot parse); the dialog never calls it.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const templates = [
  { id: 'm1', name: 'Moja Kampania', isOwner: true, updatedAt: '2026-10-01T10:00:00Z' },
  { id: 's1', name: 'Łowcy Czarownic', isOwner: false, sharedWithMe: true, ownerEmail: 'alice@example.com' },
  { id: 'p1', name: 'Mroczne Ziemie', isOwner: false, isPublic: true },
];

const renderDialog = (props = {}) => render(
  <CreateGameDialog open loading={false} templates={templates}
    onClose={jest.fn()} onCreate={jest.fn()} onOpenCreator={jest.fn()} {...props} />
);

const search = (text) => {
  const input = screen.getByRole('combobox');
  // A real user types into a focused input; without focus MUI resets the text right after each change.
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  // MUI renders no listbox at all when nothing matches, so this is null in that case.
  return screen.queryByRole('listbox');
};

describe('CreateGameDialog system search', () => {
  it('narrows the list diacritic-insensitively and hides emptied groups', () => {
    renderDialog();
    const listbox = search('lowc');

    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Łowcy Czarownic');
    expect(options[0]).toHaveTextContent('alice@example.com');
    expect(within(listbox).getByText(i18n.t('creator.groupSharedWithMe'))).toBeInTheDocument();
    expect(within(listbox).queryByText(i18n.t('creator.groupPublic'))).not.toBeInTheDocument();
  });

  it('never shows an author on public templates', () => {
    renderDialog();
    const listbox = search('mroczne');
    expect(within(listbox).getByRole('option')).toHaveTextContent(/^Mroczne Ziemie$/);
  });

  it('tells the user when nothing matches', () => {
    renderDialog();
    search('zzzz');
    expect(screen.getByText(i18n.t('creator.noSystemMatch'))).toBeInTheDocument();
  });

  it('creates a game on the picked template', () => {
    const onCreate = jest.fn();
    renderDialog({ onCreate });
    fireEvent.change(screen.getByLabelText(i18n.t('game.gameName')), { target: { value: 'Sesja' } });
    fireEvent.click(within(search('mroczne')).getByRole('option'));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.create') }));
    expect(onCreate).toHaveBeenCalledWith({ name: 'Sesja', gameSystem: 'custom', customTemplateId: 'p1' });
  });

  it('renders same-named templates as separate options without duplicate-key warnings', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const twins = [
      { id: 'p1', name: 'Dwojaki', isOwner: false, isPublic: true },
      { id: 'p2', name: 'Dwojaki', isOwner: false, isPublic: true },
    ];
    renderDialog({ templates: twins });
    const listbox = search('dwojaki');
    expect(within(listbox).getAllByRole('option')).toHaveLength(2);
    expect(spy.mock.calls.some(args => String(args[0]).includes('same key'))).toBe(false);
    spy.mockRestore();
  });

  it('falls back to the first allowed system when the default is not allowed', () => {
    const onCreate = jest.fn();
    renderDialog({ allowedSystems: ['coc7e'], onCreate });
    expect(screen.getByRole('combobox')).toHaveValue('Call of Cthulhu 7e');
    fireEvent.change(screen.getByLabelText(i18n.t('game.gameName')), { target: { value: 'Sesja' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.create') }));
    expect(onCreate).toHaveBeenCalledWith({ name: 'Sesja', gameSystem: 'coc7e' });
  });

  it('picks the first match on Enter after typing', () => {
    const onCreate = jest.fn();
    renderDialog({ onCreate });
    fireEvent.change(screen.getByLabelText(i18n.t('game.gameName')), { target: { value: 'Sesja' } });
    search('mroczne');
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.create') }));
    expect(onCreate).toHaveBeenCalledWith({ name: 'Sesja', gameSystem: 'custom', customTemplateId: 'p1' });
  });
});
