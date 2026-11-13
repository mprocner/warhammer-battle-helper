// Geometry and styling of text drawing paths, shared by the canvas (DrawingLayer), the edit field
// (SceneViewport) and the rotate handle, so all three agree on where a label's box is.
//
// Model: points[0] is the top-left corner of the first line and the rotation pivot. Lines are
// separated by '\n' and stacked LINE_HEIGHT × fontSize apart. Rotation is in degrees, clockwise
// (canvas convention).

export const LINE_HEIGHT = 1.2;
export const TEXT_FONT_SIZE_MIN = 10;
export const TEXT_FONT_SIZE_MAX = 96;
export const BOX_PADDING = 4;

// Ids are what the server stores and validates; the CSS families stay client-side.
export const TEXT_FONTS = [
  { id: 'sans', labelKey: 'scenes.textFont_sans', css: "'Roboto', sans-serif" },
  { id: 'serif', labelKey: 'scenes.textFont_serif', css: "'Crimson Text', Georgia, serif" },
  { id: 'display', labelKey: 'scenes.textFont_display', css: "'Cinzel', serif" },
  { id: 'gothic', labelKey: 'scenes.textFont_gothic', css: "'Grenze', serif" },
  { id: 'mono', labelKey: 'scenes.textFont_mono', css: "ui-monospace, Menlo, Consolas, monospace" },
];

export const TEXT_BACKDROPS = ['none', 'outline', 'box'];

export const DEFAULT_TEXT_STYLE = {
  fontSize: 16,
  fontFamily: 'sans',
  bold: false,
  italic: false,
  rotation: 0,
  textBackdrop: 'none',
  // '' = automatic: black or white, whichever contrasts with the text colour.
  backdropColor: '',
};

// The style fields a text path carries besides colour. Colour is shared with the other tools, so
// it travels separately.
export const TEXT_STYLE_KEYS = Object.keys(DEFAULT_TEXT_STYLE);

export function pickTextStyle(path) {
  const style = {};
  TEXT_STYLE_KEYS.forEach((k) => { style[k] = path?.[k] ?? DEFAULT_TEXT_STYLE[k]; });
  return style;
}

const fontCssFor = (id) => (TEXT_FONTS.find(f => f.id === id) || TEXT_FONTS[0]).css;

export function textFontCss({ fontFamily, fontSize, bold, italic }) {
  const size = fontSize || DEFAULT_TEXT_STYLE.fontSize;
  return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${fontCssFor(fontFamily)}`;
}

export const textLines = (text) => (text || '').split('\n');

// Folds an angle into (-180, 180] — the same rule as the server's normalizeRotation.
export function normalizeRotation(deg) {
  if (!Number.isFinite(deg)) return 0;
  let r = deg % 360;
  if (r <= -180) r += 360;
  else if (r > 180) r -= 360;
  return r;
}

// One shared offscreen context for measuring. jsdom has no canvas, so the first failed attempt
// switches to an estimate for good instead of retrying (and logging) on every call.
let measureCtx;
function measureContext() {
  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement('canvas').getContext('2d') || null;
    } catch {
      measureCtx = null;
    }
  }
  return measureCtx;
}

function defaultMeasure(line, font, fontSize) {
  const ctx = measureContext();
  if (!ctx) return line.length * fontSize * 0.6;
  ctx.font = font;
  return ctx.measureText(line).width;
}

// Unrotated size of the label's text block, in scene px.
export function measureTextBox(path, measure = defaultMeasure) {
  const fontSize = path.fontSize || DEFAULT_TEXT_STYLE.fontSize;
  const font = textFontCss(path);
  const lines = textLines(path.text);
  const width = Math.max(0, ...lines.map(l => measure(l, font, fontSize)));
  const lineHeight = fontSize * LINE_HEIGHT;
  return { width, height: lines.length * lineHeight, lineHeight, lines };
}

const toRad = (deg) => (deg || 0) * Math.PI / 180;

// Scene point → the label's own frame (origin at the anchor, x along the text).
export function toTextLocal(path, px, py) {
  const [ax, ay] = path.points[0];
  const a = toRad(path.rotation);
  const dx = px - ax;
  const dy = py - ay;
  return [dx * Math.cos(a) + dy * Math.sin(a), -dx * Math.sin(a) + dy * Math.cos(a)];
}

// The label's own frame → scene point.
export function fromTextLocal(path, lx, ly) {
  const [ax, ay] = path.points[0];
  const a = toRad(path.rotation);
  return [ax + lx * Math.cos(a) - ly * Math.sin(a), ay + lx * Math.sin(a) + ly * Math.cos(a)];
}

export function hitTestText(path, px, py, tolerance = 4, measure = defaultMeasure) {
  if (!path?.points?.length || !path.text) return false;
  const { width, height } = measureTextBox(path, measure);
  const pad = tolerance + (path.textBackdrop === 'box' ? BOX_PADDING : 0);
  const [lx, ly] = toTextLocal(path, px, py);
  return lx >= -pad && lx <= width + pad && ly >= -pad && ly <= height + pad;
}

// The label's hit box (the same one hitTestText uses) as four scene points, clockwise from the
// anchor. Selection by marquee and the group bounds use it, so a rotated label is not reduced to
// its unrotated box.
export function textBoxCorners(path, tolerance = 0, measure = defaultMeasure) {
  const { width, height } = measureTextBox(path, measure);
  const pad = tolerance + (path.textBackdrop === 'box' ? BOX_PADDING : 0);
  return [
    fromTextLocal(path, -pad, -pad),
    fromTextLocal(path, width + pad, -pad),
    fromTextLocal(path, width + pad, height + pad),
    fromTextLocal(path, -pad, height + pad),
  ];
}

// Where the rotate handle sits: just past the end of the first line, along the text direction.
export const ROTATE_HANDLE_GAP = 18;
export function rotateHandlePoint(path, measure = defaultMeasure) {
  const { width, lineHeight } = measureTextBox(path, measure);
  return fromTextLocal(path, width + ROTATE_HANDLE_GAP, lineHeight / 2);
}

// Black for light text, white for dark — the halo/box must contrast with the text itself, not
// with the map, because the map under a label can be anything.
export function backdropColorOf(path) {
  return path.backdropColor || contrastColor(path.color);
}

export function contrastColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#000000';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

// Draws a label onto ctx. The glyph top sits half a leading below each line's top, which is where
// a <textarea> with the same line-height puts it — the edit field and the canvas line up.
export function drawText(ctx, path, measure = defaultMeasure) {
  if (!path?.points?.length || !path.text) return;
  const fontSize = path.fontSize || DEFAULT_TEXT_STYLE.fontSize;
  const { width, height, lineHeight, lines } = measureTextBox(path, measure);
  const [ax, ay] = path.points[0];
  const color = path.color || '#ff0000';
  const contrast = backdropColorOf({ ...path, color });
  const halfLeading = (lineHeight - fontSize) / 2;

  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(toRad(path.rotation));
  ctx.font = textFontCss(path);
  ctx.textBaseline = 'top';

  if (path.textBackdrop === 'box') {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = contrast;
    ctx.fillRect(-BOX_PADDING, -BOX_PADDING, width + BOX_PADDING * 2, height + BOX_PADDING * 2);
    ctx.restore();
  }
  if (path.textBackdrop === 'outline') {
    ctx.strokeStyle = contrast;
    ctx.lineWidth = Math.max(3, fontSize / 8);
    ctx.lineJoin = 'round';
    lines.forEach((line, i) => ctx.strokeText(line, 0, i * lineHeight + halfLeading));
  }
  ctx.fillStyle = color;
  lines.forEach((line, i) => ctx.fillText(line, 0, i * lineHeight + halfLeading));
  ctx.restore();
}

// Selection/hover frame around a label, in its own rotated frame.
export function drawTextHighlight(ctx, path, measure = defaultMeasure) {
  if (!path?.points?.length || !path.text) return;
  const { width, height } = measureTextBox(path, measure);
  const pad = 3 + (path.textBackdrop === 'box' ? BOX_PADDING : 0);
  const [ax, ay] = path.points[0];
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(toRad(path.rotation));
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-pad, -pad, width + pad * 2, height + pad * 2);
  ctx.restore();
}

// Fonts the canvas may not have yet. Canvas fillText with an unloaded face silently draws the
// fallback and never repaints by itself, so DrawingLayer awaits this and redraws.
const FONT_LOADERS = {
  sans: () => Promise.all([
    import('@fontsource/roboto/700.css'),
    import('@fontsource/roboto/400-italic.css'),
    import('@fontsource/roboto/700-italic.css'),
  ]),
  gothic: () => Promise.all([
    import('@fontsource/grenze/400.css'),
    import('@fontsource/grenze/700.css'),
    import('@fontsource/grenze/400-italic.css'),
    import('@fontsource/grenze/700-italic.css'),
  ]),
};

const fontLoads = new Map();
const readyFonts = new Set();
const fontKey = (style) => textFontCss({ ...style, fontSize: 16 });

export const isTextFontReady = (style) => readyFonts.has(fontKey(style));

// Resolves once the face for this style can be drawn. A failed load resolves too (the canvas
// keeps the fallback) and is marked ready, so it is not retried on every paint.
export function ensureTextFont(style) {
  const spec = fontKey(style);
  if (!fontLoads.has(spec)) {
    const css = FONT_LOADERS[style.fontFamily]?.() ?? Promise.resolve();
    fontLoads.set(spec, css
      .then(() => (typeof document !== 'undefined' && document.fonts ? document.fonts.load(spec) : null))
      .catch(() => null)
      .then(() => { readyFonts.add(spec); }));
  }
  return fontLoads.get(spec);
}
