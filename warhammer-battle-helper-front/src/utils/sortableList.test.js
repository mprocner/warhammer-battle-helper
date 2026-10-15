import { reorderById, lockToVerticalAxis } from './sortableList';

describe('reorderById', () => {
  const three = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  test('moves the dragged item to the slot of the item it was dropped on', () => {
    expect(reorderById(three, 'a', 'c').map(r => r.id)).toEqual(['b', 'c', 'a']);
    expect(reorderById(three, 'c', 'a').map(r => r.id)).toEqual(['c', 'a', 'b']);
  });

  test('a drop outside the list or on itself changes nothing', () => {
    expect(reorderById(three, 'a', null)).toBe(three);
    expect(reorderById(three, 'b', 'b')).toBe(three);
    expect(reorderById(three, 'a', 'gone')).toBe(three);
  });

  test('reads the id through idOf', () => {
    const cols = [{ key: 'x' }, { key: 'y' }];
    expect(reorderById(cols, 'y', 'x', c => c.key).map(c => c.key)).toEqual(['y', 'x']);
  });
});

test('lockToVerticalAxis drops the horizontal part of a drag', () => {
  expect(lockToVerticalAxis({ transform: { x: 40, y: 12, scaleX: 1, scaleY: 1 } }))
    .toEqual({ x: 0, y: 12, scaleX: 1, scaleY: 1 });
});
