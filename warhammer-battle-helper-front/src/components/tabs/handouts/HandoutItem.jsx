import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import HandoutTypeIcon from './HandoutTypeIcon';
import './HandoutItem.css';

/**
 * Individual handout card component with drag-and-drop support
 */
const HandoutItem = ({
  handout,
  isGM,
  onView,
  onEdit,
  onDelete
}) => {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: handout.id, disabled: !isGM });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const getVisibilityLabel = () => {
    if (!handout.visibility || handout.visibility.length === 0) return '';

    if (handout.visibility.includes('all')) {
      return t('handouts.visibleToAll');
    }
    if (handout.visibility.includes('gm-only')) {
      return t('handouts.gmOnly');
    }
    return t('handouts.selectedPlayers', { count: handout.visibility.length });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`handout-item ${isDragging ? 'handout-item--dragging' : ''}`}
    >
      {/* Drag Handle (GM only) */}
      {isGM && (
        <div className="handout-item__drag-handle" {...attributes} {...listeners}>
          <span className="drag-icon">⋮⋮</span>
        </div>
      )}

      {/* Content */}
      <div className="handout-item__content" onClick={() => onView(handout)}>
        <div className="handout-item__icon">
          <HandoutTypeIcon type={handout.type} />
        </div>
        <div className="handout-item__info">
          <h4 className="handout-item__title">{handout.title}</h4>
          {/* Visibility on second line (GM only) */}
          {isGM && (
            <div className="handout-item__visibility">
              {getVisibilityLabel()}
            </div>
          )}
        </div>
      </div>

      {/* Actions (GM only) */}
      {isGM && (
        <div className="handout-item__actions">
          <button
            className="handout-item__btn handout-item__btn--edit"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(handout);
            }}
            title={t('common.edit')}
          >
            ✏️
          </button>
          <button
            className="handout-item__btn handout-item__btn--delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(handout);
            }}
            title={t('common.delete')}
          >
            🗑️
          </button>
        </div>
      )}
    </div>
  );
};

export default HandoutItem;
