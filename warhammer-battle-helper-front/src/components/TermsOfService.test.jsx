import React from 'react';
import { render, screen } from '@testing-library/react';
import i18n from '../i18n';
import en from '../locales/en/translation.json';
import pl from '../locales/pl/translation.json';
import TermsOfService from './TermsOfService';
import { CONTACT_EMAIL, PROVIDER_NAME, TERMS_EFFECTIVE_DATE } from '../legal/legalInfo';

describe('TermsOfService', () => {
  afterEach(() => i18n.changeLanguage('en'));

  it.each(['en', 'pl'])('renders numbered sections with interpolated values (%s)', async (lng) => {
    await i18n.changeLanguage(lng);
    const { container } = render(<TermsOfService />);

    const sections = (lng === 'en' ? en : pl).terms.sections;
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(sections.length);
    expect(screen.getByRole('heading', { name: `§ 1. ${sections[0].title}` })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: `§ ${sections.length}. ${sections[sections.length - 1].title}` }))
      .toBeInTheDocument();

    const text = container.textContent;
    expect(text).toContain(PROVIDER_NAME);
    expect(text).toContain(CONTACT_EMAIL);
    expect(text).toContain(TERMS_EFFECTIVE_DATE);
    expect(text).not.toContain('{{');
    expect(text).not.toContain('terms.');
  });

  // i18n-sync compares keys only; an array has the same key in both languages, so a paragraph
  // added to one version would slip through without this check.
  it('has the same section and paragraph structure in PL and EN', () => {
    const shape = (sections) => sections.map((s) => s.paragraphs.length);
    expect(shape(pl.terms.sections)).toEqual(shape(en.terms.sections));
  });
});
