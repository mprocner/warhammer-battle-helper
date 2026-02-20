import React, { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import HandoutItem from './HandoutItem';
import HandoutItemPhantom from './HandoutItemPhantom';
import './HandoutFolderSection.css';

/**
 * Accordion section for a handout folder (or ungrouped handouts).
 * folder === null means "ungrouped" (not sortable, always last).
 *
 * DnD roles:
 *  - useSortable  → folder reordering (grip handle, GM only, named folders only)
 *  - useDroppable → handout drop target (whole section, always active)
 */
const HandoutFolderSection = ({
  folder,
  handouts,
  isGM,
  isExpanded,
  onToggle,
  onView,
  onEdit,
  onDelete,
  onAddHandout,
  onRenameFolder,
  onDeleteFolder,
  phantomHandout,
  insertPhantomBeforeId,
}) => {
  const { t } = useTranslation();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [addTooltip, setAddTooltip] = useState(null);
  const addBtnRef = useRef(null);
  const addHideTimeout = useRef(null);

  const showAddTooltip = useCallback(() => {
    clearTimeout(addHideTimeout.current);
    const el = addBtnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setAddTooltip({ top: rect.top + rect.height / 2, left: rect.left });
  }, []);

  const hideAddTooltip = useCallback(() => {
    addHideTimeout.current = setTimeout(() => setAddTooltip(null), 100);
  }, []);

  const droppableId = folder ? `folder-${folder.id}` : 'ungrouped';
  const sortableId = folder ? `folder-sort-${folder.id}` : null;
  const folderId = folder ? folder.id : null;

  // ── Sortable (folder reordering) ───────────────────────────────────────
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging: isFolderDragging,
  } = useSortable({
    id: sortableId || '__ungrouped_disabled__',
    disabled: !isGM || !folder,
    data: { type: 'folder-item', folderId },
  });

  const folderStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isFolderDragging ? 0.5 : 1,
  };

  // ── Droppable (handout drop target) ────────────────────────────────────
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: droppableId,
    data: { type: 'folder', folderId },
  });

  // Combine both refs onto the outer container
  const setContainerRef = useCallback(
    (el) => {
      setSortableRef(el);
      setDroppableRef(el);
    },
    [setSortableRef, setDroppableRef]
  );

  // ── Rename helpers ─────────────────────────────────────────────────────
  const name = folder ? folder.name : t('handouts.folders.ungrouped');

  const handleRenameStart = (e) => {
    e.stopPropagation();
    setRenameValue(folder.name);
    setIsRenaming(true);
  };

  const handleRenameSubmit = (e) => {
    if (e?.preventDefault) e.preventDefault();
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== folder.name) {
      onRenameFolder(folder.id, trimmed);
    }
    setIsRenaming(false);
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (window.confirm(t('handouts.folders.confirmDelete', { name: folder.name }))) {
      onDeleteFolder(folder.id);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      ref={setContainerRef}
      style={folder ? folderStyle : undefined}
      className={`handout-folder-section${isOver ? ' handout-folder-section--drag-over' : ''}${isFolderDragging ? ' handout-folder-section--folder-dragging' : ''}`}
    >
      {/* Header */}
      <div className="handout-folder-section__header" onClick={onToggle}>
        {/* Folder drag grip (GM only, named folders only) */}
        {isGM && folder && (
          <div
            className="handout-folder-section__grip"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            title={t('handouts.folders.dragToReorder')}
          >
            ⋮⋮
          </div>
        )}

        <span
          className={`handout-folder-section__chevron${isExpanded ? ' handout-folder-section__chevron--open' : ''}`}
        >
          ▶
        </span>

        {isRenaming ? (
          <form
            className="handout-folder-section__rename-form"
            onSubmit={handleRenameSubmit}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              className="handout-folder-section__rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              onBlur={() => setIsRenaming(false)}
              onKeyDown={(e) => { if (e.key === 'Escape') setIsRenaming(false); }}
            />
          </form>
        ) : (
          <span className="handout-folder-section__name">{name} ({handouts.length})</span>
        )}

        {isGM && folder && (
          <div
            className="handout-folder-section__actions"
            onClick={(e) => e.stopPropagation()}
          >
            {isRenaming ? (
              <button
                className="handout-folder-section__btn handout-folder-section__btn--confirm"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleRenameSubmit}
                title={t('common.confirm')}
              >
                <CheckOutlinedIcon sx={{ fontSize: '0.85rem' }} />
              </button>
            ) : (
              <button
                className="handout-folder-section__btn"
                onClick={handleRenameStart}
                title={t('handouts.folders.rename')}
              >
                <EditOutlinedIcon sx={{ fontSize: '0.85rem' }} />
              </button>
            )}
            <button
              className="handout-folder-section__btn handout-folder-section__btn--delete"
              onClick={handleDeleteClick}
              title={t('handouts.folders.delete')}
            >
              ✕
            </button>
          </div>
        )}

        {isGM && onAddHandout && (
          <button
            ref={addBtnRef}
            className="handout-folder-section__add-btn"
            onClick={(e) => { e.stopPropagation(); onAddHandout(); }}
            onMouseEnter={showAddTooltip}
            onMouseLeave={hideAddTooltip}
          >
            +
          </button>
        )}
      </div>

      {addTooltip && createPortal(
        <div
          className="handout-item__tooltip"
          style={{ top: addTooltip.top, left: addTooltip.left }}
        >
          {t('handouts.addHandout')}
          <div className="handout-item__tooltip-arrow" />
        </div>,
        document.body
      )}

      {/* Content */}
      {isExpanded && (
        <div className="handout-folder-section__content">
          {handouts.length === 0 && !phantomHandout ? (
            <div className="handout-folder-section__empty">
              {isGM
                ? t('handouts.folders.emptyDrop')
                : t('handouts.folders.emptyPlaceholder')}
            </div>
          ) : (
            <SortableContext
              items={handouts.map((h) => h.id)}
              strategy={verticalListSortingStrategy}
            >
              {handouts.map((handout) => (
                <React.Fragment key={handout.id}>
                  {insertPhantomBeforeId === handout.id && phantomHandout && (
                    <HandoutItemPhantom handout={phantomHandout} isGM={isGM} />
                  )}
                  <HandoutItem
                    handout={handout}
                    isGM={isGM}
                    folderId={folderId}
                    onView={onView}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                </React.Fragment>
              ))}
              {insertPhantomBeforeId === null && phantomHandout && (
                <HandoutItemPhantom handout={phantomHandout} isGM={isGM} />
              )}
            </SortableContext>
          )}
        </div>
      )}
    </div>
  );
};

export default HandoutFolderSection;
