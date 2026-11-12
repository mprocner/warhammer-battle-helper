import { gridBackgroundProps } from './gridBackground';

describe('gridBackgroundProps', () => {
  test('a scene without a colour keeps the default, theme-following grid', () => {
    const { className, style } = gridBackgroundProps({ gridVisible: true });
    expect(className).toBe('map-grid-background');
    expect(style['--grid-color']).toBeUndefined();
  });

  test('a custom colour is handed to CSS and switches the grid to fully opaque', () => {
    const { className, style } = gridBackgroundProps({ gridVisible: true, gridColor: '#ffffff' });
    expect(className).toBe('map-grid-background map-grid-background--custom');
    expect(style['--grid-color']).toBe('#ffffff');
  });

  test('a hidden grid draws nothing, whatever its colour', () => {
    expect(gridBackgroundProps({ gridVisible: false, gridColor: '#ffffff' }).className)
      .toBe('map-grid-background map-grid-background--hidden');
  });

  test('a scene that never set gridVisible shows the grid (matches the old !== false check)', () => {
    expect(gridBackgroundProps({}).className).toBe('map-grid-background');
    expect(gridBackgroundProps(null).className).toBe('map-grid-background');
  });
});
