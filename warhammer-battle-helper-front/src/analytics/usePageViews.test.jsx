import { render, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { usePageViews } from './usePageViews';
import { trackEvent, setPageContext } from './gtag';
import { ConsentProvider, CONSENT_STORAGE_KEY } from './ConsentContext';

jest.mock('./gtag', () => ({ trackEvent: jest.fn(), setPageContext: jest.fn() }));

const Tracker = () => {
  usePageViews();
  return null;
};

const withConsent = (ui) => <ConsentProvider>{ui}</ConsentProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe('usePageViews', () => {
  it('wysyła page_view ze ścieżką bieżącego routa', () => {
    render(withConsent(
      <MemoryRouter initialEntries={['/register']}>
        <Tracker />
        <Routes><Route path="/register" element={<div />} /></Routes>
      </MemoryRouter>
    ));
    expect(trackEvent).toHaveBeenCalledWith('page_view', { page_path: '/register' });
  });

  // gtag('set') musi odświeżyć page_location/page_referrer PRZED wysłaniem eventu —
  // inaczej biblioteka GA (enhanced measurement) mogłaby zdążyć wygenerować własny
  // event ze starymi, potencjalnie niesanitized wartościami.
  it('wywołuje setPageContext przed trackEvent przy zmianie routa', () => {
    render(withConsent(
      <MemoryRouter initialEntries={['/register']}>
        <Tracker />
        <Routes><Route path="/register" element={<div />} /></Routes>
      </MemoryRouter>
    ));

    expect(setPageContext).toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalled();
    const setPageContextOrder = setPageContext.mock.invocationCallOrder[0];
    const trackEventOrder = trackEvent.mock.invocationCallOrder[0];
    expect(setPageContextOrder).toBeLessThan(trackEventOrder);
  });

  it('nie wysyła duplikatu przy re-renderze bez zmiany ścieżki i zgody', () => {
    const { rerender } = render(withConsent(
      <MemoryRouter initialEntries={['/login']}><Tracker /></MemoryRouter>
    ));
    rerender(withConsent(
      <MemoryRouter initialEntries={['/login']}><Tracker /></MemoryRouter>
    ));
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  // I3: bez tego pierwszy page_view nowego odwiedzającego ginie — efekt odpala się,
  // gdy consent jest jeszcze null (trackEvent i tak nic nie wyśle, bo GA jest
  // wyłączone), a kliknięcie „Akceptuję" nie zmienia ścieżki, więc [pathname] samo
  // w sobie nigdy by efektu nie odpaliło ponownie.
  it('wysyła page_view ponownie, gdy zgoda zmienia się bez zmiany ścieżki', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'granted');
    const { rerender } = render(withConsent(
      <MemoryRouter initialEntries={['/login']}><Tracker /></MemoryRouter>
    ));
    expect(trackEvent).toHaveBeenCalledTimes(1);

    localStorage.setItem(CONSENT_STORAGE_KEY, 'denied');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: CONSENT_STORAGE_KEY,
        newValue: 'denied',
      }));
    });
    rerender(withConsent(
      <MemoryRouter initialEntries={['/login']}><Tracker /></MemoryRouter>
    ));

    expect(trackEvent).toHaveBeenCalledTimes(2);
  });
});
