import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import HandoutItem from './HandoutItem';
import HandoutItemPhantom from './HandoutItemPhantom';

const HandoutUngroupedSection = React.forwardRef(function HandoutUngroupedSection(
  { handouts, isGM, activeHandout, activeFolderId, dragOverState, onView, onEdit, onDelete },
  ref
) {
  const { t } = useTranslation();
  const { setNodeRef, isOver: isOverUngrouped } = useDroppable({
    id: 'ungrouped',
    data: { type: 'folder', folderId: null },
  });

  const combinedRef = useCallback((el) => {
    setNodeRef(el);
    if (ref) ref.current = el;
  }, [setNodeRef, ref]);

  const isEmpty = handouts.length === 0;
  const isDraggingFromFolder = activeHandout !== null && activeFolderId !== null;

  return (
    <div
      ref={combinedRef}
      className={[
        'handouts-tab__ungrouped',
        isEmpty ? 'handouts-tab__ungrouped--empty' : '',
        isOverUngrouped ? 'handouts-tab__ungrouped--drag-over' : '',
        isDraggingFromFolder ? 'handouts-tab__ungrouped--active-drag' : '',
      ].filter(Boolean).join(' ')}
    >
      <SortableContext
        items={handouts.map((h) => h.id)}
        strategy={verticalListSortingStrategy}
      >
        {isEmpty ? (
          <span className="handouts-tab__ungrouped-placeholder">
            {isDraggingFromFolder
              ? t('handouts.folders.dropToUngroup')
              : t('handouts.folders.emptyPlaceholder')}
          </span>
        ) : (
          <>
            {handouts.map((handout) => (
              <React.Fragment key={handout.id}>
                {dragOverState?.targetFolderId === null &&
                  activeHandout !== null &&
                  dragOverState?.insertBeforeId === handout.id && (
                    <HandoutItemPhantom handout={activeHandout} isGM={isGM} />
                  )}
                <HandoutItem
                  handout={handout}
                  isGM={isGM}
                  folderId={null}
                  onView={onView}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              </React.Fragment>
            ))}
            {dragOverState?.targetFolderId === null &&
              activeHandout !== null &&
              dragOverState?.insertBeforeId === null && (
                <HandoutItemPhantom handout={activeHandout} isGM={isGM} />
              )}
          </>
        )}
      </SortableContext>
    </div>
  );
});

export default HandoutUngroupedSection;
