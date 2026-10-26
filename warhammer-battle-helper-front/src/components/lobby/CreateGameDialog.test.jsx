/* eslint-disable testing-library/no-node-access */
import React from 'react';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import i18n from '../../i18n';
import axiosInstance from '../../api/axios';
import CreateGameDialog from './CreateGameDialog';

// The dialog fetches /features through the shared axios instance; axios itself is ESM,
// which CRA's jest cannot parse, so the whole module is stubbed.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const systemInput = () => screen.getByRole('combobox', { name: i18n.t('game.gameSystem') });

const templates = [
  { id: 'm1', name: 'Moja Kampania', myRole: 'owner', updatedAt: '2026-10-01T10:00:00Z', language: 'pl', description: '<p>Opis <strong>kampanii</strong></p>',
    sections: [{ id: 'sec1', title: 'Atrybuty', columns: 2, fields: [{ key: 'fld_str', type: 'number', label: 'Siła' }] }] },
  { id: 's1', name: 'Łowcy Czarownic', myRole: 'viewer', ownerEmails: ['alice@example.com'], language: 'en' },
  { id: 'p1', name: 'Mroczne Ziemie', isPublic: true },
];

const ALL_SYSTEMS = ['warhammer4e', 'coc7e', 'coc7e_dark_ages', 'srd5', 'custom'];

beforeEach(() => {
  localStorage.clear();
  axiosInstance.get.mockReset();
  axiosInstance.get.mockResolvedValue({ data: { allowedSystems: ALL_SYSTEMS } });
});

const dialog = (props) => (
  <CreateGameDialog open loading={false} templates={templates}
    onClose={jest.fn()} onCreate={jest.fn()} onOpenCreator={jest.fn()} {...props} />
);

// Renders and lets the /features request settle, so the hardcoded systems are in the list.
const renderDialog = async (props = {}) => {
  const utils = render(dialog(props));
  await act(async () => {});
  return utils;
};

const search = (text) => {
  const input = systemInput();
  // A real user types into a focused input; without focus MUI resets the text right after each change.
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  // MUI renders no listbox at all when nothing matches, so this is null in that case.
  return screen.queryByRole('listbox');
};

describe('CreateGameDialog system search', () => {
  it('narrows the list diacritic-insensitively and hides emptied groups', async () => {
    await renderDialog();
    const listbox = search('lowc');

    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Łowcy Czarownic');
    expect(options[0]).toHaveTextContent('alice@example.com');
    expect(within(listbox).getByText(i18n.t('creator.groupSharedWithMe'))).toBeInTheDocument();
    expect(within(listbox).queryByText(i18n.t('creator.groupPublic'))).not.toBeInTheDocument();
  });

  it('never shows an author on public templates', async () => {
    await renderDialog();
    const listbox = search('mroczne');
    expect(within(listbox).getByRole('option')).toHaveTextContent(/^Mroczne Ziemie$/);
  });

  it('tells the user when nothing matches', async () => {
    await renderDialog();
    search('zzzz');
    expect(screen.getByText(i18n.t('creator.noSystemMatch'))).toBeInTheDocument();
  });

  it('creates a game on the picked template', async () => {
    const onCreate = jest.fn();
    await renderDialog({ onCreate });
    fireEvent.change(screen.getByLabelText(i18n.t('game.gameName')), { target: { value: 'Sesja' } });
    fireEvent.click(within(search('mroczne')).getByRole('option'));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.create') }));
    expect(onCreate).toHaveBeenCalledWith({ name: 'Sesja', gameSystem: 'custom', customTemplateId: 'p1' });
  });

  it('renders same-named templates as separate options without duplicate-key warnings', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const twins = [
      { id: 'p1', name: 'Dwojaki', isPublic: true },
      { id: 'p2', name: 'Dwojaki', isPublic: true },
    ];
    await renderDialog({ templates: twins });
    const listbox = search('dwojaki');
    expect(within(listbox).getAllByRole('option')).toHaveLength(2);
    expect(spy.mock.calls.some(args => String(args[0]).includes('same key'))).toBe(false);
    spy.mockRestore();
  });

  it('starts with no system picked: empty field with placeholder, create disabled', async () => {
    await renderDialog();
    const input = systemInput();
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', i18n.t('creator.searchSystem'));
    fireEvent.change(screen.getByLabelText(i18n.t('game.gameName')), { target: { value: 'Sesja' } });
    expect(screen.getByRole('button', { name: i18n.t('common.create') })).toBeDisabled();
  });

  it('shows the choice while closed and an empty search box over the full list while open', async () => {
    await renderDialog();
    const input = systemInput();
    fireEvent.click(within(search('warhammer')).getByRole('option'));
    expect(input).toHaveValue(i18n.t('gameSystems.warhammer4e'));

    fireEvent.mouseDown(input);
    expect(input).toHaveValue('');
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByText('Mroczne Ziemie')).toBeInTheDocument();
    expect(within(listbox).getByText(i18n.t('gameSystems.warhammer4e'))).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveValue(i18n.t('gameSystems.warhammer4e'));
  });

  it('keeps the first typed character when typing opens the list', async () => {
    await renderDialog();
    const input = systemInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'm' } });
    expect(input).toHaveValue('m');
  });

  it('picks the first match on Enter after typing', async () => {
    const onCreate = jest.fn();
    await renderDialog({ onCreate });
    fireEvent.change(screen.getByLabelText(i18n.t('game.gameName')), { target: { value: 'Sesja' } });
    search('mroczne');
    fireEvent.keyDown(systemInput(), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.create') }));
    expect(onCreate).toHaveBeenCalledWith({ name: 'Sesja', gameSystem: 'custom', customTemplateId: 'p1' });
  });
});

describe('CreateGameDialog system access', () => {
  it('lists no hardcoded system until /features answers', () => {
    axiosInstance.get.mockReturnValue(new Promise(() => {}));
    render(dialog());
    expect(search('warhammer')).toBeNull();
    expect(within(search('mroczne')).getByRole('option')).toHaveTextContent('Mroczne Ziemie');
  });

  it('lists only the systems the user may create games in', async () => {
    axiosInstance.get.mockResolvedValue({ data: { allowedSystems: ['warhammer4e', 'custom'] } });
    await renderDialog();
    expect(search('warhammer')).not.toBeNull();
    expect(search('d&d')).toBeNull();
  });

  it('keeps templates and the creator link when /features fails', async () => {
    axiosInstance.get.mockRejectedValue(new Error('network'));
    await renderDialog();
    expect(search('warhammer')).toBeNull();
    expect(within(search('mroczne')).getByRole('option')).toHaveTextContent('Mroczne Ziemie');
    expect(screen.getByText(i18n.t('creator.designYours'))).toBeInTheDocument();
  });

  it('refetches access on every open', async () => {
    const { rerender } = await renderDialog();
    rerender(dialog({ open: false }));
    rerender(dialog({ open: true }));
    await act(async () => {});
    expect(axiosInstance.get).toHaveBeenCalledTimes(2);
    expect(axiosInstance.get).toHaveBeenCalledWith('/features');
  });
});

const openSystems = () => {
  fireEvent.mouseDown(systemInput());
  return screen.getByRole('listbox');
};
const openLanguages = () => fireEvent.click(screen.getByRole('button', { name: /^Languages:/ }));
const confirmLanguages = async () => {
  fireEvent.click(screen.getByRole('button', { name: i18n.t('common.confirm') }));
  // The menu leaves through a transition, so it lingers in the DOM for a moment.
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
};
const chooseLanguage = async (name) => {
  openLanguages();
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name }));
  await confirmLanguages();
};

describe('CreateGameDialog language filter', () => {
  it('stays open while picking several languages and closes on confirm', async () => {
    await renderDialog();
    openLanguages();
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Polish' }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'English' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await confirmLanguages();
    expect(screen.getByRole('button', { name: 'Languages: PL, EN' })).toBeInTheDocument();
    const list = openSystems();
    expect(within(list).getByText('Moja Kampania')).toBeInTheDocument();
    expect(within(list).getByText('Łowcy Czarownic')).toBeInTheDocument();
  });

  it('shows everything until a language is chosen', async () => {
    await renderDialog();
    expect(screen.getByRole('button', { name: 'Languages: All' })).toBeInTheDocument();
    expect(within(openSystems()).getByText('Mroczne Ziemie')).toBeInTheDocument();
  });

  it('each template row shows its language code; unspecified shows none', async () => {
    await renderDialog();
    const list = openSystems();
    expect(within(list).getByText('Moja Kampania').closest('li')).toHaveTextContent('PL');
    expect(within(list).getByText('Łowcy Czarownic').closest('li')).toHaveTextContent('EN');
    const unspecified = within(list).getByText('Mroczne Ziemie').closest('li');
    expect(unspecified.querySelector('.create-game__option-lang')).toBeNull();
  });

  it('a search emptied only by the filter says so and offers to show all languages', async () => {
    await renderDialog();
    await chooseLanguage('Polish');
    expect(search('lowc')).toBeNull();
    expect(screen.getByText('No results in the selected languages.')).toBeInTheDocument();
    expect(screen.getByText('Matching templates in other languages: 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all languages' }));
    expect(screen.getByRole('button', { name: 'Languages: All' })).toBeInTheDocument();
    expect(within(screen.getByRole('listbox')).getByRole('option', { name: /Czarownic/ })).toBeInTheDocument();
  });

  it('a search with no match anywhere keeps the plain message', async () => {
    await renderDialog();
    await chooseLanguage('Polish');
    search('zzz');
    expect(screen.getByText('No matching system or template')).toBeInTheDocument();
    expect(screen.queryByText('No results in the selected languages.')).not.toBeInTheDocument();
  });

  it('"Clear" inside the filter menu brings every template back', async () => {
    await renderDialog();
    await chooseLanguage('Polish');
    openLanguages();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await confirmLanguages();
    expect(screen.getByRole('button', { name: 'Languages: All' })).toBeInTheDocument();
    expect(within(openSystems()).getByText('Mroczne Ziemie')).toBeInTheDocument();
  });

  it('keeps built-in systems and matching templates, drops unspecified', async () => {
    await renderDialog();
    await chooseLanguage('Polish');
    const list = openSystems();
    expect(within(list).getByText('Moja Kampania')).toBeInTheDocument();
    expect(within(list).queryByText('Łowcy Czarownic')).not.toBeInTheDocument();
    expect(within(list).queryByText('Mroczne Ziemie')).not.toBeInTheDocument();
    expect(within(list).getByText(i18n.t('gameSystems.warhammer4e'))).toBeInTheDocument();
  });

  it('clears a selection the filter hides', async () => {
    await renderDialog();
    fireEvent.click(within(openSystems()).getByText('Mroczne Ziemie'));
    await chooseLanguage('Polish');
    expect(systemInput()).toHaveValue('');
  });

  it('remembers the filter for the next open', async () => {
    const { unmount } = await renderDialog();
    await chooseLanguage('English');
    unmount();
    await renderDialog();
    expect(within(openSystems()).queryByText('Moja Kampania')).not.toBeInTheDocument();
  });
});

describe('CreateGameDialog description', () => {
  it('the info icon opens the description without selecting the template', async () => {
    await renderDialog();
    const list = openSystems();
    const row = within(list).getByText('Moja Kampania').closest('li');
    const icon = within(row).getByTestId('InfoOutlinedIcon').closest('button');
    fireEvent.mouseDown(icon);
    fireEvent.click(icon);
    expect(screen.getByRole('dialog', { name: /Moja Kampania/ })).toBeInTheDocument();
    // The popup makes the create dialog aria-hidden, so look the field up including hidden nodes.
    expect(screen.getByRole('combobox', { name: i18n.t('game.gameSystem'), hidden: true })).toHaveValue('');
  });

  it('only templates with a description get the icon', async () => {
    await renderDialog();
    const row = within(openSystems()).getByText('Mroczne Ziemie').closest('li');
    expect(within(row).queryByTestId('InfoOutlinedIcon')).not.toBeInTheDocument();
  });

  it('a selected template with a description shows its card', async () => {
    await renderDialog();
    expect(document.querySelector('.create-game__selected-about')).toBeNull();
    fireEvent.click(within(openSystems()).getByText('Moja Kampania'));
    const card = document.querySelector('.create-game__selected-about');
    expect(card).toHaveTextContent('kampanii');
    fireEvent.click(within(card).getByRole('button', { name: i18n.t('creator.about.more') }));
    expect(screen.getByRole('dialog', { name: /Moja Kampania/ })).toBeInTheDocument();
  });
});

describe('CreateGameDialog sheet preview', () => {
  it('only custom templates get the eye', async () => {
    await renderDialog();
    const list = openSystems();
    const builtIn = within(list).getByText(i18n.t('gameSystems.warhammer4e')).closest('li');
    expect(within(builtIn).queryByTestId('VisibilityOutlinedIcon')).not.toBeInTheDocument();
    const custom = within(list).getByText('Mroczne Ziemie').closest('li');
    expect(within(custom).getByTestId('VisibilityOutlinedIcon')).toBeInTheDocument();
  });

  it('the eye opens the sheet without selecting the template', async () => {
    await renderDialog();
    const row = within(openSystems()).getByText('Moja Kampania').closest('li');
    const eye = within(row).getByTestId('VisibilityOutlinedIcon').closest('button');
    fireEvent.mouseDown(eye);
    fireEvent.click(eye);
    const popup = document.querySelector('.character-sheet-popup');
    expect(popup).toHaveTextContent('Siła');
    expect(popup.querySelector('.modal-header__title')).toHaveTextContent('Moja Kampania');
    expect(screen.getByRole('combobox', { name: i18n.t('game.gameSystem'), hidden: true })).toHaveValue('');
  });

  it('the selected-template card offers the preview', async () => {
    await renderDialog();
    fireEvent.click(within(openSystems()).getByText('Moja Kampania'));
    const card = document.querySelector('.create-game__selected-about');
    fireEvent.click(within(card).getByRole('button', { name: i18n.t('creator.previewSheet') }));
    expect(document.querySelector('.character-sheet-popup')).toHaveTextContent('Siła');
  });

  it('closing the dialog closes the preview', async () => {
    const { rerender } = await renderDialog();
    const row = within(openSystems()).getByText('Moja Kampania').closest('li');
    fireEvent.click(within(row).getByTestId('VisibilityOutlinedIcon').closest('button'));
    expect(document.querySelector('.character-sheet-popup')).not.toBeNull();
    rerender(dialog({ open: false }));
    expect(document.querySelector('.character-sheet-popup')).toBeNull();
  });
});
