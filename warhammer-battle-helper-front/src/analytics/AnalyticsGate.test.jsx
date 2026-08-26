import { render } from '@testing-library/react';
import AnalyticsGate from './AnalyticsGate';
import { ConsentProvider, CONSENT_STORAGE_KEY } from './ConsentContext';
import { enable, disable } from './gtag';

jest.mock('./gtag', () => ({
  enable: jest.fn(),
  disable: jest.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

describe('AnalyticsGate', () => {
  it('nie włącza GA, gdy decyzji nie ma', () => {
    render(<ConsentProvider><AnalyticsGate /></ConsentProvider>);
    expect(enable).not.toHaveBeenCalled();
    expect(disable).toHaveBeenCalled();
  });

  it('włącza GA, gdy zgoda jest zapisana', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'granted');
    render(<ConsentProvider><AnalyticsGate /></ConsentProvider>);
    expect(enable).toHaveBeenCalled();
  });

  it('nie włącza GA po odmowie', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'denied');
    render(<ConsentProvider><AnalyticsGate /></ConsentProvider>);
    expect(enable).not.toHaveBeenCalled();
    expect(disable).toHaveBeenCalled();
  });
});
