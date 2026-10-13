import { attrsPerBand, splitBands, ATTR_TABLE_LABEL_COL_PX, ATTR_TABLE_MIN_COL_PX } from './attrTableBands';

describe('attrsPerBand', () => {
  test('unknown width (no ResizeObserver, first render) means one band', () => {
    expect(attrsPerBand(null)).toBe(Infinity);
    expect(attrsPerBand(0)).toBe(Infinity);
  });
  test('fits as many minimum-width columns as the space beside the label column allows', () => {
    expect(attrsPerBand(ATTR_TABLE_LABEL_COL_PX + 5 * ATTR_TABLE_MIN_COL_PX)).toBe(5);
    expect(attrsPerBand(ATTR_TABLE_LABEL_COL_PX + 5 * ATTR_TABLE_MIN_COL_PX - 1)).toBe(4);
  });
  test('never fewer than one column, however narrow', () => {
    expect(attrsPerBand(10)).toBe(1);
  });
});

describe('splitBands', () => {
  const rows = ['a', 'b', 'c', 'd', 'e'];
  test('chunks in order, last band takes the remainder', () => {
    expect(splitBands(rows, 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });
  test('Infinity keeps one band', () => {
    expect(splitBands(rows, Infinity)).toEqual([rows]);
  });
  test('no rows gives no bands', () => {
    expect(splitBands([], 3)).toEqual([]);
  });
});
