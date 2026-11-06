import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import LandingCta from './LandingCta';

const renderCta = (user) => render(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <LandingCta user={user} />
  </MemoryRouter>
);

describe('LandingCta', () => {
  it('sends a guest to registration', () => {
    renderCta(null);
    expect(screen.getByRole('link', { name: i18n.t('landing.cta.register') }))
      .toHaveAttribute('href', '/register');
  });

  it('sends a logged-in user to the game list', () => {
    renderCta({ email: 'gm@example.com', token: 't' });
    expect(screen.getByRole('link', { name: i18n.t('landing.cta.games') }))
      .toHaveAttribute('href', '/games');
  });
});
