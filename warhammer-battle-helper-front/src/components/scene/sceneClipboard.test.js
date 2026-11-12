import { buildClipboard, pastePositions } from './sceneClipboard';

const img = (id, x, y, width = 50, height = 50) => ({ id, x, y, width, height });
const images = [img('a', 100, 100), img('b', 200, 150, 100, 50), img('c', 500, 500)];

describe('buildClipboard', () => {
  test('keeps the selected images and their layout relative to the group box', () => {
    const clip = buildClipboard('s1', [{ kind: 'image', id: 'a' }, { kind: 'image', id: 'b' }], images);
    expect(clip.sourceSceneId).toBe('s1');
    expect(clip.box).toEqual({ x: 100, y: 100, width: 200, height: 100 });
    expect(clip.items).toEqual([{ imageId: 'a', dx: 0, dy: 0 }, { imageId: 'b', dx: 100, dy: 50 }]);
  });

  test('character tokens are not copied', () => {
    const clip = buildClipboard('s1', [{ kind: 'char', id: 'x' }, { kind: 'image', id: 'a' }], images);
    expect(clip.items.map(i => i.imageId)).toEqual(['a']);
  });

  test('a selection without images gives nothing to copy', () => {
    expect(buildClipboard('s1', [{ kind: 'char', id: 'x' }], images)).toBeNull();
    expect(buildClipboard('s1', [], images)).toBeNull();
  });

  test('an image that vanished meanwhile is skipped', () => {
    const clip = buildClipboard('s1', [{ kind: 'image', id: 'gone' }, { kind: 'image', id: 'c' }], images);
    expect(clip.items).toEqual([{ imageId: 'c', dx: 0, dy: 0 }]);
  });
});

describe('pastePositions', () => {
  const clip = buildClipboard('s1', [{ kind: 'image', id: 'a' }, { kind: 'image', id: 'b' }], images);

  test('centres the group under the cursor and keeps its layout', () => {
    expect(pastePositions(clip, { x: 400, y: 300 }, { snap: false, cellSize: 50 })).toEqual([
      { imageId: 'a', x: 300, y: 250 },
      { imageId: 'b', x: 400, y: 300 },
    ]);
  });

  test('in snap mode the group lands on a cell corner', () => {
    expect(pastePositions(clip, { x: 412, y: 318 }, { snap: true, cellSize: 50 })).toEqual([
      { imageId: 'a', x: 300, y: 250 },
      { imageId: 'b', x: 400, y: 300 },
    ]);
  });

  test('without a cursor over the map the copy lands next to the original, like duplicate', () => {
    expect(pastePositions(clip, null, { snap: false, cellSize: 50 })).toEqual([
      { imageId: 'a', x: 130, y: 130 },
      { imageId: 'b', x: 230, y: 180 },
    ]);
  });
});
