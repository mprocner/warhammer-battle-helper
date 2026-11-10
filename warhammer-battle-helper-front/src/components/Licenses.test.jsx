import React from 'react';
import { render, screen } from '@testing-library/react';
import i18n from '../i18n';
import Licenses, { SRD_ATTRIBUTION, DICE_CREDITS } from './Licenses';

describe('Licenses', () => {
  it('shows the verbatim SRD attribution and links the CC-BY licence', () => {
    render(<Licenses />);
    expect(screen.getByText(SRD_ATTRIBUTION)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: i18n.t('licenses.ccLink') }))
      .toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/legalcode');
  });

  it('credits every 3D dice component with its copyright notice and licence', () => {
    render(<Licenses />);
    DICE_CREDITS.forEach(c => {
      expect(screen.getByRole('link', { name: c.name })).toHaveAttribute('href', c.url);
      expect(screen.getByText(c.notice, { exact: false })).toBeInTheDocument();
    });
  });

  it('names the browser tab in the interface language', () => {
    render(<Licenses />);
    expect(document.title).toBe(`${i18n.t('pageTitle.licenses')} · PlayRPG`);
  });
});
