import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import i18n from '../i18n';
import Register from './Register';

jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});
jest.mock('../api/axios', () => ({ getApiUrl: () => 'http://api.test', getApiHeaders: () => ({}) }));
jest.mock('../analytics/gtag', () => ({ trackEvent: jest.fn() }));

const fillForm = () => {
  fireEvent.change(screen.getByLabelText(new RegExp('^' + i18n.t('auth.email'))), { target: { name: 'email', value: 'a@b.pl' } });
  fireEvent.change(screen.getByLabelText(new RegExp('^' + i18n.t('auth.password'))), { target: { name: 'password', value: '12345678' } });
  fireEvent.change(screen.getByLabelText(new RegExp('^' + i18n.t('auth.confirmPassword'))), { target: { name: 'confirmPassword', value: '12345678' } });
};

// Link text lives between <terms> tags in the translation; derive it instead of hardcoding English.
const termsLinkName = () => i18n.t('auth.acceptTerms').match(/<terms>(.*?)<\/terms>/)[1];

const submitButton = () => screen.getByRole('button', { name: i18n.t('auth.registerButton') });

describe('Register — terms acceptance', () => {
  beforeEach(() => axios.post.mockReset());

  it('keeps submit disabled until the terms checkbox is ticked', () => {
    render(<Register addLogMessage={jest.fn()} />);
    fillForm();
    expect(submitButton()).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(submitButton()).toBeEnabled();
  });

  it('links the terms page in a new tab', () => {
    render(<Register addLogMessage={jest.fn()} />);
    const link = screen.getByRole('link', { name: termsLinkName() });
    expect(link).toHaveAttribute('href', '/terms');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('sends acceptedTerms with the registration request', async () => {
    axios.post.mockResolvedValue({ data: {} });
    render(<Register addLogMessage={jest.fn()} />);
    fillForm();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(submitButton());

    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    expect(axios.post.mock.calls[0][1]).toEqual(expect.objectContaining({ acceptedTerms: true }));
  });
});
