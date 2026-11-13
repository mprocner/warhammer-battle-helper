import {
  backdropColorOf, contrastColor, hitTestText, measureTextBox, normalizeRotation, pickTextStyle,
  rotateHandlePoint, textFontCss, toTextLocal, DEFAULT_TEXT_STYLE,
} from './drawingText';

// 10 px per character, whatever the font — keeps the boxes easy to reason about.
const measure = (line) => line.length * 10;

const label = (over = {}) => ({ tool: 'text', points: [[100, 100]], text: 'abcde', fontSize: 20, ...over });

describe('drawingText', () => {
  it('measures the widest line and stacks lines 1.2 × font size apart', () => {
    const box = measureTextBox(label({ text: 'ab\nabcd\na' }), measure);
    expect(box.width).toBe(40);
    expect(box.lineHeight).toBe(24);
    expect(box.height).toBe(72);
  });

  it('hits inside the unrotated box and misses beyond it', () => {
    // Box: x 100..150, y 100..124.
    expect(hitTestText(label(), 140, 110, 0, measure)).toBe(true);
    expect(hitTestText(label(), 160, 110, 0, measure)).toBe(false);
    expect(hitTestText(label(), 140, 130, 0, measure)).toBe(false);
  });

  it('follows the rotation: at 90° the label runs down from its anchor', () => {
    const rotated = label({ rotation: 90 });
    expect(hitTestText(rotated, 90, 140, 0, measure)).toBe(true);
    expect(hitTestText(rotated, 140, 110, 0, measure)).toBe(false);
  });

  it('maps a scene point into the label frame', () => {
    const [lx, ly] = toTextLocal(label({ rotation: 90 }), 100, 130);
    expect(lx).toBeCloseTo(30);
    expect(ly).toBeCloseTo(0);
  });

  it('places the rotate handle past the end of the first line, along the text', () => {
    const [x, y] = rotateHandlePoint(label(), measure);
    expect(x).toBeCloseTo(100 + 50 + 18);
    expect(y).toBeCloseTo(112);
  });

  it('folds rotation into (-180, 180] like the server', () => {
    expect(normalizeRotation(270)).toBe(-90);
    expect(normalizeRotation(-180)).toBe(180);
    expect(normalizeRotation(NaN)).toBe(0);
  });

  it('builds the canvas font from the style', () => {
    expect(textFontCss({ fontFamily: 'display', fontSize: 24, bold: true, italic: true }))
      .toBe("italic bold 24px 'Cinzel', serif");
    expect(textFontCss({ fontFamily: 'nope' })).toBe("16px 'Roboto', sans-serif");
  });

  it('picks a contrasting halo colour', () => {
    expect(contrastColor('#ffea00')).toBe('#000000');
    expect(contrastColor('#2979ff')).toBe('#ffffff');
    expect(contrastColor('garbage')).toBe('#000000');
  });

  it('uses the chosen backdrop colour, or the contrasting one when none is chosen', () => {
    expect(backdropColorOf({ color: '#ffea00', backdropColor: '#2979ff' })).toBe('#2979ff');
    expect(backdropColorOf({ color: '#ffea00', backdropColor: '' })).toBe('#000000');
  });

  it('fills missing style fields with the defaults', () => {
    expect(pickTextStyle({ fontSize: 30 })).toEqual({ ...DEFAULT_TEXT_STYLE, fontSize: 30 });
  });
});
