import {
  findDeletablePathAt, pathTouchesRect, selectPathsInRect, pathBounds, groupBounds,
  clampDrawingDelta, translatePath, toggleId, unionIds,
} from './drawingSelection';

// Pozioma linia od (0,y) do (100,y) — hitTestPath ma tolerancję 10, więc
// punkt (50, y) trafia, a (50, y + 500) na pewno nie.
const line = (id, userId, y) => ({
  id,
  userId,
  tool: 'line',
  points: [[0, y], [100, y]],
  brushSize: 3,
});

const mine = path => path.userId === 'me';
const asGM = () => true;

describe('findDeletablePathAt', () => {
  it('zwraca id własnej ścieżki pod kursorem', () => {
    const paths = [line('a', 'me', 50)];
    expect(findDeletablePathAt(paths, 50, 50, mine)).toBe('a');
  });

  it('nie zwraca cudzej ścieżki, gdy nie jesteś GM', () => {
    const paths = [line('a', 'someone-else', 50)];
    expect(findDeletablePathAt(paths, 50, 50, mine)).toBeNull();
  });

  it('przeskakuje cudzą ścieżkę na wierzchu i sięga po własną pod spodem', () => {
    const paths = [line('own', 'me', 50), line('theirs', 'someone-else', 50)];
    expect(findDeletablePathAt(paths, 50, 50, mine)).toBe('own');
  });

  it('pozwala GM-owi skasować cudzą ścieżkę', () => {
    const paths = [line('theirs', 'someone-else', 50)];
    expect(findDeletablePathAt(paths, 50, 50, asGM)).toBe('theirs');
  });

  it('zwraca null, gdy pod kursorem nic nie ma', () => {
    const paths = [line('a', 'me', 50)];
    expect(findDeletablePathAt(paths, 50, 550, mine)).toBeNull();
  });

  it('przy dwóch własnych nachodzących zwraca tę dodaną później', () => {
    const paths = [line('older', 'me', 50), line('newer', 'me', 50)];
    expect(findDeletablePathAt(paths, 50, 50, mine)).toBe('newer');
  });
});

// Marquee rect used by most cases below: (100,100) → (200,200).
const box = { x: 100, y: 100, width: 100, height: 100 };

describe('pathTouchesRect', () => {
  const cases = [
    ['line crossing the marquee', { tool: 'line', points: [[50, 150], [250, 150]] }, true],
    ['line wholly inside', { tool: 'line', points: [[120, 120], [180, 180]] }, true],
    ['line beside it', { tool: 'line', points: [[300, 0], [300, 400]] }, false],
    ['arrow clipping a corner', { tool: 'arrow', points: [[90, 150], [150, 90]] }, true],
    ['freehand whose middle segment crosses', { tool: 'freehand', points: [[0, 0], [0, 150], [400, 150], [400, 0]] }, true],
    ['freehand around the marquee', { tool: 'freehand', points: [[0, 0], [400, 0], [400, 400], [0, 400]] }, false],
    ['rect whose edge crosses', { tool: 'rect', points: [[150, 150], [300, 300]] }, true],
    ['rect enclosing the marquee — the stroke never reaches it', { tool: 'rect', points: [[0, 0], [400, 400]] }, false],
    ['circle whose ring crosses the corners', { tool: 'circle', points: [[150, 150], [150, 210]] }, true],
    ['circle enclosing the marquee', { tool: 'circle', points: [[150, 150], [150, 450]] }, false],
    ['circle inside the marquee', { tool: 'circle', points: [[150, 150], [150, 160]] }, true],
    ['circle beside it', { tool: 'circle', points: [[400, 400], [400, 420]] }, false],
  ];
  it.each(cases)('%s', (_, path, want) => {
    expect(pathTouchesRect({ brushSize: 3, ...path }, box, 0)).toBe(want);
  });

  it('accepts a marquee dragged up-left (negative size)', () => {
    const path = { tool: 'line', points: [[120, 120], [180, 180]] };
    expect(pathTouchesRect(path, { x: 200, y: 200, width: -100, height: -100 }, 0)).toBe(true);
  });

  it('counts the tolerance as part of the marquee', () => {
    const path = { tool: 'line', points: [[205, 0], [205, 400]] };
    expect(pathTouchesRect(path, box, 0)).toBe(false);
    expect(pathTouchesRect(path, box, 10)).toBe(true);
  });

  // jsdom has no canvas: drawingText measures 0.6 × fontSize per character, so 'abcd' at 10px is
  // 24 wide and 12 tall.
  const label = (rotation, at = [150, 150]) => ({ tool: 'text', text: 'abcd', fontSize: 10, points: [at], rotation });
  it('catches a label overlapping the marquee', () => {
    expect(pathTouchesRect(label(0, [190, 190]), box, 0)).toBe(true);
  });
  it('misses a label beside it', () => {
    expect(pathTouchesRect(label(0, [300, 300]), box, 0)).toBe(false);
  });
  it('follows the rotation of a label', () => {
    // Rotated 90°, the label runs downward from its anchor: (205,110) → x 193..205, y 110..134.
    expect(pathTouchesRect(label(0, [205, 110]), box, 0)).toBe(false);
    expect(pathTouchesRect(label(90, [205, 110]), box, 0)).toBe(true);
  });
  it('catches a marquee inside a big label', () => {
    const big = { tool: 'text', text: 'abcdefghij', fontSize: 100, points: [[0, 0]], rotation: 0 };
    expect(pathTouchesRect(big, { x: 10, y: 10, width: 5, height: 5 }, 0)).toBe(true);
  });
});

describe('selectPathsInRect', () => {
  it('returns the touched paths the user may select, in scene order', () => {
    const paths = [
      { id: 'a', userId: 'me', tool: 'line', points: [[120, 120], [130, 130]] },
      { id: 'b', userId: 'them', tool: 'line', points: [[120, 120], [130, 130]] },
      { id: 'c', userId: 'me', tool: 'line', points: [[500, 500], [600, 600]] },
      { id: 'd', userId: 'me', tool: 'line', points: [[150, 150], [160, 160]] },
    ];
    expect(selectPathsInRect(paths, box, mine)).toEqual(['a', 'd']);
  });
});

describe('pathBounds / groupBounds', () => {
  it('pads a stroke by half its width', () => {
    expect(pathBounds({ tool: 'line', brushSize: 4, points: [[10, 20], [30, 5]] }))
      .toEqual({ x: 8, y: 3, width: 24, height: 19 });
  });
  it('covers the whole circle, not its two points', () => {
    expect(pathBounds({ tool: 'circle', brushSize: 2, points: [[50, 50], [50, 60]] }))
      .toEqual({ x: 39, y: 39, width: 22, height: 22 });
  });
  it('covers a label box', () => {
    expect(pathBounds({ tool: 'text', text: 'abcd', fontSize: 10, points: [[0, 0]], rotation: 0 }))
      .toEqual({ x: 0, y: 0, width: 24, height: 12 });
  });
  it('joins several paths and ignores an empty list', () => {
    const a = { tool: 'line', brushSize: 0, points: [[0, 0], [10, 10]] };
    const b = { tool: 'line', brushSize: 0, points: [[50, 40], [60, 45]] };
    expect(groupBounds([a, b])).toEqual({ x: 0, y: 0, width: 60, height: 45 });
    expect(groupBounds([])).toBeNull();
  });
});

describe('clampDrawingDelta', () => {
  const bbox = { x: 10, y: 20, width: 30, height: 40 };
  const canvas = { width: 100, height: 100 };
  it('passes a delta that stays inside', () => {
    expect(clampDrawingDelta({ dx: 5, dy: -5 }, bbox, canvas)).toEqual({ dx: 5, dy: -5 });
  });
  it('stops the group at each edge, keeping its layout', () => {
    expect(clampDrawingDelta({ dx: -50, dy: 0 }, bbox, canvas)).toEqual({ dx: -10, dy: 0 });
    expect(clampDrawingDelta({ dx: 100, dy: 0 }, bbox, canvas)).toEqual({ dx: 60, dy: 0 });
    expect(clampDrawingDelta({ dx: 0, dy: -50 }, bbox, canvas)).toEqual({ dx: 0, dy: -20 });
    expect(clampDrawingDelta({ dx: 0, dy: 100 }, bbox, canvas)).toEqual({ dx: 0, dy: 40 });
  });
  it('without a canvas size it leaves the delta alone', () => {
    expect(clampDrawingDelta({ dx: -500, dy: 0 }, bbox, null)).toEqual({ dx: -500, dy: 0 });
  });
});

describe('translatePath', () => {
  it('shifts every point and leaves the rest of the path (and the input) intact', () => {
    const path = { id: 'a', tool: 'text', rotation: 45, points: [[1, 2]] };
    expect(translatePath(path, 10, -2)).toEqual({ id: 'a', tool: 'text', rotation: 45, points: [[11, 0]] });
    expect(path.points).toEqual([[1, 2]]);
  });
});

describe('toggleId / unionIds', () => {
  it('adds a missing id and removes a present one', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
  });
  it('joins without repeats, keeping the first order', () => {
    expect(unionIds(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });
});
