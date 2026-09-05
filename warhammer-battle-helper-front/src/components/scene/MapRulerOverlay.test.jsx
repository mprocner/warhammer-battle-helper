import { render, screen } from '@testing-library/react';
import MapRulerOverlay from './MapRulerOverlay';

const ruler = (key, name) => ({
  key,
  name,
  from: { col: 1, row: 1 },
  to: { col: 4, row: 1 },
  distance: 3,
  color: '#ffe08a',
  aoe: false,
});

const renderOverlay = (props) => render(
  <MapRulerOverlay rulers={[ruler('self', null)]} canvasWidth={800} canvasHeight={600} {...props} />,
);

describe('MapRulerOverlay', () => {
  test('defaults to the top-of-stack z-index', () => {
    const { container } = renderOverlay();
    expect(container.querySelector('.map-ruler-overlay')).toHaveStyle({ zIndex: '40' });
  });

  test('honours an explicit z-index so the fog layer can sit above it', () => {
    const { container } = renderOverlay({ zIndex: 28 });
    expect(container.querySelector('.map-ruler-overlay')).toHaveStyle({ zIndex: '28' });
  });

  test('does not clip by default, so the local ruler can overhang the canvas', () => {
    const { container } = renderOverlay();
    expect(container.querySelector('.map-ruler-overlay')).toHaveStyle({ overflow: 'visible' });
  });

  test('clips to the canvas rect when asked, so the fog canvas can cover everything it draws', () => {
    const { container } = renderOverlay({ clip: true });
    expect(container.querySelector('.map-ruler-overlay')).toHaveStyle({ overflow: 'hidden' });
  });

  test('renders one badge per ruler, labelled with the measuring player', () => {
    renderOverlay({
      rulers: [ruler('p1', 'Alice'), ruler('p2', 'Bob')],
      cellDistance: 5,
      unit: 'ft',
    });
    expect(screen.getAllByText('15 ft')).toHaveLength(2);
    expect(screen.getByText('· Alice')).toBeInTheDocument();
    expect(screen.getByText('· Bob')).toBeInTheDocument();
  });

  test('renders nothing when there are no rulers', () => {
    const { container } = renderOverlay({ rulers: [] });
    expect(container.querySelector('.map-ruler-overlay')).toBeNull();
  });
});
