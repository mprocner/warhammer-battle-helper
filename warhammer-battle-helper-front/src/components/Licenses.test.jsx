import React from 'react';
import { render, screen } from '@testing-library/react';
import i18n from '../i18n';
import Licenses, { SRD_ATTRIBUTION } from './Licenses';

describe('Licenses', () => {
  it('shows the verbatim SRD attribution and links the CC-BY licence', () => {
    render(<Licenses />);
    expect(screen.getByText(SRD_ATTRIBUTION)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: i18n.t('licenses.ccLink') }))
      .toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/legalcode');
  });
});
