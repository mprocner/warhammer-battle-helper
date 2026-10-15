import React from 'react';
import { render } from '@testing-library/react';
import i18n from '../i18n';
import { ConsentProvider } from '../analytics/ConsentContext';
import PrivacyPolicy from './PrivacyPolicy';
import { CONTACT_EMAIL, PROVIDER_NAME } from '../legal/legalInfo';

describe('PrivacyPolicy', () => {
  afterEach(() => i18n.changeLanguage('en'));

  it.each(['en', 'pl'])('names the data controller and the monitored contact address (%s)', async (lng) => {
    await i18n.changeLanguage(lng);
    const { container } = render(<ConsentProvider><PrivacyPolicy /></ConsentProvider>);
    const text = container.textContent;
    expect(text).toContain(PROVIDER_NAME);
    expect(text).toContain(CONTACT_EMAIL);
    expect(text).not.toContain('noreply@');
    expect(text).not.toContain('{{');
  });
});
