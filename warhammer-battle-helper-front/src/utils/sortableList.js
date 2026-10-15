import { arrayMove } from '@dnd-kit/sortable';

// Helpers shared by the creator's drag-to-reorder lists (attr_table rows, table columns).

// Items only ever move up or down. Written inline rather than pulled from @dnd-kit/modifiers:
// a modifier is a plain transform function, and a new dependency costs a container volume rebuild.
export const lockToVerticalAxis = ({ transform }) => ({ ...transform, x: 0 });

// reorderById moves the dragged item into the slot of the item it was dropped on. Ids, not
// indices, cross the drag boundary: each item's id is unique and stable, so it doubles as the
// dnd-kit item id. idOf names that id — attr rows carry `id`, table columns carry `key`.
// Returns the same array when nothing moves, so the caller can skip a template save.
export function reorderById(items, activeId, overId, idOf = item => item.id) {
  if (!overId || activeId === overId) return items;
  const from = items.findIndex(item => idOf(item) === activeId);
  const to = items.findIndex(item => idOf(item) === overId);
  if (from === -1 || to === -1) return items;
  return arrayMove(items, from, to);
}
