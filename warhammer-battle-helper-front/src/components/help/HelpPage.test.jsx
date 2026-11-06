import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n from '../../i18n';
import HelpPage from './HelpPage';

// The real loader fetches the hashed asset URL; in jest the guide is read straight from disk.
jest.mock('../../help/helpPages', () => {
  const actual = jest.requireActual('../../help/helpPages');
  const nodeFs = jest.requireActual('fs');
  const nodePath = jest.requireActual('path');
  return {
    ...actual,
    loadHelpMarkdown: (language, slug) => {
      const page = actual.HELP_PAGES.find(p => p.slug === slug);
      const dir = nodePath.join(process.cwd(), 'src/help', actual.helpLanguage(language));
      return Promise.resolve(nodeFs.readFileSync(nodePath.join(dir, page.file), 'utf8'));
    },
  };
});

const renderAt = (entry) => render(
  <MemoryRouter initialEntries={[entry]}>
    <Routes>
      <Route path="/help" element={<HelpPage />} />
      <Route path="/help/:page" element={<HelpPage />} />
    </Routes>
  </MemoryRouter>
);

describe('HelpPage', () => {
  let scrollIntoView;

  beforeEach(async () => {
    scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.scrollTo = jest.fn();
    await act(async () => { await i18n.changeLanguage('en'); });
  });

  it('renders the page with its anchored headings and scrolls to the section in the URL', async () => {
    const { container } = renderAt('/help/game-screen#map-controls');
    expect(await screen.findByRole('heading', { level: 1, name: 'The game screen' })).toBeInTheDocument();
    const section = container.querySelector('h2#map-controls');
    expect(section).not.toBeNull();
    expect(section.textContent).toBe('Map controls');
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView.mock.instances[0]).toBe(section);
  });

  it('lists every page in the sidebar and the sections of the open one', async () => {
    renderAt('/help/system-creator');
    await screen.findByRole('heading', { level: 1, name: 'System Creator' });
    const nav = screen.getByRole('navigation', { name: 'Help pages' });
    expect(nav.querySelectorAll('.help-page__nav-link')).toHaveLength(7);
    expect(nav.querySelector('[aria-current="page"]').textContent).toBe('System Creator');
    const formulas = [...nav.querySelectorAll('.help-page__section-link')].find(a => a.textContent === 'Formulas');
    expect(formulas.getAttribute('href')).toBe('/help/system-creator#formulas');
  });

  it('turns links between guide files into help routes', async () => {
    renderAt('/help/getting-started');
    await screen.findByRole('heading', { level: 1, name: 'Getting started' });
    const link = screen.getAllByRole('link', { name: 'System Creator' })
      .find(a => a.closest('.help-page__article'));
    expect(link.getAttribute('href')).toBe('/help/system-creator');
    expect(link.getAttribute('target')).toBeNull();
  });

  it('follows the interface language', async () => {
    renderAt('/help');
    await screen.findByRole('heading', { level: 1, name: /user guide/ });
    await act(async () => { await i18n.changeLanguage('pl'); });
    expect(await screen.findByRole('heading', { level: 1, name: /przewodnik/ })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Strony pomocy' })).toBeInTheDocument();
  });

  it('renders the guide tables', async () => {
    const { container } = renderAt('/help/dice-and-chat');
    await screen.findByRole('heading', { level: 1, name: 'Dice and chat' });
    expect(container.querySelectorAll('.help-page__article table').length).toBeGreaterThan(0);
  });

  it('sends an unknown page back to the overview', async () => {
    renderAt('/help/nope');
    expect(await screen.findByRole('heading', { level: 1, name: /user guide/ })).toBeInTheDocument();
  });

  it('names the browser tab after the open guide page', async () => {
    renderAt('/help/getting-started');
    await screen.findByRole('heading', { level: 1, name: 'Getting started' });
    expect(document.title).toBe('Getting started · Help · PlayRPG');
  });

  it('names the overview just "Help"', async () => {
    renderAt('/help');
    await screen.findByRole('heading', { level: 1, name: /user guide/ });
    expect(document.title).toBe('Help · PlayRPG');
  });
});
