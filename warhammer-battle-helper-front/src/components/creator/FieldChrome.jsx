import React from 'react';
import { useTranslation } from 'react-i18next';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

// Edit affordances for one leaf field, injected by CustomSheetBody's renderChrome seam.
//
// Everything here is absolutely positioned inside the field's own bounds. A toolbar above the
// field would either push the grid (and the render would stop being faithful exactly while the
// GM is checking it) or cover the neighbour in the row above — the sheet is a 2D grid of up to
// six columns, so unlike Notion's single-column blocks there is no gutter and no free space.
//
// The pill sits in the top-left corner, the same place SectionChrome puts its own: the `:has()`
// rule in style.css hides every ancestor's pill while a descendant is hovered, so exactly one
// pill is ever on screen and two can never collide. Keeping both in one corner means moving from
// a section onto one of its fields shifts the pill vertically instead of throwing it across the
// node's full width.
function FieldChrome({
  field, selected = false, duplicateKey = false, onSelect, onEdit, onDuplicate, onRemove,
  onMoveUp, onMoveDown, isFirst = false, isLast = false, dragRef, dragProps, depth = 0,
}) {
  const { t } = useTranslation();
  return (
    <>
      <div
        className={`creator__chrome-outline${selected ? ' creator__chrome-outline--selected' : ''}`}
        // Depth decides which outline is hit-tested. Every outline shares one stacking context —
        // .custom-sheet__editable is position:relative with no z-index, and nothing between here
        // and the sheet root creates a context either — so without this they are painted in tree
        // order, and chrome is emitted after its own subtree. That makes an ancestor's outline the
        // topmost element over every descendant: hover and clicks inside a field would be answered
        // by its root section, leaving every field without chrome of its own.
        style={{ zIndex: depth }}
        onClick={e => { e.stopPropagation(); onSelect(); }}
      />
      {duplicateKey && (
        // Outside the hover-gated pill on purpose: a duplicate key means two fields share one
        // value in Character.Stats, and a warning the GM has to hover to find is a warning the
        // GM will not see.
        //
        // A native title rather than the project's portal tooltip: FieldChrome renders once per
        // field, and usePortalTooltip holds state, so the portal pattern would mean one hook and
        // one state per field — the exact cost CustomSheetBody avoids by mounting a single shared
        // instance for the whole sheet. This badge is rare (only a duplicated key) and its meaning
        // is carried by the icon and colour; the tooltip is a bonus, not the message.
        <div className="creator__chrome-dupe" title={t('creator.duplicateKeyWarn')}>
          <WarningAmberIcon style={{ fontSize: 12 }} />
        </div>
      )}
      <div className="creator__chrome">
        <span
          ref={dragRef}
          className="creator__chrome-btn creator__chrome-btn--drag"
          aria-label={t('creator.chromeDrag')}
          {...dragProps}
        >
          <DragIndicatorIcon style={{ fontSize: 13 }} />
        </span>
        <button
          className="creator__chrome-btn"
          aria-label={t('creator.chromeMoveUp')}
          disabled={isFirst}
          onClick={e => { e.stopPropagation(); onMoveUp(); }}
        >
          <ArrowUpwardIcon style={{ fontSize: 13 }} />
        </button>
        <button
          className="creator__chrome-btn"
          aria-label={t('creator.chromeMoveDown')}
          disabled={isLast}
          onClick={e => { e.stopPropagation(); onMoveDown(); }}
        >
          <ArrowDownwardIcon style={{ fontSize: 13 }} />
        </button>
        <button
          className="creator__chrome-btn"
          aria-label={t('creator.chromeEdit')}
          onClick={e => { e.stopPropagation(); onEdit(); }}
        >
          <EditIcon style={{ fontSize: 13 }} />
        </button>
        <button
          className="creator__chrome-btn"
          aria-label={t('creator.fieldDuplicate')}
          onClick={e => { e.stopPropagation(); onDuplicate(); }}
        >
          <ContentCopyIcon style={{ fontSize: 13 }} />
        </button>
        <button
          className="creator__chrome-btn creator__chrome-btn--danger"
          aria-label={t('creator.fieldDelete')}
          onClick={e => { e.stopPropagation(); onRemove(); }}
        >
          <DeleteIcon style={{ fontSize: 13 }} />
        </button>
      </div>
    </>
  );
}

export default FieldChrome;
