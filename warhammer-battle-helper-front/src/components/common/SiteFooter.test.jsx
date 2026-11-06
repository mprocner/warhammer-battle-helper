import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import SiteFooter from './SiteFooter';

describe('SiteFooter', () => {
  afterEach(() => i18n.changeLanguage('en'));

  it.each(['en', 'pl'])('links legal documents, contact, changelog and help (%s)', async (lng) => {
    await i18n.changeLanguage(lng);
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SiteFooter />
      </MemoryRouter>
    );
    const footer = screen.getByRole('navigation', { name: i18n.t('footer.label') });
    [
      ['navigation.terms', '/terms'],
      ['navigation.privacy', '/privacy'],
      ['navigation.licenses', '/licenses'],
      ['navigation.contact', '/contact'],
      ['navigation.changelog', '/changelog'],
      ['navigation.help', '/help'],
    ].forEach(([key, href]) => {
      expect(within(footer).getByRole('link', { name: i18n.t(key) })).toHaveAttribute('href', href);
    });
  });
});
