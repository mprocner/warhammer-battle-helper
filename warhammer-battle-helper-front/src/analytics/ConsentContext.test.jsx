import { renderHook, act } from '@testing-library/react';
import {
  ConsentProvider, useConsent, CONSENT_STORAGE_KEY, CONSENT_GRANTED, CONSENT_DENIED,
} from './ConsentContext';

const wrapper = ({ children }) => <ConsentProvider>{children}</ConsentProvider>;

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

describe('ConsentContext', () => {
  it('startuje bez decyzji, gdy localStorage jest pusty', () => {
    const { result } = renderHook(() => useConsent(), { wrapper });
    expect(result.current.consent).toBeNull();
  });

  it('czyta zapisaną decyzję przy starcie', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'granted');
    const { result } = renderHook(() => useConsent(), { wrapper });
    expect(result.current.consent).toBe('granted');
  });

  it('ignoruje śmieci w localStorage', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'maybe');
    const { result } = renderHook(() => useConsent(), { wrapper });
    expect(result.current.consent).toBeNull();
  });

  it('grant() i deny() zapisują decyzję', () => {
    const { result } = renderHook(() => useConsent(), { wrapper });

    act(() => result.current.grant());
    expect(result.current.consent).toBe('granted');
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('granted');

    act(() => result.current.deny());
    expect(result.current.consent).toBe('denied');
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('denied');
  });

  it('przeżywa localStorage rzucający wyjątkiem (tryb prywatny)', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied');
    });

    const { result } = renderHook(() => useConsent(), { wrapper });
    expect(result.current.consent).toBeNull();

    act(() => result.current.grant());
    expect(result.current.consent).toBe('granted');
  });

  it('useConsent poza providerem rzuca wyjątkiem zamiast po cichu nie działać', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useConsent())).toThrow(/ConsentProvider/);
  });

  it('podłapuje zmianę zgody zapisaną w innej karcie (event storage)', () => {
    const { result } = renderHook(() => useConsent(), { wrapper });
    expect(result.current.consent).toBeNull();

    // Inna karta zapisuje decyzję i wysyła natywny event 'storage' — w tej samej
    // karcie, gdzie zapis nastąpił, przeglądarka tego eventu nie odpala, dlatego
    // symulujemy dokładnie to, co dostałaby druga karta.
    localStorage.setItem(CONSENT_STORAGE_KEY, CONSENT_DENIED);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: CONSENT_STORAGE_KEY,
        newValue: CONSENT_DENIED,
      }));
    });

    expect(result.current.consent).toBe(CONSENT_DENIED);
  });

  it('ignoruje eventy storage dla innych kluczy', () => {
    const { result } = renderHook(() => useConsent(), { wrapper });
    act(() => result.current.grant());
    expect(result.current.consent).toBe(CONSENT_GRANTED);

    localStorage.setItem('inny-klucz', 'cokolwiek');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'inny-klucz',
        newValue: 'cokolwiek',
      }));
    });

    expect(result.current.consent).toBe(CONSENT_GRANTED);
  });
});
