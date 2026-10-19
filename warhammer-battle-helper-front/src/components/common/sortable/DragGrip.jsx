import React, { forwardRef } from 'react';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

// The grip that picks an item up. forwardRef carries useSortableItem's activator ref to the
// button: without it the ref is dropped silently and dnd-kit falls back to the whole item as the
// activator, so keyboard drops return focus to the item instead of the grip.
const DragGrip = forwardRef(function DragGrip({ label, ...rest }, ref) {
  return (
    <button type="button" ref={ref} className="creator__drag-grip" aria-label={label} {...rest}>
      <DragIndicatorIcon style={{ fontSize: 14 }} />
    </button>
  );
});

export default DragGrip;
