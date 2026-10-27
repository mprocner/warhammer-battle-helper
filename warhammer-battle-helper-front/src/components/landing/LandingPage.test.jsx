import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import en from '../../locales/en/translation.json';
import pl from '../../locales/pl/translation.json';
import LandingPage from './LandingPage';

const renderPage = (user) => render(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <LandingPage user={user} />
  </MemoryRouter>
);

// Flattens a translation subtree into dotted key paths, e.g. "features.scene.title".
const keyPaths = (node, prefix = '') => Object.entries(node).flatMap(([key, value]) => (
  typeof value === 'object' ? keyPaths(value, `${prefix}${key}.`) : [`${prefix}${key}`]
));

describe('LandingPage', () => {
  it('points both calls to action at registration for a guest', () => {
    renderPage(null);
    const links = screen.getAllByRole('link', { name: i18n.t('landing.cta.register') });
    expect(links).toHaveLength(2);
    links.forEach(link => expect(link).toHaveAttribute('href', '/register'));
  });

  it('points both calls to action at the game list for a logged-in user', () => {
    renderPage({ email: 'gm@example.com', token: 't' });
    const links = screen.getAllByRole('link', { name: i18n.t('landing.cta.games') });
    expect(links).toHaveLength(2);
    links.forEach(link => expect(link).toHaveAttribute('href', '/games'));
  });

  it('renders the three features, each with a described screenshot', () => {
    renderPage(null);
    ['scene', 'creator', 'gmTools'].forEach(key => {
      expect(screen.getByRole('heading', { name: i18n.t(`landing.features.${key}.title`) }))
        .toBeInTheDocument();
      expect(screen.getByAltText(i18n.t(`landing.features.${key}.imageAlt`))).toBeInTheDocument();
    });
    expect(screen.getAllByRole('img')).toHaveLength(3);
  });

  it('scrolls to the features when "see features" is clicked', () => {
    const scrollIntoView = jest.fn();
    // jsdom has no layout, so scrollIntoView does not exist on elements.
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      renderPage(null);
      fireEvent.click(screen.getByRole('button', { name: i18n.t('landing.cta.features') }));
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
    } finally {
      delete Element.prototype.scrollIntoView;
    }
  });

  it('has the same landing keys in English and Polish', () => {
    expect(keyPaths(pl.landing).sort()).toEqual(keyPaths(en.landing).sort());
  });
});
