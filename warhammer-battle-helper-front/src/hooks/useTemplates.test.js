import { renderHook, act } from '@testing-library/react';
import i18n from '../i18n';
import { useTemplates } from './useTemplates';

jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

describe('useTemplates.createTemplate', () => {
  const originalFetch = global.fetch;
  const originalLanguage = i18n.language;

  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'n', name: 'N' }) }));
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    await act(async () => { await i18n.changeLanguage(originalLanguage); });
  });

  test('a new template starts in the UI language', async () => {
    await i18n.changeLanguage('pl');
    const { result } = renderHook(() => useTemplates('token'));
    await act(async () => { await result.current.createTemplate('N'); });
    const [, init] = global.fetch.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ name: 'N', language: 'pl' });
  });
});
