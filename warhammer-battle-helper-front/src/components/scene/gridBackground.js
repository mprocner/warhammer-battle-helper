// Class + inline style for the visible grid layer (.map-grid-background in SceneViewport.css).
// The default grid follows the viewer's theme (--c-border-light at 0.4 opacity). A scene with its
// own gridColor gets that colour fully opaque (--custom), so the picker's swatch is exactly what
// players see. The colour travels as a CSS variable — the gradients themselves live in CSS.
export function gridBackgroundProps(scene) {
  const classes = ['map-grid-background'];
  const style = {};
  if (scene?.gridVisible === false) {
    classes.push('map-grid-background--hidden');
  } else if (scene?.gridColor) {
    classes.push('map-grid-background--custom');
    style['--grid-color'] = scene.gridColor;
  }
  return { className: classes.join(' '), style };
}
