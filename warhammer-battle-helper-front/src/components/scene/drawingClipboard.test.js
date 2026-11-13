import { buildDrawingClipboard, pasteDrawingRequests } from './drawingClipboard';

const line = (id, x, y) => ({ id, userId: 'u1', tool: 'line', brushSize: 0, color: '#123456', points: [[x, y], [x + 10, y + 10]] });

describe('buildDrawingClipboard', () => {
  test('copies the selected paths in scene order, without id and owner', () => {
    const clip = buildDrawingClipboard('s1', ['b', 'a'], [line('a', 0, 0), line('x', 500, 500), line('b', 40, 20)]);
    expect(clip.sourceSceneId).toBe('s1');
    expect(clip.box).toEqual({ x: 0, y: 0, width: 50, height: 30 });
    expect(clip.paths).toEqual([
      { tool: 'line', brushSize: 0, color: '#123456', points: [[0, 0], [10, 10]] },
      { tool: 'line', brushSize: 0, color: '#123456', points: [[40, 20], [50, 30]] },
    ]);
  });

  test('is null when nothing selected is on the scene', () => {
    expect(buildDrawingClipboard('s1', ['gone'], [line('a', 0, 0)])).toBeNull();
    expect(buildDrawingClipboard('s1', [], [line('a', 0, 0)])).toBeNull();
  });
});

describe('pasteDrawingRequests', () => {
  const clip = buildDrawingClipboard('s1', ['a', 'b'], [line('a', 0, 0), line('b', 40, 20)]);
  const canvas = { width: 1000, height: 1000 };

  test('centres the group under the cursor and keeps its layout', () => {
    const [a, b] = pasteDrawingRequests(clip, { x: 500, y: 400 }, canvas);
    expect(a.points).toEqual([[475, 385], [485, 395]]);
    expect(b.points).toEqual([[515, 405], [525, 415]]);
  });

  test('without a cursor the copy cascades next to the original', () => {
    const [a] = pasteDrawingRequests(clip, null, canvas);
    expect(a.points).toEqual([[30, 30], [40, 40]]);
  });

  test('keeps the pasted group on the canvas', () => {
    const [a, b] = pasteDrawingRequests(clip, { x: 995, y: 5 }, canvas);
    expect(b.points[1]).toEqual([1000, 30]); // right edge of the group on the canvas edge
    expect(a.points[0]).toEqual([950, 0]);
  });
});
