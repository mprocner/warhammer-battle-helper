import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../i18n';
import { ConsentProvider, CONSENT_STORAGE_KEY } from '../../analytics/ConsentContext';
import { isConfigured } from '../../analytics/gtag';
import ConsentBanner from './ConsentBanner';

// Odpowiednik podejścia z gtag.test.js (świeży moduł przez env var), ale
// zastosowany przez jest.mock zamiast jest.resetModules(): ConsentBanner
// i ConsentContext korzystają z hooków Reacta, a resetModules() ładuje wtedy
// drugą, osobną kopię pakietu 'react' — niezgodną z tą, której @testing-library/react
// używa już od importu na górze pliku ("Invalid hook call"). Mockowanie
// isConfigured() daje dokładnie tę samą kontrolę nad bramką bez tego konfliktu.
jest.mock('../../analytics/gtag', () => ({
  isConfigured: jest.fn(() => true),
}));

const renderBanner = () => render(
  <MemoryRouter>
    <ConsentProvider>
      <ConsentBanner />
    </ConsentProvider>
  </MemoryRouter>
);

beforeEach(() => {
  localStorage.clear();
  isConfigured.mockReturnValue(true);
});

describe('ConsentBanner', () => {
  // m6: RODO wymaga, żeby odmowa była tak samo łatwa jak zgoda — jedyny sposób,
  // w jaki przyszły refaktor CSS mógłby to po cichu złamać, to rozjechanie klas
  // między przyciskami.
  it('oba przyciski mają identyczną klasę (równa waga wizualna zgody i odmowy)', () => {
    renderBanner();

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].className).toBe(buttons[1].className);
    expect(buttons[0].className).not.toBe('');
  });

  it('nic się nie renderuje, gdy w localStorage jest już zapisana decyzja', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'granted');
    renderBanner();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('nic się nie renderuje bez skonfigurowanego measurement ID', () => {
    isConfigured.mockReturnValue(false);
    renderBanner();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
