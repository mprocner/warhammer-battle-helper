import React from 'react';
import { render, screen } from '@testing-library/react';
import i18n from '../i18n';
import { RELEASES, LATEST_VERSION } from '../changelog/releases';
import Changelog, { SECTION_ICONS } from './Changelog';

afterEach(() => localStorage.clear());

describe('Changelog', () => {
  it('renders every release with its sections and anchors', () => {
    const { container } = render(<Changelog />);
    expect(screen.getByRole('heading', { level: 1, name: i18n.t('changelog:title') })).toBeInTheDocument();
    RELEASES.forEach(({ version, sections }) => {
      expect(container.querySelector(`[id="v${version}"]`)).toBeInTheDocument();
      sections.forEach(({ id }) => {
        expect(screen.getAllByRole('heading', { level: 3, name: i18n.t(`changelog:sections.${id}`) }).length)
          .toBeGreaterThan(0);
      });
    });
    expect(screen.getByText(i18n.t('changelog:latest'))).toBeInTheDocument();
  });

  it('marks the latest release as seen on visit', () => {
    render(<Changelog />);
    expect(localStorage.getItem('changelog.lastSeenVersion')).toBe(LATEST_VERSION);
  });

  it('does not throw on a malformed URL hash', () => {
    window.history.replaceState(null, '', '/changelog#%');
    try {
      render(<Changelog />);
      expect(screen.getByRole('heading', { level: 1, name: i18n.t('changelog:title') })).toBeInTheDocument();
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  it('has an icon for every section any release uses', () => {
    RELEASES.forEach(({ sections }) => {
      sections.forEach(({ id }) => expect(SECTION_ICONS[id]).toBeDefined());
    });
  });
});
