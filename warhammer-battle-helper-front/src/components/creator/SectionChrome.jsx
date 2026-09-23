import React from 'react';
import { useTranslation } from 'react-i18next';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

// Edit affordances for a section, at every depth.
//
// Positioned against the SECTION BOX, never against its heading: CustomSheetBody renders the
// heading only when section.title is set, and a title-less section is a normal state in the
// creator (makeDefaultSection starts with title: ''). Anchoring to the heading would leave
// exactly those sections without a drag handle and without "add field".
//
// Top-left corner, the same as FieldChrome — see the note there.
function SectionChrome({
  section, selected = false, onSelect, onEdit, onAddField, onDuplicate, onRemove,
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
          aria-label={t('creator.chromeAddField')}
          onClick={e => { e.stopPropagation(); onAddField(); }}
        >
          <AddIcon style={{ fontSize: 13 }} />
        </button>
        <button
          className="creator__chrome-btn"
          aria-label={t('creator.sectionDuplicate')}
          onClick={e => { e.stopPropagation(); onDuplicate(); }}
        >
          <ContentCopyIcon style={{ fontSize: 13 }} />
        </button>
        <button
          className="creator__chrome-btn creator__chrome-btn--danger"
          aria-label={t('creator.sectionDelete')}
          onClick={e => { e.stopPropagation(); onRemove(); }}
        >
          <DeleteIcon style={{ fontSize: 13 }} />
        </button>
      </div>
    </>
  );
}

export default SectionChrome;
