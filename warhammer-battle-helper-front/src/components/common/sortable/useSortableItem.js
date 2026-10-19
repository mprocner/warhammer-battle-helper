import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// useSortableItem wires one item of a SortableList. It is headless: the caller spreads rootProps
// on the node that moves and gripProps on the grip, wherever its layout puts it — in front of a
// row, in a card's head, in a card's action bar. Only the grip starts a drag, because the rest of
// an item is inputs and a whole-item drag would fight text selection. Class names stay with the
// caller; isDragging tells it when to lift the item.
export default function useSortableItem(id) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return {
    rootProps: {
      ref: setNodeRef,
      // Translate, not Transform: the sortable strategy also reports a scale that morphs the
      // dragged item into the size of the slot it hovers, which squashes or stretches items of
      // unequal height. Items only swap places; they never change size.
      style: { transform: CSS.Translate.toString(transform), transition },
    },
    gripProps: { ref: setActivatorNodeRef, ...attributes, ...listeners },
    isDragging,
  };
}
